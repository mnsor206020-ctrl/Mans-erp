/**
 * Actual Express/RBAC/Prisma/transactions on a disposable local PostgreSQL only.
 * Clerk's external identity boundary is substituted; accounting queries are real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { prisma, Prisma } from "@workspace/prisma";
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.get("x-test-identity") ?? null }),
}));
import years from "../routes/fiscal-years";
import journals from "../routes/journal-entries";
const app = express();
app.use(express.json());
app.use("/years", years);
app.use("/journals", journals);
let roleId: string;

async function fixture(baseCurrencyCode = "SAR") {
  const org = await prisma.organization.create({ data: {
    nameEn: `TEST ${randomUUID()}`, nameAr: "اختبار", baseCurrencyCode,
  } });
  const identity = `TEST_${randomUUID()}`;
  const user = await prisma.user.create({ data: {
    clerkId: identity, email: `${identity}@example.invalid`, organizationId: org.id,
    userRoles: { create: { roleId } },
  } });
  const year = await prisma.fiscalYear.create({ data: {
    organizationId: org.id, nameEn: "TEST 2026", nameAr: "اختبار",
    startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
  } });
  const accounts = await Promise.all(([
    ["100", "ASSET", "DEBIT"], ["300", "EQUITY", "CREDIT"],
    ["400", "REVENUE", "CREDIT"], ["500", "EXPENSE", "DEBIT"],
  ] as const).map(([code, type, nature]) => prisma.chartOfAccount.create({ data: {
    organizationId: org.id, code, type, nature, nameEn: `TEST ${code}`, nameAr: "اختبار",
  } })));
  return { org: org.id, user: user.id, identity, year: year.id,
    cash: accounts[0]!.id, equity: accounts[1]!.id, revenue: accounts[2]!.id, expense: accounts[3]!.id };
}
type F = Awaited<ReturnType<typeof fixture>>;
function api(f: F, method: "post" | "patch" | "delete", path: string, body: object = {}) {
  return request(app)[method](path).set("x-test-identity", f.identity).send(body);
}
const close = (f: F) => api(f, "post", `/years/${f.year}/close`, { retainedEarningsAccountId: f.equity });
async function entry(f: F, options: {
  status?: "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "POSTED" | "LOCKED";
  amount?: string; rate?: string; currency?: string; expense?: boolean;
} = {}) {
  const amount = new Prisma.Decimal(options.amount ?? "1500");
  const rate = new Prisma.Decimal(options.rate ?? "1");
  const base = amount.times(rate).toDecimalPlaces(4);
  return prisma.journalEntry.create({ data: {
    organizationId: f.org, fiscalYearId: f.year, number: `TEST-${randomUUID()}`,
    entryDate: new Date("2026-06-01"), status: options.status ?? "POSTED",
    currencyCode: options.currency ?? "SAR", exchangeRate: rate,
    totalDebit: amount, totalCredit: amount, createdByUserId: f.user,
    lines: { create: [
      { lineNumber: 1, accountId: options.expense ? f.expense : f.cash,
        debit: amount, credit: 0, debitBase: base, creditBase: 0 },
      { lineNumber: 2, accountId: options.expense ? f.cash : f.revenue,
        debit: 0, credit: amount, debitBase: 0, creditBase: base },
    ] },
  } });
}
async function snapshot(f: F) {
  return JSON.stringify(await Promise.all([
    prisma.fiscalYear.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" } }),
    prisma.journalEntry.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" },
      include: { lines: { orderBy: { id: "asc" } }, approvals: { orderBy: { id: "asc" } } } }),
    prisma.auditLog.findMany({ where: { userId: f.user }, orderBy: { id: "asc" } }),
  ]));
}
async function rejectsUnchanged(f: F, action: PromiseLike<request.Response>, status = 400) {
  const before = await snapshot(f);
  const result = await action;
  expect(result.status, JSON.stringify(result.body)).toBe(status);
  expect(await snapshot(f)).toBe(before);
  return result;
}
async function savedJournal(id: string) {
  return prisma.journalEntry.findUniqueOrThrow({ where: { id }, include: { lines: true } });
}
async function failureTrigger(f: F, kind: "CLOSING" | "OPENING" | "CLOSE_STATE" | "CANCEL_AUDIT") {
  if (kind === "CLOSE_STATE") {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_close_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id = '${f.year}' AND NEW.status = 'CLOSED' THEN RAISE EXCEPTION 'TEST close failure'; END IF;
      RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_fail BEFORE UPDATE ON fiscal_years FOR EACH ROW EXECUTE FUNCTION test_close_fail()`);
  } else if (kind === "CANCEL_AUDIT") {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_close_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id = '${f.user}' AND NEW.action = 'UPDATE' THEN RAISE EXCEPTION 'TEST audit failure'; END IF;
      RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_close_fail()`);
  } else {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_close_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.line_number = 2 AND EXISTS (SELECT 1 FROM journal_entries WHERE id = NEW.journal_entry_id
      AND organization_id = '${f.org}' AND type = '${kind}') THEN RAISE EXCEPTION 'TEST line failure'; END IF;
      RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_fail BEFORE INSERT ON journal_entry_lines FOR EACH ROW EXECUTE FUNCTION test_close_fail()`);
  }
}
async function dropFailureTrigger() {
  await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS test_close_fail() CASCADE");
}

describe.skipIf(!process.env.MANS_ISOLATION_PGROOT)("closing and rollover in base currency", () => {
  beforeAll(async () => {
    const root = realpathSync(process.env.MANS_ISOLATION_PGROOT!);
    const url = new URL(process.env.DATABASE_URL!);
    if (!root.includes("/.local/organization-isolation-") || !existsSync(join(root, "data", "PG_VERSION"))
      || url.username !== "test_isolation" || url.pathname !== "/mans_erp_isolation"
      || url.searchParams.get("host") !== join(root, "socket")) throw new Error("Unsafe test database");
    expect(await prisma.organization.count()).toBe(0);
    const role = await prisma.role.create({ data: { nameEn: "TEST closing", nameAr: "اختبار" } });
    roleId = role.id;
    for (const resource of ["fiscal_years", "journal_entries"]) {
      for (const action of ["create", "update", "approve", "void", "delete"]) {
        const permission = await prisma.permission.create({ data: { resource, action } });
        await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
      }
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it.each(["DRAFT", "UNDER_REVIEW", "APPROVED"] as const)("blocks closing with a %s entry and leaves all data unchanged", async status => {
    const f = await fixture();
    await entry(f);
    await entry(f, { status });
    const result = await rejectsUnchanged(f, close(f));
    expect(result.body.error).toContain("غير مرحلة");
  });
  it("permits closing after the unused draft is deleted", async () => {
    const f = await fixture();
    await entry(f);
    const draft = await entry(f, { status: "DRAFT" });
    expect((await api(f, "delete", `/journals/${draft.id}`)).status).toBe(200);
    expect((await close(f)).status).toBe(200);
  });
  it("blocks a draft reversal, then includes both original and posted reversal exactly once", async () => {
    const f = await fixture();
    const original = await entry(f);
    await entry(f, { amount: "200" });
    const reverse = await api(f, "post", `/journals/${original.id}/reverse`, { reverseDate: "2026-06-02", reason: "TEST" });
    expect(reverse.status).toBe(200);
    const reversal = await prisma.journalEntry.findFirstOrThrow({ where: { reversalOfEntryId: original.id } });
    expect(reversal.status).toBe("DRAFT");
    expect((await savedJournal(original.id)).status).toBe("REVERSED");
    await rejectsUnchanged(f, close(f));
    for (const action of ["submit", "approve", "post"]) {
      expect((await api(f, "post", `/journals/${reversal.id}/${action}`)).status).toBe(200);
    }
    const result = await close(f);
    expect(result.status).toBe(200);
    expect(result.body.netIncome).toBe(200);
  });
  it.each(["POSTED", "LOCKED"] as const)("cancels a draft reversal and restores the original %s state and audit", async status => {
    const f = await fixture();
    const original = await entry(f, { status });
    expect((await api(f, "post", `/journals/${original.id}/reverse`, { reverseDate: "2026-06-02", reason: "TEST" })).status).toBe(200);
    const reversal = await prisma.journalEntry.findFirstOrThrow({ where: { reversalOfEntryId: original.id } });
    expect((await api(f, "delete", `/journals/${reversal.id}`)).status).toBe(200);
    const restored = await savedJournal(original.id);
    expect(restored.status).toBe(status);
    expect(restored.reversedByEntryId).toBeNull();
    expect(restored.totalDebit.toString()).toBe("1500");
    expect((await savedJournal(reversal.id)).deletedAt).not.toBeNull();
    expect(await prisma.journalEntryApproval.count({ where: { journalEntryId: original.id, action: "CANCEL_REVERSAL" } })).toBe(1);
    expect((await close(f)).body.netIncome).toBe(1500);
  });
  it("rolls back restoring the original and deleting its reversal if the audit fails", async () => {
    const f = await fixture();
    const original = await entry(f);
    await api(f, "post", `/journals/${original.id}/reverse`, { reverseDate: "2026-06-02", reason: "TEST" });
    const reversal = await prisma.journalEntry.findFirstOrThrow({ where: { reversalOfEntryId: original.id } });
    await failureTrigger(f, "CANCEL_AUDIT");
    try { await rejectsUnchanged(f, api(f, "delete", `/journals/${reversal.id}`), 500); }
    finally { await dropFailureTrigger(); }
  });
  it("refuses cancellation without a trustworthy original-state record", async () => {
    const f = await fixture();
    const original = await entry(f);
    await api(f, "post", `/journals/${original.id}/reverse`, { reverseDate: "2026-06-02", reason: "TEST" });
    const reversal = await prisma.journalEntry.findFirstOrThrow({ where: { reversalOfEntryId: original.id } });
    // Synthetic broken legacy relationship only, in the disposable database.
    await prisma.journalEntryApproval.deleteMany({ where: { journalEntryId: original.id, action: "REVERSE" } });
    const result = await rejectsUnchanged(f, api(f, "delete", `/journals/${reversal.id}`));
    expect(result.body.error).toContain("سجل حالته السابقة");
  });
  it("uses base amounts for mixed currencies, carries only permanent balances and preserves source records", async () => {
    const f = await fixture("EUR"); // Detect a hardcoded SAR as well.
    await entry(f, { currency: "USD", rate: "0.9", amount: "1500" }); // 1350 EUR
    await entry(f, { currency: "GBP", rate: "1.2", amount: "100" }); // 120 EUR
    await entry(f, { currency: "USD", rate: "0.9", amount: "200", expense: true }); // 180 EUR
    const source = await prisma.journalEntry.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" }, include: { lines: true } });
    const result = await close(f);
    expect(result.status).toBe(200);
    expect(result.body.netIncome).toBe(1290);
    const closing = await savedJournal(result.body.closingJournalEntryId);
    expect(closing.currencyCode).toBe("EUR");
    expect(closing.exchangeRate.toString()).toBe("1");
    expect(closing.totalDebit.toString()).toBe("1470");
    expect(closing.totalCredit.toString()).toBe("1470");
    expect(closing.lines.find(l => l.accountId === f.revenue)!.debit.toString()).toBe("1470");
    const rollover = await api(f, "post", `/years/${f.year}/rollover`);
    expect(rollover.status).toBe(201);
    const opening = await savedJournal(rollover.body.openingJournalEntryId);
    expect(opening.currencyCode).toBe("EUR");
    expect(opening.totalDebit.toString()).toBe("1290");
    expect(opening.totalCredit.toString()).toBe("1290");
    expect(opening.lines.map(l => l.accountId).sort()).toEqual([f.cash, f.equity].sort());
    for (const line of [...closing.lines, ...opening.lines]) {
      expect(line.debit.equals(line.debitBase)).toBe(true);
      expect(line.credit.equals(line.creditBase)).toBe(true);
    }
    expect(await prisma.journalEntry.findMany({ where: { id: { in: source.map(e => e.id) } }, orderBy: { id: "asc" }, include: { lines: true } })).toEqual(source);
    await rejectsUnchanged(f, close(f));
    await rejectsUnchanged(f, api(f, "post", `/years/${f.year}/rollover`));
  });
  it.each([false, true])("keeps four-decimal precision with many movements (loss=%s)", async loss => {
    const f = await fixture();
    // 101 * 0.0003 = 0.0303, exactly at stored precision, no binary sums.
    for (let i = 0; i < 101; i++) await entry(f, { amount: "0.0001", rate: "3", currency: "USD", expense: loss });
    const result = await close(f);
    expect(result.status).toBe(200);
    expect(result.body.netIncome).toBe(loss ? -0.0303 : 0.0303);
    const closing = await savedJournal(result.body.closingJournalEntryId);
    expect(closing.totalDebit.toFixed(4)).toBe("0.0303");
    expect(closing.totalCredit.toFixed(4)).toBe("0.0303");
    const rollover = await api(f, "post", `/years/${f.year}/rollover`);
    expect(rollover.status).toBe(201);
    const opening = await savedJournal(rollover.body.openingJournalEntryId);
    const sum = (side: "debit" | "credit") => opening.lines.reduce((n, l) => n.plus(l[side]), new Prisma.Decimal(0));
    expect(sum("debit").equals(opening.totalDebit)).toBe(true);
    expect(sum("credit").equals(opening.totalCredit)).toBe(true);
    expect(opening.totalDebit.toFixed(4)).toBe("0.0303");
    expect(opening.lines.find(l => l.accountId === f.cash)![loss ? "credit" : "debit"].toFixed(4)).toBe("0.0303");
  });
  it.each(["CLOSING", "CLOSE_STATE", "OPENING"] as const)("rolls back every write on %s failure", async kind => {
    const f = await fixture();
    await entry(f);
    if (kind === "OPENING") expect((await close(f)).status).toBe(200);
    await failureTrigger(f, kind);
    try { await rejectsUnchanged(f, kind === "OPENING" ? api(f, "post", `/years/${f.year}/rollover`) : close(f), 500); }
    finally { await dropFailureTrigger(); }
  });
  it("enforces organization isolation and RBAC for close and rollover", async () => {
    const f = await fixture();
    const other = await fixture();
    await entry(other);
    const before = await snapshot(other);
    await rejectsUnchanged(f, api(f, "post", `/years/${other.year}/close`, { retainedEarningsAccountId: f.equity }), 404);
    await rejectsUnchanged(f, api(f, "post", `/years/${other.year}/rollover`), 404);
    await entry(f);
    await rejectsUnchanged(f, api(f, "post", `/years/${f.year}/close`, { retainedEarningsAccountId: other.equity }));
    expect(await snapshot(other)).toBe(before);
    const noRole = await prisma.user.create({ data: {
      clerkId: `TEST_${randomUUID()}`, email: `${randomUUID()}@example.invalid`, organizationId: f.org,
    } });
    await rejectsUnchanged(f, request(app).post(`/years/${f.year}/close`).set("x-test-identity", noRole.clerkId!)
      .send({ retainedEarningsAccountId: f.equity }), 403);
  });
  it("resolves new journal years on the server without a fiscalYearId and never silently moves edits", async () => {
    const f = await fixture();
    const body = { entryDate: "2026-06-01", lines: [
      { accountId: f.cash, lineNumber: 1, debit: 100, credit: 0 },
      { accountId: f.revenue, lineNumber: 2, debit: 0, credit: 100 },
    ] };
    const created = await api(f, "post", "/journals", body);
    expect(created.status).toBe(201);
    expect(created.body.fiscalYearId).toBe(f.year);
    expect((await api(f, "patch", `/journals/${created.body.id}`, { descriptionAr: "اختبار التعديل" })).status).toBe(200);
    await rejectsUnchanged(f, api(f, "patch", `/journals/${created.body.id}`, { entryDate: "2027-01-01" }));
    const missing = await rejectsUnchanged(f, api(f, "post", "/journals", { ...body, entryDate: "2030-01-01" }));
    expect(missing.body.error).toContain("لا توجد سنة");
    await api(f, "delete", `/journals/${created.body.id}`);
    await entry(f);
    expect((await close(f)).status).toBe(200);
    const closed = await rejectsUnchanged(f, api(f, "post", "/journals", body));
    expect(closed.body.error).toContain("مقفلة");
  });
});
