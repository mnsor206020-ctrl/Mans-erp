/**
 * Actual Express + Prisma + disposable PostgreSQL. Only Clerk identity is
 * substituted. Run via scripts/test-organization-isolation.mjs, never project DB.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { prisma } from "@workspace/prisma";

vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.get("x-test-identity") ?? null }),
}));
import journals from "../routes/journal-entries";
import years from "../routes/fiscal-years";
import receipts from "../routes/receipts";
import payments from "../routes/payments";
import pettyCash from "../routes/petty-cash";
import templates from "../routes/journal-entry-templates";
import { createAccountingRouter } from "../lib/accounting-transaction";

const app = express();
app.use(express.json());
app.use("/journal-entries", journals);
app.use("/fiscal-years", years);
app.use("/receipts", receipts);
app.use("/payments", payments);
app.use("/petty-cash", pettyCash);
app.use("/templates", templates);
// Exercise rollback even when a legacy handler catches a failure after writing.
const probe = createAccountingRouter("years", prisma);
probe.router.post("/", async (req, res) => {
  await probe.prisma.cashBox.update({ where: { id: req.body.cash }, data: { currentBalance: { increment: 987 } } });
  res.status(400).json({ error: "TEST rejection after write" });
});
probe.router.post("/failure", async (req, res) => {
  try {
    await probe.prisma.cashBox.update({ where: { id: req.body.cash }, data: { currentBalance: { increment: 987 } } });
    // Deliberate unique-constraint failure inside the disposable DB only.
    await probe.prisma.currency.create({ data: { code: "SAR", nameEn: "TEST duplicate", nameAr: "اختبار", symbol: "SAR" } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "TEST database error after write" });
  }
});
app.use("/rollback-probe", probe.router);
let roleId: string;

async function fixture(status: "OPEN" | "CLOSED" = "OPEN") {
  const org = await prisma.organization.create({ data: { nameEn: `TEST ${randomUUID()}`, nameAr: "اختبار معزول" } });
  const identity = `TEST_${randomUUID()}`;
  const user = await prisma.user.create({ data: {
    clerkId: identity, email: `${identity}@example.invalid`, organizationId: org.id,
    userRoles: { create: { roleId } },
  } });
  const fy = await prisma.fiscalYear.create({ data: {
    organizationId: org.id, nameEn: "TEST FY", nameAr: "اختبار",
    startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status,
  } });
  const next = await prisma.fiscalYear.create({ data: {
    organizationId: org.id, nameEn: "TEST next", nameAr: "اختبار",
    startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31"), status: "OPEN",
  } });
  const accounts = [];
  for (const [code, type, nature] of [
    ["100", "ASSET", "DEBIT"], ["300", "EQUITY", "CREDIT"], ["400", "REVENUE", "CREDIT"],
  ] as const) {
    accounts.push(await prisma.chartOfAccount.create({ data: {
      organizationId: org.id, code, type, nature, nameEn: `TEST ${code}`, nameAr: "حساب اختبار",
    } }));
  }
  const [cash, equity, revenue] = accounts as [typeof accounts[number], typeof accounts[number], typeof accounts[number]];
  const box = await prisma.cashBox.create({ data: {
    organizationId: org.id, code: "TEST", nameEn: "TEST Cash", nameAr: "نقد اختبار", currencyCode: "SAR", glAccountId: cash!.id,
  } });
  return { org: org.id, user: user.id, fy: fy.id, next: next.id, cash: cash!.id, equity: equity!.id, revenue: revenue!.id, box: box.id, identity };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function body(f: Fixture, fiscalYearId = f.fy) {
  return { fiscalYearId, entryDate: "2026-06-01", type: "MANUAL", currencyCode: "SAR",
    lines: [
      { accountId: f.cash, lineNumber: 1, debit: 50, credit: 0 },
      { accountId: f.revenue, lineNumber: 2, debit: 0, credit: 50 },
    ] };
}
async function seedEntry(f: Fixture, status: "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "POSTED" | "LOCKED" = "POSTED", type: "MANUAL" | "CLOSING" = "MANUAL") {
  return prisma.journalEntry.create({ data: {
    organizationId: f.org, fiscalYearId: f.fy, number: `TEST-${randomUUID()}`, entryDate: new Date("2026-06-01"),
    status, type, totalDebit: 100, totalCredit: 100, createdByUserId: f.user,
    lines: { create: [
      { accountId: f.cash, lineNumber: 1, debit: 100, credit: 0, debitBase: 100, creditBase: 0 },
      { accountId: f.revenue, lineNumber: 2, debit: 0, credit: 100, debitBase: 0, creditBase: 100 },
    ] },
  } });
}
const api = (f: Fixture) => ({
  post: (url: string, data: object = {}) => request(app).post(url).set("x-test-identity", f.identity).send(data),
  patch: (url: string, data: object = {}) => request(app).patch(url).set("x-test-identity", f.identity).send(data),
  delete: (url: string) => request(app).delete(url).set("x-test-identity", f.identity),
});
async function snapshot(f: Fixture) {
  return JSON.stringify(await Promise.all([
    prisma.journalEntry.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" }, include: { lines: { orderBy: { id: "asc" } }, approvals: { orderBy: { id: "asc" } } } }),
    prisma.fiscalYear.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" } }),
    prisma.cashBox.findMany({ where: { organizationId: f.org } }),
    prisma.receipt.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" } }),
    prisma.payment.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" } }),
    prisma.pettyCash.findMany({ where: { cashBox: { organizationId: f.org } }, orderBy: { id: "asc" } }),
    prisma.auditLog.findMany({ where: { userId: f.user }, orderBy: { id: "asc" } }),
  ]));
}
async function voucher(f: Fixture, kind: "receipts" | "payments") {
  const data = { organizationId: f.org, number: `TEST-${randomUUID()}`, paymentMethod: "CASH" as const, currencyCode: "SAR",
    amount: 50, amountBase: 50, cashBoxId: f.box, glAccountId: f.revenue, createdByUserId: f.user };
  return kind === "receipts"
    ? prisma.receipt.create({ data: { ...data, receiptDate: new Date("2026-06-01") } })
    : prisma.payment.create({ data: { ...data, paymentDate: new Date("2026-06-01") } });
}
async function waitForBlockedLock(minimum = 1) {
  for (let n = 0; n < 100; n++) {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
    if (Number(rows[0]!.count) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Second financial transaction did not wait on the shared lock");
}

// A PostgreSQL trigger pauses a real write while its accounting lock is held.
// No Prisma/query mocks, sleeps in application code, or production test hooks.
async function pauseFinancialWrite(f: Fixture, condition: string) {
  if (!/^[a-f0-9-]{36}$/.test(f.org)
    || !["NEW.type = 'CLOSING'", "NEW.status = 'POSTED' AND NEW.type <> 'CLOSING'"].includes(condition)) {
    throw new Error("Unsafe trigger condition");
  }
  let unlock!: () => void;
  let acquired!: () => void;
  const ready = new Promise<void>((r) => { acquired = r; });
  const gate = new Promise<void>((r) => { unlock = r; });
  const holding = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('TEST-phase2-gate', 0))`;
    acquired(); await gate;
  }, { timeout: 15_000 });
  await ready;
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_phase2_pause() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.organization_id = '${f.org}'::uuid AND (${condition}) THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('TEST-phase2-gate', 0));
      END IF;
      RETURN NEW;
    END $$`);
  await prisma.$executeRawUnsafe("CREATE TRIGGER test_phase2_gate BEFORE INSERT OR UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION test_phase2_pause()");
  return {
    release: unlock,
    async finish() {
      unlock();
      await holding;
      await prisma.$executeRawUnsafe("DROP TRIGGER test_phase2_gate ON journal_entries");
      await prisma.$executeRawUnsafe("DROP FUNCTION test_phase2_pause()");
    },
  };
}

describe.skipIf(!process.env.MANS_ISOLATION_PGROOT)("closed fiscal year: real isolated HTTP transactions", () => {
  beforeAll(async () => {
    const root = realpathSync(process.env.MANS_ISOLATION_PGROOT!);
    const url = new URL(process.env.DATABASE_URL!);
    if (!root.includes("/.local/organization-isolation-") || !existsSync(join(root, "data", "PG_VERSION"))
      || url.pathname !== "/mans_erp_isolation" || url.username !== "test_isolation"
      || url.searchParams.get("host") !== join(root, "socket")) throw new Error("Unsafe test database");
    expect(await prisma.organization.count()).toBe(0);
    await prisma.currency.create({ data: { code: "SAR", nameEn: "TEST SAR", nameAr: "اختبار", symbol: "SAR" } });
    const role = await prisma.role.create({ data: { nameEn: "TEST operator", nameAr: "اختبار" } });
    roleId = role.id;
    for (const resource of ["journal_entries", "fiscal_years", "receipts", "payments", "petty_cash", "attachments"]) {
      for (const action of ["create", "update", "delete", "approve", "void"]) {
        const permission = await prisma.permission.create({ data: { resource, action } });
        await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
      }
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it.each([
    ["patch", "", "DRAFT"], ["delete", "", "DRAFT"], ["post", "/submit", "DRAFT"],
    ["post", "/approve", "UNDER_REVIEW"], ["post", "/reject", "APPROVED"], ["post", "/post", "APPROVED"],
    ["post", "/reverse", "POSTED"], ["post", "/void", "POSTED"], ["post", "/copy", "POSTED"],
    ["post", "/reverse", "LOCKED"],
  ] as const)("CLOSED blocks %s %s (%s), with no row changes", async (method, suffix, status) => {
    const f = await fixture("CLOSED");
    const entry = await seedEntry(f, status);
    const before = await snapshot(f);
    const result = method === "patch"
      ? await api(f).patch(`/journal-entries/${entry.id}`, { descriptionEn: "TEST change", fiscalYearId: f.next })
      : method === "delete" ? await api(f).delete(`/journal-entries/${entry.id}`)
      : await api(f).post(`/journal-entries/${entry.id}${suffix}`, { reason: "TEST", comment: "TEST", voidReason: "TEST" });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("مقفلة");
    expect(await snapshot(f)).toBe(before);
  });
  it("blocks creating in CLOSED and moving from OPEN into CLOSED", async () => {
    const f = await fixture("CLOSED");
    const draft = await seedEntry(f, "DRAFT");
    await prisma.journalEntry.update({ where: { id: draft.id }, data: { fiscalYearId: f.next } });
    const before = await snapshot(f);
    expect((await api(f).post("/journal-entries", body(f))).status).toBe(400);
    expect((await api(f).patch(`/journal-entries/${draft.id}`, { fiscalYearId: f.fy })).status).toBe(400);
    expect(await snapshot(f)).toBe(before);
  });
  it.each(["reverse", "void"] as const)("OPEN CLOSING blocks %s permanently", async (action) => {
    const f = await fixture();
    const entry = await seedEntry(f, "POSTED", "CLOSING");
    const before = await snapshot(f);
    const response = await api(f).post(`/journal-entries/${entry.id}/${action}`, { reason: "TEST", voidReason: "TEST" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("قيد الإقفال");
    expect(await snapshot(f)).toBe(before);
  });
  it("OPEN retains create/edit/submit/approve/post, audit, copy, reversal and delete", async () => {
    const f = await fixture();
    const created = await api(f).post("/journal-entries", body(f));
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await api(f).patch(`/journal-entries/${id}`, { descriptionEn: "TEST edited", lines: body(f).lines })).status).toBe(200);
    expect((await api(f).post(`/journal-entries/${id}/submit`)).status).toBe(200);
    expect((await api(f).post(`/journal-entries/${id}/approve`)).status).toBe(200);
    expect((await api(f).post(`/journal-entries/${id}/post`)).status).toBe(200);
    const copy = await api(f).post(`/journal-entries/${id}/copy`);
    expect(copy.status).toBe(200);
    expect((await api(f).delete(`/journal-entries/${copy.body.id}`)).status).toBe(200);
    expect((await api(f).post(`/journal-entries/${id}/reverse`, { reason: "TEST reversal" })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { userId: f.user } })).toBeGreaterThan(0);
    expect(await prisma.journalEntryApproval.count({ where: { journalEntryId: id } })).toBeGreaterThan(0);
  });
  it("OPEN retains reject, void and changing between open years", async () => {
    const f = await fixture();
    const draft = await seedEntry(f, "DRAFT");
    expect((await api(f).patch(`/journal-entries/${draft.id}`, { fiscalYearId: f.next, entryDate: "2027-01-01" })).status).toBe(200);
    const approved = await seedEntry(f, "APPROVED");
    expect((await api(f).post(`/journal-entries/${approved.id}/reject`, { comment: "TEST reject" })).status).toBe(200);
    const posted = await seedEntry(f);
    expect((await api(f).post(`/journal-entries/${posted.id}/void`, { reason: "TEST void" })).status).toBe(200);
  });
  it.each(["OPEN", "CLOSED"] as const)("%s controls template use", async (status) => {
    const f = await fixture(status);
    const template = await prisma.journalEntryTemplate.create({ data: {
      organizationId: f.org, nameEn: "TEST", nameAr: "اختبار",
      lines: { create: body(f).lines },
    } });
    const before = await snapshot(f);
    const response = await api(f).post(`/templates/${template.id}/use`, { fiscalYearId: f.fy, entryDate: "2026-06-01" });
    expect(response.status).toBe(status === "OPEN" ? 201 : 400);
    if (status === "CLOSED") expect(await snapshot(f)).toBe(before);
  });
  it.each(["receipts", "payments"] as const)("%s auto-post/reversal obeys OPEN/CLOSED and rolls back balances", async (kind) => {
    const f = await fixture();
    const v = await voucher(f, kind);
    expect((await api(f).post(`/${kind}/${v.id}/confirm`)).status).toBe(200);
    await prisma.fiscalYear.update({ where: { id: f.fy }, data: { status: "CLOSED" } });
    const before = await snapshot(f);
    const blocked = await api(f).post(`/${kind}/${v.id}/void`, { voidReason: "TEST blocked" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toContain("مقفلة");
    expect(await snapshot(f)).toBe(before);
    const second = await voucher(f, kind);
    const beforeConfirm = await snapshot(f);
    expect((await api(f).post(`/${kind}/${second.id}/confirm`)).status).toBe(400);
    expect(await snapshot(f)).toBe(beforeConfirm);
    await prisma.fiscalYear.update({ where: { id: f.fy }, data: { status: "OPEN" } });
    expect((await api(f).post(`/${kind}/${v.id}/void`, { voidReason: "TEST allowed" })).status).toBe(200);
    expect(Number((await prisma.cashBox.findUniqueOrThrow({ where: { id: f.box } })).currentBalance)).toBe(0);
  });
  it("petty cash creation and automatic reversal obey CLOSED without partial balance changes", async () => {
    const f = await fixture();
    const data = { cashBoxId: f.box, type: "IN", transactionDate: "2026-06-01", amount: 25, glAccountId: f.revenue, descriptionEn: "TEST", descriptionAr: "اختبار" };
    const created = await api(f).post("/petty-cash", data);
    expect(created.status).toBe(201);
    await prisma.fiscalYear.update({ where: { id: f.fy }, data: { status: "CLOSED" } });
    const before = await snapshot(f);
    expect((await api(f).delete(`/petty-cash/${created.body.id}`)).status).toBe(400);
    expect((await api(f).post("/petty-cash", data)).status).toBe(400);
    expect(await snapshot(f)).toBe(before);
    await prisma.fiscalYear.update({ where: { id: f.fy }, data: { status: "OPEN" } });
    expect((await api(f).delete(`/petty-cash/${created.body.id}`)).status).toBe(200);
    expect(Number((await prisma.cashBox.findUniqueOrThrow({ where: { id: f.box } })).currentBalance)).toBe(0);
  });
  it("rolls back writes when a handler rejects after writing", async () => {
    const f = await fixture();
    const before = await snapshot(f);
    expect((await api(f).post("/rollback-probe", { cash: f.box })).status).toBe(400);
    expect(await snapshot(f)).toBe(before);
  });
  it("rolls back after a caught database failure; never sends premature success", async () => {
    const f = await fixture();
    const before = await snapshot(f);
    expect((await api(f).post("/rollback-probe/failure", { cash: f.box })).status).toBe(500);
    expect(await snapshot(f)).toBe(before);
  });
  it.each(["receipts", "payments", "petty-cash"] as const)("blocks %s automatic reversal of CLOSING in OPEN", async (kind) => {
    const f = await fixture();
    const entry = await seedEntry(f, "POSTED", "CLOSING");
    let id: string;
    if (kind === "petty-cash") {
      const row = await prisma.pettyCash.create({ data: {
        cashBoxId: f.box, type: "IN", transactionDate: new Date("2026-06-01"), amount: 50,
        descriptionEn: "TEST", descriptionAr: "اختبار", journalEntryId: entry.id,
      } });
      id = row.id;
    } else {
      const row = await voucher(f, kind);
      const model = kind === "receipts" ? prisma.receipt : prisma.payment;
      await (model as typeof prisma.receipt).update({ where: { id: row.id }, data: { status: "CONFIRMED", journalEntryId: entry.id } });
      id = row.id;
    }
    const before = await snapshot(f);
    const response = kind === "petty-cash" ? await api(f).delete(`/${kind}/${id}`)
      : await api(f).post(`/${kind}/${id}/void`, { voidReason: "TEST" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("قيد الإقفال");
    expect(await snapshot(f)).toBe(before);
  });
  it.each(["receipts", "payments", "petty-cash"] as const)("%s lists expose the linked year's state for UI guards", async (kind) => {
    const f = await fixture("CLOSED");
    const entry = await seedEntry(f);
    if (kind === "petty-cash") {
      await prisma.pettyCash.create({ data: {
        cashBoxId: f.box, type: "IN", transactionDate: new Date("2026-06-01"), amount: 50,
        descriptionEn: "TEST", descriptionAr: "اختبار", journalEntryId: entry.id,
      } });
    } else {
      const row = await voucher(f, kind);
      const model = kind === "receipts" ? prisma.receipt : prisma.payment;
      await (model as typeof prisma.receipt).update({ where: { id: row.id }, data: { journalEntryId: entry.id } });
    }
    const response = await request(app).get(`/${kind}`).set("x-test-identity", f.identity);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].accountingState).toEqual({ fiscalYearStatus: "CLOSED", type: "MANUAL" });
  });
  it("CLOSED blocks attachment metadata mutations before touching storage", async () => {
    const f = await fixture("CLOSED");
    const e = await seedEntry(f);
    const before = await snapshot(f);
    const attachment = randomUUID();
    expect((await api(f).post(`/journal-entries/${e.id}/attachments`)).status).toBe(400);
    expect((await api(f).patch(`/journal-entries/${e.id}/attachments/${attachment}`, { isPrimary: true })).status).toBe(400);
    expect((await api(f).delete(`/journal-entries/${e.id}/attachments/${attachment}`)).status).toBe(400);
    expect(await snapshot(f)).toBe(before);
  });
  it("retains RBAC and organization isolation", async () => {
    const f = await fixture();
    const other = await fixture();
    const e = await seedEntry(other);
    expect((await api(f).post(`/journal-entries/${e.id}/reverse`, { reason: "TEST" })).status).toBe(404);
    const noPermission = await prisma.user.create({ data: { clerkId: `TEST_${randomUUID()}`, email: `${randomUUID()}@example.invalid`, organizationId: f.org } });
    expect((await request(app).post("/journal-entries").set("x-test-identity", noPermission.clerkId!).send(body(f))).status).toBe(403);
  });
  it("close refuses pending manual posting, which can then complete before closing", async () => {
    const f = await fixture();
    await seedEntry(f);
    const pending = await seedEntry(f, "APPROVED");
    const before = await snapshot(f);
    const refused = await api(f).post(`/fiscal-years/${f.fy}/close`, { retainedEarningsAccountId: f.equity });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain("غير مرحلة");
    expect(await snapshot(f)).toBe(before);
    expect((await api(f).post(`/journal-entries/${pending.id}/post`)).status).toBe(200);
    const closed = await api(f).post(`/fiscal-years/${f.fy}/close`, { retainedEarningsAccountId: f.equity });
    expect(closed.status).toBe(200);
    expect(closed.body.netIncome).toBe(200);
  });
  it("close before automatic posting: posting waits then rejects, no omitted movement", async () => {
    const f = await fixture();
    await seedEntry(f);
    const pending = await voucher(f, "receipts");
    const gate = await pauseFinancialWrite(f, "NEW.type = 'CLOSING'");
    const close = api(f).post(`/fiscal-years/${f.fy}/close`, { retainedEarningsAccountId: f.equity }).then((r) => r);
    let post: Promise<request.Response> | undefined;
    try {
      await waitForBlockedLock();
      post = api(f).post(`/receipts/${pending.id}/confirm`).then((r) => r);
      await waitForBlockedLock(2);
    } finally { gate.release(); }
    const [closed, posted] = await Promise.all([close, post!]);
    await gate.finish();
    expect(closed.status).toBe(200);
    expect(closed.body.netIncome).toBe(100);
    expect(posted.status).toBe(400);
    const row = await prisma.receipt.findUniqueOrThrow({ where: { id: pending.id } });
    expect(row.status).toBe("DRAFT");
    expect(Number((await prisma.cashBox.findUniqueOrThrow({ where: { id: f.box } })).currentBalance)).toBe(0);
  });
  it.each(["manual", "automatic"] as const)("%s posting before close: close waits and includes movement exactly once", async (kind) => {
    const f = await fixture();
    await seedEntry(f);
    const pending = kind === "manual" ? await seedEntry(f, "APPROVED") : await voucher(f, "receipts");
    const gate = await pauseFinancialWrite(f, "NEW.status = 'POSTED' AND NEW.type <> 'CLOSING'");
    const post = api(f).post(kind === "manual" ? `/journal-entries/${pending.id}/post` : `/receipts/${pending.id}/confirm`).then((r) => r);
    let close: Promise<request.Response> | undefined;
    try {
      await waitForBlockedLock();
      close = api(f).post(`/fiscal-years/${f.fy}/close`, { retainedEarningsAccountId: f.equity }).then((r) => r);
      await waitForBlockedLock(2);
    } finally { gate.release(); }
    const [posted, closed] = await Promise.all([post, close!]);
    await gate.finish();
    expect(posted.status).toBe(200);
    expect(closed.status).toBe(200);
    expect(closed.body.netIncome).toBe(kind === "manual" ? 200 : 150);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.org, type: "CLOSING" } })).toBe(1);
    expect((await api(f).post(`/fiscal-years/${f.fy}/close`, { retainedEarningsAccountId: f.equity })).status).toBe(400);
    // Remove only the unused synthetic future year in this disposable fixture;
    // rollover must target the immediate next year, not skip an intervening one.
    await prisma.fiscalYear.delete({ where: { id: f.next } });
    const rollover = await api(f).post(`/fiscal-years/${f.fy}/rollover`);
    expect(rollover.status).toBe(201);
    expect((await api(f).post(`/fiscal-years/${f.fy}/rollover`)).status).toBe(400);
  });
});
