import { AsyncLocalStorage } from "node:async_hooks";
import { Router, type Request, type RequestHandler, type Response } from "express";
import { getAuth } from "@clerk/express";
import type { Prisma, PrismaClient } from "@workspace/prisma";
import { AccountingPeriodError, assertJournalDate, assertMutableJournal, assertOpenAccountingYear, resolveAccountingYear } from "./accounting-period";

type Domain = "journals" | "attachments" | "years" | "templates" | "receipts" | "payments" | "pettyCash";
interface Context {
  tx: Prisma.TransactionClient;
  afterCommit: Array<() => Promise<void>>;
}
const context = new AsyncLocalStorage<Context>();

/** Non-database side effects must only run after a successful commit. */
export function afterAccountingCommit(effect: () => Promise<void>): boolean {
  const current = context.getStore();
  if (!current) return false;
  current.afterCommit.push(effect);
  return true;
}

export function inAccountingTransaction(): boolean {
  return context.getStore() !== undefined;
}

/** Read-only metadata for banking actions; the server always rechecks on write. */
export async function withJournalAccountingState<T extends { journalEntryId?: string | null }>(
  db: PrismaClient, organizationId: string, records: T[],
) {
  const ids = records.flatMap((r) => r.journalEntryId ? [r.journalEntryId] : []);
  if (!ids.length) return records;
  const entries = await db.journalEntry.findMany({
    where: { id: { in: ids }, organizationId, deletedAt: null },
    select: { id: true, type: true, fiscalYear: { select: { status: true } } },
  });
  const states = new Map(entries.map((e) => [e.id, { fiscalYearStatus: e.fiscalYear.status, type: e.type }]));
  return records.map((r) => ({ ...r, accountingState: r.journalEntryId ? states.get(r.journalEntryId) ?? null : null }));
}

function transactionClient(db: PrismaClient): PrismaClient {
  return new Proxy(db, {
    get(target, property) {
      const current = context.getStore();
      if (!current) {
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
      // Existing route helpers already use interactive transactions. Join the
      // outer accounting transaction, rather than starting a second connection.
      if (property === "$transaction") {
        return (work: ((tx: Prisma.TransactionClient) => unknown) | Promise<unknown>[]) =>
          typeof work === "function" ? work(current.tx) : Promise.all(work);
      }
      const value = Reflect.get(current.tx, property);
      return typeof value === "function" ? value.bind(current.tx) : value;
    },
  });
}

async function guard(
  domain: Domain, path: string, req: Request, tx: Prisma.TransactionClient, org: string,
) {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  let original: Awaited<ReturnType<typeof assertMutableJournal>> | undefined;
  if ((domain === "journals" || domain === "attachments") && id) {
    original = await assertMutableJournal(tx, org, id, path.endsWith("/reverse") || path.endsWith("/void"));
  }
  const createsByDate = req.method === "POST" && (
    (domain === "journals" && (!id || path.endsWith("/copy")))
    || (domain === "templates" && path.endsWith("/use"))
  );
  if (createsByDate) {
    const date = domain === "journals" && !id ? req.body?.entryDate : req.body?.entryDate ?? new Date();
    const year = await resolveAccountingYear(tx, org, date, req.body?.fiscalYearId);
    // Freeze default copy/template dates too, including across a midnight/year boundary.
    req.body = { ...req.body, entryDate: date instanceof Date ? date.toISOString() : date, fiscalYearId: year.id };
  }
  if (domain === "journals" && !createsByDate
    && typeof req.body?.fiscalYearId === "string") {
    await assertOpenAccountingYear(tx, org, req.body.fiscalYearId);
  }
  if (domain === "years" && req.method === "PATCH" && id) {
    await assertOpenAccountingYear(tx, org, id);
  }
  // Validate effective values, including PATCH requests supplying just one field.
  // Editing/posting/reversal retain the existing year; only new entries resolve by date.
  if (domain === "journals" && !createsByDate && (
    (!id && req.method === "POST") || req.method === "PATCH"
    || path.endsWith("/post") || path.endsWith("/copy") || path.endsWith("/reverse") || path.endsWith("/void")
  )) {
    const fiscalYearId = req.method === "PATCH" || !id
      ? req.body?.fiscalYearId ?? original?.fiscalYearId : original?.fiscalYearId;
    if (typeof fiscalYearId === "string") {
      const year = await assertOpenAccountingYear(tx, org, fiscalYearId);
      const date = path.endsWith("/reverse") ? req.body?.reverseDate ?? new Date()
        : path.endsWith("/copy") ? req.body?.entryDate ?? new Date()
        : path.endsWith("/post") || path.endsWith("/void") ? original?.entryDate
        : req.body?.entryDate ?? original?.entryDate;
      assertJournalDate(date, year);
    }
  }
  if ((domain === "receipts" || domain === "payments" || domain === "pettyCash") && id) {
    const model = domain === "receipts" ? tx.receipt : domain === "payments" ? tx.payment : tx.pettyCash;
    const voucher = await (model as typeof tx.receipt).findFirst({
      where: domain === "pettyCash"
        ? { id, cashBox: { organizationId: org }, deletedAt: null }
        : { id, organizationId: org, deletedAt: null },
    });
    if (voucher?.journalEntryId) {
      const entry = await assertMutableJournal(tx, org, voucher.journalEntryId, true);
      if (path.endsWith("/void") || (domain === "pettyCash" && req.method === "DELETE")) {
        const year = await assertOpenAccountingYear(tx, org, entry.fiscalYearId);
        assertJournalDate(new Date(), year);
      }
    }
  }
}

/**
 * Accounting routers opt into a single transaction for each mutating endpoint.
 * RBAC middleware remains outside the wrapper and runs first. The organization's
 * transaction-scoped PostgreSQL advisory lock is acquired BEFORE any financial
 * read (including closing aggregation) and held until commit/rollback.
 *
 * The local Prisma facade propagates that transaction to existing route helpers.
 * Responses are buffered until commit; even a handler that catches an exception
 * and returns 4xx/5xx causes rollback, including its earlier writes.
 * GETs, retired /lock, streaming and unrelated routers are not wrapped.
 */
export function createAccountingRouter(domain: Domain, db: PrismaClient) {
  const router = Router({ mergeParams: domain === "attachments" });
  const prisma = transactionClient(db);
  for (const method of ["post", "patch", "delete"] as const) {
    const register = router[method].bind(router);
    router[method] = ((path: string, ...handlers: RequestHandler[]) => {
      if (path.endsWith("/lock")) return register(path, ...handlers);
      const handler = handlers.pop()!;
      const wrapped: RequestHandler = async (req, res, next) => {
        let status = 200;
        let body: unknown;
        const response = { kind: "json" as "json" | "send" | "end" };
        const effects: Array<() => Promise<void>> = [];
        const rejected = new Error("Accounting response rejected");
        const buffered = new Proxy(res, {
          get(target, property) {
            if (property === "status") return (code: number) => { status = code; return buffered; };
            if (property === "statusCode") return status;
            if (property === "json" || property === "send" || property === "end") {
              return (value: unknown) => { body = value; response.kind = property; return buffered; };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as Response;
        try {
          await db.$transaction(async (tx) => {
            const clerkId = getAuth(req).userId;
            const user = clerkId ? await tx.user.findFirst({ where: { clerkId, deletedAt: null } }) : null;
            if (!user) throw new AccountingPeriodError("يلزم تسجيل الدخول.", 401);
            if (!user.organizationId) throw new AccountingPeriodError("حسابك غير مرتبط بمنظمة.");
            // Same lock for close, rollover, manual posting and all auto posting.
            // READ COMMITTED gives the waiting transaction a fresh view after it.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mans-accounting:${user.organizationId}`}, 0))`;
            await context.run({ tx, afterCommit: effects }, async () => {
              await guard(domain, path, req, tx, user.organizationId!);
              await handler(req, buffered, next);
              if (status >= 400) throw rejected;
            });
          }, { isolationLevel: "ReadCommitted", maxWait: 15_000, timeout: 30_000 });
        } catch (error) {
          effects.length = 0;
          if (error instanceof AccountingPeriodError) {
            status = error.status;
            body = { error: error.message };
            response.kind = "json";
          } else if (error !== rejected) {
            req.log?.error({ err: error }, "Accounting transaction failed");
            status = 500;
            body = { error: "تعذر تنفيذ العملية المحاسبية؛ لم تُحفظ أي تغييرات." };
            response.kind = "json";
          }
        }
        // Effects are best-effort, as before; they cannot leak on rollback.
        for (const effect of effects) {
          try { await effect(); } catch (error) { req.log?.error({ err: error }, "Accounting notification failed"); }
        }
        if (response.kind === "end") res.status(status).end();
        else res.status(status)[response.kind](body);
      };
      return register(path, ...handlers, wrapped);
    }) as typeof router[typeof method];
  }
  return { router, prisma };
}
