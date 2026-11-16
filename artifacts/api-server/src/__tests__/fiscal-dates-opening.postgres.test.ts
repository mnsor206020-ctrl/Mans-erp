/**
 * Real Express/Prisma/RBAC against the disposable PostgreSQL runner only.
 * The external Clerk identity boundary is substituted, not financial queries.
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
import years from "../routes/fiscal-years";
import journals from "../routes/journal-entries";
import templates from "../routes/journal-entry-templates";
import receipts from "../routes/receipts";
import payments from "../routes/payments";
import petty from "../routes/petty-cash";

const app = express();
app.use(express.json());
app.use("/years", years);
app.use("/journals", journals);
app.use("/templates", templates);
app.use("/receipts", receipts);
app.use("/payments", payments);
app.use("/petty", petty);
let roleId: string;
const fyBody = (startDate = "2027-01-01", endDate = "2027-12-31") =>
  ({ nameEn: "TEST year", nameAr: "سنة اختبار", startDate, endDate });

async function fixture(status: "OPEN" | "CLOSED" = "OPEN") {
  const org = await prisma.organization.create({ data: { nameEn: `TEST ${randomUUID()}`, nameAr: "اختبار" } });
  const identity = `TEST_${randomUUID()}`;
  const user = await prisma.user.create({ data: {
    clerkId: identity, email: `${identity}@example.invalid`, organizationId: org.id,
    userRoles: { create: { roleId } },
  } });
  const year = await prisma.fiscalYear.create({ data: {
    organizationId: org.id, nameEn: "TEST 2026", nameAr: "اختبار",
    startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status,
  } });
  const accounts = await Promise.all([
    ["100", "ASSET", "DEBIT"], ["300", "EQUITY", "CREDIT"], ["400", "REVENUE", "CREDIT"],
  ].map(([code, type, nature]) => prisma.chartOfAccount.create({ data: {
    organizationId: org.id, code: code!, type: type as "ASSET" | "EQUITY" | "REVENUE",
    nature: nature as "DEBIT" | "CREDIT", nameEn: `TEST ${code}`, nameAr: "اختبار",
  } })));
  const [cash, equity, revenue] = accounts;
  const box = await prisma.cashBox.create({ data: {
    organizationId: org.id, code: "TEST", currencyCode: "SAR", nameEn: "TEST", nameAr: "اختبار", glAccountId: cash!.id,
  } });
  return { org: org.id, identity, user: user.id, year: year.id, cash: cash!.id, equity: equity!.id, revenue: revenue!.id, box: box.id };
}
type F = Awaited<ReturnType<typeof fixture>>;
const call = (f: F, method: "post" | "patch", url: string, body: object = {}) =>
  request(app)[method](url).set("x-test-identity", f.identity).send(body);
function journalBody(f: F, entryDate = "2026-06-01", fiscalYearId = f.year) {
  return { fiscalYearId, entryDate, currencyCode: "SAR", type: "MANUAL",
    lines: [
      { accountId: f.cash, lineNumber: 1, debit: 100, credit: 0 },
      { accountId: f.revenue, lineNumber: 2, debit: 0, credit: 100 },
    ] };
}
async function seed(f: F, options: {
  status?: "DRAFT" | "APPROVED" | "POSTED"; date?: string; year?: string;
  debit?: string; credit?: string; creditAccount?: string;
} = {}) {
  return prisma.journalEntry.create({ data: {
    organizationId: f.org, fiscalYearId: options.year ?? f.year, number: `TEST-${randomUUID()}`,
    entryDate: new Date(options.date ?? "2026-06-01"), status: options.status ?? "POSTED",
    totalDebit: options.debit ?? "100", totalCredit: options.credit ?? options.debit ?? "100",
    createdByUserId: f.user,
    lines: { create: [
      { accountId: f.cash, lineNumber: 1, debit: options.debit ?? "100", debitBase: options.debit ?? "100", credit: 0, creditBase: 0 },
      { accountId: options.creditAccount ?? f.equity, lineNumber: 2, debit: 0, debitBase: 0,
        credit: options.credit ?? options.debit ?? "100", creditBase: options.credit ?? options.debit ?? "100" },
    ] },
  } });
}
async function snapshot(f: F) {
  return JSON.stringify(await Promise.all([
    prisma.fiscalYear.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" } }),
    prisma.journalEntry.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" },
      include: { lines: { orderBy: { id: "asc" } }, approvals: { orderBy: { id: "asc" } } } }),
    prisma.cashBox.findMany({ where: { organizationId: f.org } }),
    prisma.receipt.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" } }),
    prisma.payment.findMany({ where: { organizationId: f.org }, orderBy: { id: "asc" } }),
    prisma.pettyCash.findMany({ where: { cashBox: { organizationId: f.org } }, orderBy: { id: "asc" } }),
    prisma.auditLog.findMany({ where: { userId: f.user }, orderBy: { id: "asc" } }),
  ]));
}
async function rejectsUnchanged(f: F, action: PromiseLike<request.Response>, message?: string) {
  const before = await snapshot(f);
  const response = await action;
  expect(response.status).toBe(400);
  if (message) expect(response.body.error).toContain(message);
  expect(await snapshot(f)).toBe(before);
}

describe.skipIf(!process.env.MANS_ISOLATION_PGROOT)("phase three: financial dates and opening integrity", () => {
  beforeAll(async () => {
    const root = realpathSync(process.env.MANS_ISOLATION_PGROOT!);
    const url = new URL(process.env.DATABASE_URL!);
    if (!root.includes("/.local/organization-isolation-") || !existsSync(join(root, "data", "PG_VERSION"))
      || url.username !== "test_isolation" || url.pathname !== "/mans_erp_isolation"
      || url.searchParams.get("host") !== join(root, "socket")) throw new Error("Unsafe test database");
    expect(await prisma.organization.count()).toBe(0);
    await prisma.currency.create({ data: { code: "SAR", nameEn: "TEST", nameAr: "اختبار", symbol: "SAR" } });
    const role = await prisma.role.create({ data: { nameEn: "TEST phase three", nameAr: "اختبار" } });
    roleId = role.id;
    for (const resource of ["fiscal_years", "journal_entries", "receipts", "payments", "petty_cash"]) {
      for (const action of ["create", "update", "approve", "void", "delete"]) {
        const permission = await prisma.permission.create({ data: { resource, action } });
        await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
      }
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("creates a valid year and permits the same window in another organization", async () => {
    const a = await fixture(), b = await fixture();
    for (const f of [a, b]) expect((await call(f, "post", "/years", fyBody())).status).toBe(201);
  });
  it.each([
    ["2027-12-31", "2027-01-01"], ["2026-06-01", "2027-06-01"],
    ["2025-06-01", "2026-06-01"], ["2026-03-01", "2026-04-01"],
    ["2025-01-01", "2027-12-31"], ["2026-12-31", "2027-12-31"],
  ])("rejects reversed/overlapping FY %s—%s atomically", async (start, end) => {
    const f = await fixture();
    await rejectsUnchanged(f, call(f, "post", "/years", fyBody(start, end)));
  });
  it("allows adjacent non-overlapping years", async () => {
    const f = await fixture();
    expect((await call(f, "post", "/years", fyBody("2025-01-01", "2025-12-31"))).status).toBe(201);
    expect((await call(f, "post", "/years", fyBody())).status).toBe(201);
  });
  it("rejects concurrent overlapping creations in the same organization", async () => {
    const f = await fixture();
    const responses = await Promise.all([
      call(f, "post", "/years", fyBody()),
      call(f, "post", "/years", fyBody("2027-06-01", "2028-06-01")),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.fiscalYear.count({ where: { organizationId: f.org } })).toBe(2);
  });
  it("validates FY edits and records their audit trail", async () => {
    const f = await fixture();
    expect((await call(f, "patch", `/years/${f.year}`, { nameEn: "TEST edited", startDate: "2026-02-01" })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { entityId: f.year, action: "UPDATE" } })).toBe(1);
    await rejectsUnchanged(f, call(f, "patch", `/years/${f.year}`, { endDate: "2026-01-01" }));
    const next = await call(f, "post", "/years", fyBody());
    expect(next.status).toBe(201);
    await rejectsUnchanged(f, call(f, "patch", `/years/${f.year}`, { endDate: "2027-01-01" }));
  });
  it.each(["DRAFT", "POSTED"] as const)("FY edits cannot exclude an existing %s journal", async (status) => {
    const f = await fixture();
    await seed(f, { status });
    await rejectsUnchanged(f, call(f, "patch", `/years/${f.year}`, { startDate: "2026-07-01" }), "يستبعد");
  });
  it("blocks editing CLOSED, another organization and permissionless users", async () => {
    const a = await fixture("CLOSED"), b = await fixture();
    await rejectsUnchanged(a, call(a, "patch", `/years/${a.year}`, { nameEn: "TEST" }), "مقفلة");
    expect((await call(b, "patch", `/years/${a.year}`, { nameEn: "TEST" })).status).toBe(400);
    const denied = await prisma.user.create({ data: {
      clerkId: `TEST_${randomUUID()}`, email: `${randomUUID()}@example.invalid`, organizationId: b.org,
    } });
    expect((await request(app).patch(`/years/${b.year}`).set("x-test-identity", denied.clerkId!).send({ nameEn: "TEST" })).status).toBe(403);
  });
  it("serializes FY edit versus creation to prevent overlap", async () => {
    const f = await fixture();
    const responses = await Promise.all([
      call(f, "patch", `/years/${f.year}`, { endDate: "2027-01-31" }),
      call(f, "post", "/years", fyBody()),
    ]);
    expect(responses.filter((r) => r.status === 400)).toHaveLength(1);
    const rows = await prisma.fiscalYear.findMany({ where: { organizationId: f.org }, orderBy: { startDate: "asc" } });
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.startDate.getTime()).toBeGreaterThan(rows[i - 1]!.endDate.getTime());
  });
  it.each(["2026-01-01", "2026-12-31"])("allows journal boundary %s", async (date) => {
    const f = await fixture();
    const created = await call(f, "post", "/journals", journalBody(f, date));
    expect(created.status).toBe(201);
    expect(created.body.fiscalYearId).toBe(f.year);
  });
  it("preserves the existing YYYY-MM-DD journal request contract", async () => {
    const f = await fixture();
    await rejectsUnchanged(f, call(f, "post", "/journals", journalBody(f, "2026-12-31T12:00:00.000Z")));
  });
  it.each(["2025-12-31", "2027-01-01", "not-a-date"])("rejects journal date %s without automatic year selection", async (date) => {
    const f = await fixture();
    await call(f, "post", "/years", fyBody());
    await rejectsUnchanged(f, call(f, "post", "/journals", journalBody(f, date)), "تاريخ القيد");
  });
  it("validates effective date/year pairs on edit and posting", async () => {
    const f = await fixture();
    const draft = await seed(f, { status: "DRAFT" });
    const next = await call(f, "post", "/years", fyBody());
    await rejectsUnchanged(f, call(f, "patch", `/journals/${draft.id}`, { entryDate: "2027-01-01" }));
    await rejectsUnchanged(f, call(f, "patch", `/journals/${draft.id}`, { fiscalYearId: next.body.id }));
    expect((await call(f, "patch", `/journals/${draft.id}`, { fiscalYearId: next.body.id, entryDate: "2027-01-01" })).status).toBe(200);
    const invalid = await seed(f, { status: "APPROVED", date: "2027-01-01" });
    await rejectsUnchanged(f, call(f, "post", `/journals/${invalid.id}/post`), "تاريخ القيد");
    const valid = await seed(f, { status: "APPROVED", date: "2026-12-31" });
    expect((await call(f, "post", `/journals/${valid.id}/post`)).status).toBe(200);
  });
  it.each(["copy", "reverse"] as const)("validates %s date before creating any rows", async (action) => {
    const f = await fixture();
    const entry = await seed(f);
    await rejectsUnchanged(f, call(f, "post", `/journals/${entry.id}/${action}`, {
      entryDate: "2027-01-01", reverseDate: "2027-01-01", reason: "TEST",
    }), "تاريخ القيد");
  });
  it.each(["2026-01-01", "2026-12-31", "2025-12-31", "2027-01-01"])("validates template date %s", async (date) => {
    const f = await fixture();
    const template = await prisma.journalEntryTemplate.create({ data: {
      organizationId: f.org, nameEn: "TEST", nameAr: "اختبار", lines: { create: journalBody(f).lines },
    } });
    const response = call(f, "post", `/templates/${template.id}/use`, { fiscalYearId: f.year, entryDate: date });
    if (date.startsWith("2026")) expect((await response).status).toBe(201);
    else await rejectsUnchanged(f, response, "تاريخ القيد");
  });
  it.each(["receipts", "payments", "petty"] as const)("automatic %s uses only an open year covering the transaction date", async (kind) => {
    const f = await fixture();
    for (const date of ["2026-01-01", "2026-12-31", "2027-01-01"]) {
      const before = date.startsWith("2027") ? await snapshot(f) : "";
      let response: request.Response;
      if (kind === "petty") {
        response = await call(f, "post", "/petty", {
          cashBoxId: f.box, transactionDate: date, amount: 25, type: "IN", glAccountId: f.revenue,
          descriptionEn: "TEST", descriptionAr: "اختبار",
        });
      } else {
        const data = {
          organizationId: f.org, number: `TEST-${randomUUID()}`, paymentMethod: "CASH" as const,
          currencyCode: "SAR", amount: 25, amountBase: 25, cashBoxId: f.box, glAccountId: f.revenue,
        };
        const row = kind === "receipts"
          ? await prisma.receipt.create({ data: { ...data, receiptDate: new Date(date) } })
          : await prisma.payment.create({ data: { ...data, paymentDate: new Date(date) } });
        const beforeConfirm = await snapshot(f);
        response = await call(f, "post", `/${kind}/${row.id}/confirm`);
        if (date.startsWith("2027")) expect(await snapshot(f)).toBe(beforeConfirm);
      }
      expect(response.status).toBe(date.startsWith("2026") ? (kind === "petty" ? 201 : 200) : 400);
      if (date.startsWith("2027") && kind === "petty") expect(await snapshot(f)).toBe(before);
    }
    const posted = await prisma.journalEntry.findMany({ where: { organizationId: f.org } });
    expect(posted).toHaveLength(2);
    expect(posted.every((e) => e.fiscalYearId === f.year)).toBe(true);
  });
  it.each(["receipts", "payments", "petty"] as const)("automatic %s reversal rejects today's date outside the original year", async (kind) => {
    const f = await fixture();
    // A synthetic older OPEN year, not historical application data.
    const oldYear = await prisma.fiscalYear.create({ data: {
      organizationId: f.org, nameEn: "TEST old", nameAr: "اختبار",
      startDate: new Date("2000-01-01"), endDate: new Date("2000-12-31"),
    } });
    const entry = await seed(f, { year: oldYear.id, date: "2000-06-01" });
    if (kind === "petty") {
      const row = await prisma.pettyCash.create({ data: {
        cashBoxId: f.box, type: "IN", transactionDate: new Date("2000-06-01"), amount: 100,
        descriptionEn: "TEST", descriptionAr: "اختبار", journalEntryId: entry.id,
      } });
      const before = await snapshot(f);
      expect((await request(app).delete(`/petty/${row.id}`).set("x-test-identity", f.identity)).status).toBe(400);
      expect(await snapshot(f)).toBe(before);
    } else {
      const data = { organizationId: f.org, number: `TEST-${randomUUID()}`, paymentMethod: "CASH" as const,
        currencyCode: "SAR", amount: 100, amountBase: 100, cashBoxId: f.box, glAccountId: f.revenue,
        journalEntryId: entry.id, status: "CONFIRMED" as const };
      const row = kind === "receipts"
        ? await prisma.receipt.create({ data: { ...data, receiptDate: new Date("2000-06-01") } })
        : await prisma.payment.create({ data: { ...data, paymentDate: new Date("2000-06-01") } });
      await rejectsUnchanged(f, call(f, "post", `/${kind}/${row.id}/void`, { voidReason: "TEST" }), "تاريخ القيد");
    }
  });
  it("carries source-year balances only, including source OPENING, with exact decimal balance", async () => {
    const f = await fixture("CLOSED"), other = await fixture("CLOSED");
    const old = await prisma.fiscalYear.create({ data: {
      organizationId: f.org, nameEn: "TEST earlier", nameAr: "اختبار",
      startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31"), status: "CLOSED",
    } });
    await seed(f, { year: old.id, date: "2025-06-01", debit: "900" });
    const opening = await seed(f, { debit: "0.1001" });
    await prisma.journalEntry.update({ where: { id: opening.id }, data: { type: "OPENING" } });
    await seed(f, { debit: "0.2002" });
    await seed(other, { debit: "9999" });
    const foreignBefore = await snapshot(other);
    const response = await call(f, "post", `/years/${f.year}/rollover`);
    expect(response.status).toBe(201);
    expect(response.body.previousFiscalYearId).toBe(f.year);
    const result = await prisma.journalEntry.findUniqueOrThrow({ where: { id: response.body.openingJournalEntryId }, include: { lines: true } });
    expect(result.totalDebit.toFixed(4)).toBe("0.3003");
    expect(result.totalCredit.equals(result.totalDebit)).toBe(true);
    expect(result.organizationId).toBe(f.org);
    expect(result.lines.map((l) => l.accountId).sort()).toEqual([f.cash, f.equity].sort());
    expect(await snapshot(other)).toBe(foreignBefore);
  });
  it.each([
    ["100", "100", true], ["100.0001", "100", false], ["100", "99", false],
  ] as const)("opening balance %s/%s permanent=%s is rejected if not exactly balanced", async (debit, credit, permanent) => {
    const f = await fixture("CLOSED");
    await seed(f, { debit, credit, creditAccount: permanent ? f.revenue : f.equity });
    await rejectsUnchanged(f, call(f, "post", `/years/${f.year}/rollover`), "غير متوازنة");
  });
  it.each([
    ["2027-12-31", "2027-01-01"], ["2026-12-01", "2027-12-31"], ["2025-01-01", "2025-12-31"],
  ])("rollover rejects invalid target dates %s—%s atomically", async (startDate, endDate) => {
    const f = await fixture("CLOSED");
    await seed(f);
    await rejectsUnchanged(f, call(f, "post", `/years/${f.year}/rollover`, { startDate, endDate }));
  });
  it("rejects skipping an intervening financial year", async () => {
    const f = await fixture("CLOSED");
    await seed(f);
    await call(f, "post", "/years", fyBody());
    await rejectsUnchanged(f, call(f, "post", `/years/${f.year}/rollover`, fyBody("2028-01-01", "2028-12-31")), "السابقة مباشرة");
  });
  it("serializes rollover versus creation of the same target year", async () => {
    const f = await fixture("CLOSED");
    await seed(f);
    const responses = await Promise.all([
      call(f, "post", `/years/${f.year}/rollover`), call(f, "post", "/years", fyBody()),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.fiscalYear.count({ where: { organizationId: f.org } })).toBe(2);
  });
  it("rolls back the new FY and opening journal if opening lines fail to save", async () => {
    const f = await fixture("CLOSED");
    await seed(f);
    const before = await snapshot(f);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_phase3_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'TEST opening save failure'; END $$`);
    await prisma.$executeRawUnsafe("CREATE TRIGGER test_phase3_fail BEFORE INSERT ON journal_entry_lines FOR EACH ROW EXECUTE FUNCTION test_phase3_fail()");
    try {
      expect((await call(f, "post", `/years/${f.year}/rollover`)).status).toBe(500);
      expect(await snapshot(f)).toBe(before);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER test_phase3_fail ON journal_entry_lines");
      await prisma.$executeRawUnsafe("DROP FUNCTION test_phase3_fail()");
    }
  });
});
