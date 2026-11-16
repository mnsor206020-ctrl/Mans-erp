import "./helpers/legacy-accounting-boundary";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { userRolesGrantingAll } from "./helpers/rbac";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  fiscalYear: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  chartOfAccount: { findFirst: vi.fn() },
  journalEntry: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  journalEntryLine: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@workspace/prisma", () => ({ prisma: db }));
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "test" }),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
import fiscalYears from "../routes/fiscal-years";

const app = express();
app.use(express.json());
app.use("/fiscal-years", fiscalYears);
const fy = {
  id: "source", organizationId: "org", nameEn: "TEST", nameAr: "اختبار",
  startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), deletedAt: null,
};
const account = (id: string, type: string, nature: string) => ({
  id, code: id, nameEn: id, nameAr: id, type, nature, organizationId: "org", isActive: true,
});
const cash = account("cash", "ASSET", "DEBIT");
const equity = account("equity", "EQUITY", "CREDIT");
const liability = account("liability", "LIABILITY", "CREDIT");
const revenue = account("revenue", "REVENUE", "CREDIT");
const expense = account("expense", "EXPENSE", "DEBIT");
function posting(status: string, debit: typeof cash, credit: typeof cash, amount: number) {
  const journalEntry = { status, organizationId: "org", fiscalYearId: fy.id };
  return [
    { account: debit, accountId: debit.id, debit: amount, credit: 0, journalEntry },
    { account: credit, accountId: credit.id, debit: 0, credit: amount, journalEntry },
  ];
}
let lines: ReturnType<typeof posting>;

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findFirst.mockResolvedValue({
    id: "test", organizationId: "org", userRoles: userRolesGrantingAll("fiscal_years"),
  });
  db.chartOfAccount.findFirst.mockResolvedValue(equity);
  db.journalEntry.findFirst.mockResolvedValue(null);
  db.journalEntry.findMany.mockResolvedValue([]);
  db.journalEntry.create.mockImplementation(async ({ data }) => ({ id: "generated", ...data }));
  db.fiscalYear.update.mockResolvedValue({ ...fy, status: "CLOSED" });
  db.fiscalYear.create.mockImplementation(async ({ data }) => ({ id: "next", ...data }));
  db.$transaction.mockImplementation(async (fn) => fn(db));
  // Apply the real route's status/org/FY/account-type predicates, not fixed balances.
  db.journalEntryLine.findMany.mockImplementation(async ({ where }) => {
    expect(where.journalEntry).toMatchObject({
      organizationId: "org", fiscalYearId: fy.id,
      status: { in: ["POSTED", "REVERSED", "LOCKED"] },
    });
    expect(where.account.organizationId).toBe("org");
    return lines.filter((line) => {
      const je = line.journalEntry;
      return where.journalEntry.status.in.includes(je.status)
        && je.organizationId === where.journalEntry.organizationId
        && je.fiscalYearId === where.journalEntry.fiscalYearId
        && line.account.organizationId === where.account.organizationId
        && where.account.type.in.includes(line.account.type);
    });
  });
});

describe.each(["POSTED", "REVERSED", "LOCKED"])("fiscal aggregation recognizes %s", (status) => {
  it.each(["DRAFT", "POSTED"])("closing with a %s reversal keeps the correct net result", async (reversalStatus) => {
    db.fiscalYear.findFirst.mockResolvedValue({ ...fy, status: "OPEN" });
    lines = [
      ...posting(status, cash, revenue, 1500),
      ...posting(reversalStatus, revenue, cash, 1500),
      ...posting("LOCKED", expense, cash, 200),
      ...posting("APPROVED", cash, revenue, 9000),
    ];
    const res = await request(app).post("/fiscal-years/source/close")
      .send({ retainedEarningsAccountId: equity.id });
    expect(res.status).toBe(200);
    expect(res.body.netIncome).toBe(reversalStatus === "POSTED" ? -200 : 1300);
    const generated = db.journalEntry.create.mock.calls[0]![0].data;
    expect(generated).toMatchObject({ type: "CLOSING", status: "POSTED" });
    expect(generated.totalDebit).toBe(generated.totalCredit);
    expect(generated.totalDebit).toBe(reversalStatus === "POSTED" ? 200 : 1500);
  });

  it.each(["DRAFT", "POSTED"])("rollover with a %s reversal carries only recognized source balances", async (reversalStatus) => {
    db.fiscalYear.findFirst.mockResolvedValueOnce({ ...fy, status: "CLOSED" })
      .mockResolvedValue(null);
    lines = [
      ...posting(status, cash, equity, 1500),
      ...posting(reversalStatus, equity, cash, 1500),
      ...posting("LOCKED", cash, liability, 200),
      ...posting("APPROVED", cash, equity, 9000),
    ];
    // Other organizations and historical years must remain excluded.
    const foreign = posting("LOCKED", cash, equity, 7000);
    foreign.forEach((line) => { line.journalEntry.organizationId = "other"; });
    const historical = posting("LOCKED", cash, equity, 8000);
    historical.forEach((line) => { line.journalEntry.fiscalYearId = "previous"; });
    lines.push(...foreign, ...historical);
    const res = await request(app).post("/fiscal-years/source/rollover").send({});
    expect(res.status).toBe(201);
    const generated = db.journalEntry.create.mock.calls[0]![0].data;
    expect(generated).toMatchObject({
      type: "OPENING", status: "POSTED",
      totalDebit: reversalStatus === "POSTED" ? 200 : 1700,
      totalCredit: reversalStatus === "POSTED" ? 200 : 1700,
    });
    expect(generated.lines.create).toContainEqual(expect.objectContaining({
      accountId: cash.id, debit: reversalStatus === "POSTED" ? 200 : 1700, credit: 0,
    }));
    expect(db.journalEntryLine.findMany.mock.calls[0]![0].where.journalEntry.fiscalYear)
      .toEqual({ organizationId: "org" });
  });
});
