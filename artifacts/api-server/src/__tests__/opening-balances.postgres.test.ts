/**
 * Real routes, Prisma, PostgreSQL and RBAC; only Clerk identity is substituted.
 * Run ONLY through scripts/test-organization-isolation.mjs with this file.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { prisma } from "@workspace/prisma";

vi.mock("@clerk/express", () => ({
  getAuth: (req: { get: (name: string) => string | undefined }) =>
    ({ userId: req.get("x-test-identity") ?? null }),
}));
import yearsRouter from "../routes/fiscal-years";
import reportsRouter from "../routes/reports";

const app = express();
app.use(express.json());
app.use("/api/fiscal-years", yearsRouter);
app.use("/api/reports", reportsRouter);
const org = randomUUID();
const foreignOrg = randomUUID();
const cash = randomUUID();
const payable = randomUUID();
const equity = randomUUID();
const foreignCash = randomUUID();
const foreignYear = randomUUID();
const years: string[] = [randomUUID()];
const expectedCash = [2200, 2300, 2250, 2275];
const expectedPayable = [500, 600, 550, 575];
let originalId: string;
let originalSnapshot: string;
const snapshots: string[] = [];
const identity = "TEST_opening_owner";
const api = () => request(app);
const auth = { "x-test-identity": identity };

async function entry(fiscalYearId: string, date: string, amount: number, type: "MANUAL" | "OPENING" = "MANUAL") {
  return prisma.journalEntry.create({ data: {
    organizationId: org, fiscalYearId, number: `TEST-${randomUUID()}`,
    entryDate: new Date(date), type, status: "POSTED",
    totalDebit: Math.abs(amount), totalCredit: Math.abs(amount),
    lines: { create: [
      { accountId: cash, lineNumber: 1, debit: Math.max(amount, 0), credit: Math.max(-amount, 0),
        debitBase: Math.max(amount, 0), creditBase: Math.max(-amount, 0) },
      { accountId: payable, lineNumber: 2, debit: Math.max(-amount, 0), credit: Math.max(amount, 0),
        debitBase: Math.max(-amount, 0), creditBase: Math.max(amount, 0) },
    ] },
  } });
}
const ledger = (accountId: string, from: string, to: string, headers = auth) =>
  api().get("/api/reports/account-ledger").set(headers).query({ accountId, from, to });

describe.skipIf(!process.env.MANS_ISOLATION_PGROOT)("opening carry-forward: four isolated fiscal years", () => {
  beforeAll(async () => {
    const root = realpathSync(process.env.MANS_ISOLATION_PGROOT!);
    const url = new URL(process.env.DATABASE_URL!);
    if (!root.includes("/.local/organization-isolation-") || !existsSync(join(root, "data", "PG_VERSION"))
      || url.pathname !== "/mans_erp_isolation" || url.username !== "test_isolation"
      || url.searchParams.get("host") !== join(root, "socket")) {
      throw new Error("Refusing to use any existing project database");
    }
    expect(await prisma.organization.count()).toBe(0);
    const role = await prisma.role.create({ data: { nameEn: "TEST opening operator", nameAr: "اختبار" } });
    const permission = await prisma.permission.create({ data: { resource: "fiscal_years", action: "update" } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.organization.createMany({ data: [
      { id: org, nameEn: "TEST openings", nameAr: "اختبار الافتتاحيات" },
      { id: foreignOrg, nameEn: "TEST foreign", nameAr: "اختبار العزل" },
    ] });
    for (const [clerkId, organizationId] of [
      [identity, org], ["TEST_opening_foreign", foreignOrg], ["TEST_opening_unassigned", null],
    ] as const) {
      await prisma.user.create({ data: {
        clerkId, email: `${clerkId}@example.invalid`, organizationId,
        userRoles: { create: { roleId: role.id } },
      } });
    }
    await prisma.chartOfAccount.createMany({ data: [
      { id: cash, organizationId: org, code: "100", nameEn: "TEST Cash", nameAr: "نقد", type: "ASSET", nature: "DEBIT" },
      { id: payable, organizationId: org, code: "200", nameEn: "TEST Payable", nameAr: "التزامات", type: "LIABILITY", nature: "CREDIT" },
      { id: equity, organizationId: org, code: "300", nameEn: "TEST Net assets", nameAr: "صافي أصول", type: "EQUITY", nature: "CREDIT" },
      { id: foreignCash, organizationId: foreignOrg, code: "100", nameEn: "TEST Foreign cash", nameAr: "نقد", type: "ASSET", nature: "DEBIT" },
    ] });
    for (const [id, organizationId] of [[years[0]!, org], [foreignYear, foreignOrg]]) {
      await prisma.fiscalYear.create({ data: {
        id, organizationId: organizationId!, nameEn: "TEST 2026", nameAr: "اختبار",
        startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "CLOSED",
      } });
    }
    const initial = await prisma.journalEntry.create({ data: {
      organizationId: org, fiscalYearId: years[0]!, number: "TEST-initial", type: "OPENING",
      status: "POSTED", entryDate: new Date("2026-01-01"), totalDebit: 2200, totalCredit: 2200,
      lines: { create: [
        { accountId: cash, lineNumber: 1, debit: 2200, credit: 0, debitBase: 2200, creditBase: 0 },
        { accountId: payable, lineNumber: 2, debit: 0, credit: 500, debitBase: 0, creditBase: 500 },
        { accountId: equity, lineNumber: 3, debit: 0, credit: 1700, debitBase: 0, creditBase: 1700 },
      ] },
    } });
    originalId = initial.id;
    originalSnapshot = JSON.stringify(await prisma.journalEntry.findUnique({
      where: { id: originalId }, include: { lines: { orderBy: { lineNumber: "asc" } } },
    }));
    // Deliberately mismatched links only in the disposable database: neither
    // these nor a different fiscal year's balances may enter the carry-forward.
    await entry(foreignYear, "2026-06-01", 50000);
    const badOrg = await entry(years[0]!, "2026-06-01", 60000);
    await prisma.journalEntry.update({ where: { id: badOrg.id }, data: { organizationId: foreignOrg } });
    snapshots.push(originalSnapshot);
    for (let i = 1; i < 4; i++) {
      const result = await api().post(`/api/fiscal-years/${years[i - 1]}/rollover`).set(auth).send({});
      expect(result.status).toBe(201);
      years.push(result.body.fiscalYearId);
      const opening = await prisma.journalEntry.findUnique({
        where: { id: result.body.openingJournalEntryId }, include: { lines: true },
      });
      expect(opening?.type).toBe("OPENING");
      expect(opening?.lines.find(l => l.accountId === cash)?.debit.toNumber()).toBe(expectedCash[i - 1]);
      expect(opening?.lines.find(l => l.accountId === payable)?.credit.toNumber()).toBe(expectedPayable[i - 1]);
      expect(opening?.lines.find(l => l.accountId === equity)?.credit.toNumber()).toBe(1700);
      expect(opening?.totalDebit.toNumber()).toBe(opening?.totalCredit.toNumber());
      snapshots.push(JSON.stringify(opening));
      await entry(years[i]!, `${2026 + i}-06-15`, [0, 100, -50, 25][i]!);
      // Fixture state only; do not exercise closing or operate on existing data.
      await prisma.fiscalYear.update({ where: { id: years[i]! }, data: { status: "CLOSED" } });
    }
  }, 30_000);

  afterAll(async () => { await prisma.$disconnect(); });

  for (let i = 0; i < 4; i++) {
    for (const [account, sign, expected] of [
      [cash, 1, expectedCash], [payable, -1, expectedPayable],
    ] as const) {
      it(`year ${i + 1}: ${sign > 0 ? "debit" : "credit"} ledger matches the same-year trial balance`, async () => {
        const year = 2026 + i;
        const result = await ledger(account, `${year}-01-01`, `${year}-12-31`);
        expect(result.status).toBe(200);
        expect(result.body.beginningBalance).toBe(0);
        expect(result.body.endingBalance).toBe(sign * expected[i]!);
        const trial = await api().get("/api/reports/trial-balance").set(auth)
          .query({ fiscalYearId: years[i], asOf: `${year}-12-31` });
        expect(trial.status).toBe(200);
        expect(trial.body.lines.find((l: { accountId: string }) => l.accountId === account).balance)
          .toBe(result.body.endingBalance);
      });
    }
  }
  it("preserves net assets at 1700 and never doubles them through the fourth opening", () => {
    expect(snapshots).toHaveLength(4);
    for (const snapshot of snapshots) {
      const record = JSON.parse(snapshot);
      expect(Number(record.lines.find((l: { accountId: string }) => l.accountId === equity).credit)).toBe(1700);
    }
  });
  it("mid-year starting balance includes only this year's opening and earlier movements", async () => {
    const result = await ledger(cash, "2028-07-01", "2028-12-31");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ beginningBalance: 2250, totalDebit: 0, totalCredit: 0, endingBalance: 2250 });
  });
  for (const [from, to, expectedBeginning, expectedEnding, expectedLines] of [
    ["2026-01-01", "2029-12-31", 0, 2275, 4],
    ["2027-01-01", "2029-12-31", 0, 2275, 4],
    ["2027-07-01", "2029-12-31", 2300, 2275, 2],
    ["2028-01-01", "2029-07-01", 0, 2275, 3],
  ] as const) {
    it(`multi-year ${from} to ${to} carries history once`, async () => {
      const result = await ledger(cash, from, to);
      expect(result.status).toBe(200);
      expect(result.body.beginningBalance).toBe(expectedBeginning);
      expect(result.body.endingBalance).toBe(expectedEnding);
      expect(result.body.lines).toHaveLength(expectedLines);
    });
  }
  it("multi-year creditor retains its negative debit-minus-credit balance", async () => {
    const result = await ledger(payable, "2026-01-01", "2029-12-31");
    expect(result.status).toBe(200);
    expect(result.body.endingBalance).toBe(-575);
  });
  it("retains a later dated OPENING rather than suppressing OPENING indiscriminately", async () => {
    const extra = await entry(years[3]!, "2029-09-01", 7, "OPENING");
    try {
      const result = await ledger(cash, "2026-01-01", "2029-12-31");
      expect(result.status).toBe(200);
      expect(result.body.endingBalance).toBe(2282);
      expect(result.body.lines.some((l: { journalEntryId: string }) => l.journalEntryId === extra.id)).toBe(true);
    } finally {
      await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: extra.id } });
      await prisma.journalEntry.delete({ where: { id: extra.id } });
    }
  });
  it("does not mutate the existing source journal or its lines", async () => {
    expect(JSON.stringify(await prisma.journalEntry.findUnique({
      where: { id: originalId }, include: { lines: { orderBy: { lineNumber: "asc" } } },
    }))).toBe(originalSnapshot);
  });
  it("rejects another organization's ledger and rollover in both directions", async () => {
    expect((await ledger(foreignCash, "2026-01-01", "2026-12-31")).status).toBe(404);
    expect((await ledger(cash, "2026-01-01", "2026-12-31", { "x-test-identity": "TEST_opening_foreign" })).status).toBe(404);
    expect((await api().post(`/api/fiscal-years/${foreignYear}/rollover`).set(auth).send({})).status).toBe(404);
    expect((await api().post(`/api/fiscal-years/${years[0]}/rollover`)
      .set("x-test-identity", "TEST_opening_foreign").send({})).status).toBe(404);
  });
  it("rejects an unassigned user and invalid dates without writing", async () => {
    expect((await ledger(cash, "2026-01-01", "2026-12-31", { "x-test-identity": "TEST_opening_unassigned" })).status).toBe(400);
    for (const [from, to] of [["2029-12-31", "2026-01-01"], ["2026-02-30", "2026-12-31"]]) {
      expect((await ledger(cash, from!, to!)).status).toBe(400);
    }
  });
  it("refuses overlapping fiscal years instead of inventing a combined balance", async () => {
    const overlapping = await prisma.fiscalYear.create({ data: {
      organizationId: org, nameEn: "TEST overlap", nameAr: "اختبار",
      startDate: new Date("2027-06-01"), endDate: new Date("2027-12-31"),
    } });
    try {
      expect((await ledger(cash, "2027-01-01", "2027-12-31")).status).toBe(400);
    } finally { await prisma.fiscalYear.delete({ where: { id: overlapping.id } }); }
  });
  it("refuses ambiguous extra start-date openings instead of silently dropping them", async () => {
    const extra = await entry(years[3]!, "2029-01-01", 7, "OPENING");
    try {
      const result = await ledger(cash, "2028-01-01", "2029-12-31");
      expect(result.status).toBe(400);
      expect(result.body.error).toContain("افتتاحي");
    } finally {
      await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: extra.id } });
      await prisma.journalEntry.delete({ where: { id: extra.id } });
    }
  });
  it("refuses a multi-year range whose carry-forward link is missing", async () => {
    const next = await prisma.fiscalYear.create({ data: {
      organizationId: org, nameEn: "TEST unlinked", nameAr: "اختبار",
      startDate: new Date("2030-01-01"), endDate: new Date("2030-12-31"),
    } });
    try {
      expect((await ledger(cash, "2029-01-01", "2030-12-31")).status).toBe(400);
    } finally { await prisma.fiscalYear.delete({ where: { id: next.id } }); }
  });
});
