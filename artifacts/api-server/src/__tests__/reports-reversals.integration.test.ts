import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  fiscalYear: { findFirst: vi.fn(), findMany: vi.fn() },
  chartOfAccount: { findFirst: vi.fn() },
  journalEntryLine: { findMany: vi.fn() },
}));
vi.mock("@workspace/prisma", () => ({ prisma: db }));
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: "test-user" }) }));
import reports from "../routes/reports";

const app = express();
app.use("/reports", reports);
const cash = { id: "cash", code: "1000", nameEn: "Cash", nameAr: "النقد", type: "ASSET", nature: "DEBIT", organizationId: "org", deletedAt: null };
const revenue = { ...cash, id: "revenue", code: "4000", nameEn: "Revenue", type: "REVENUE", nature: "CREDIT" };
const expense = { ...cash, id: "expense", code: "5000", nameEn: "Expense", type: "EXPENSE" };

function posting(
  id: string,
  status: string,
  date: string,
  debit: typeof cash,
  credit: typeof cash,
  amount: number,
  type = "MANUAL",
  baseAmount = amount,
) {
  const journalEntry = {
    id, number: id, status, type, entryDate: new Date(date), fiscalYearId: "fy", organizationId: "org",
    deletedAt: null as Date | null, descriptionEn: null, descriptionAr: null, reference: null,
  };
  return [
    { account: debit, debit: String(amount), credit: "0", debitBase: String(baseAmount), creditBase: "0" },
    { account: credit, debit: "0", credit: String(amount), debitBase: "0", creditBase: String(baseAmount) },
  ].map((line, index) => ({
    ...line, id: `${id}-${index}`, accountId: line.account.id,
    journalEntryId: id, journalEntry, lineNumber: index + 1,
  }));
}
let lines: ReturnType<typeof posting>;

type LineWhere = {
  accountId?: string;
  account?: { type?: { in: string[] }; organizationId?: string; deletedAt?: null };
  journalEntry?: {
    status?: string | { in: string[] };
    type?: { not: string };
    fiscalYearId?: string;
    organizationId?: string;
    deletedAt?: null;
    entryDate?: { lt?: Date; gte?: Date; lte?: Date };
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  lines = [
    ...posting("original", "REVERSED", "2026-01-10", cash, revenue, 1500),
    ...posting("reversal", "POSTED", "2026-02-10", revenue, cash, 1500),
    ...posting("separate-expense", "POSTED", "2026-02-20", expense, cash, 200),
  ];
  db.user.findFirst.mockResolvedValue({ id: "user", organizationId: "org" });
  db.fiscalYear.findFirst.mockResolvedValue({ id: "fy", organizationId: "org" });
  db.fiscalYear.findMany.mockResolvedValue([{
    id: "fy", organizationId: "org", previousFiscalYearId: null,
    startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
  }]);
  db.chartOfAccount.findFirst.mockResolvedValue(cash);
  // Honor the actual report predicates: a fixed mock return would hide the bug.
  db.journalEntryLine.findMany.mockImplementation(({ where }: { where: LineWhere }) =>
    Promise.resolve(lines.filter((line) => {
      const entry = line.journalEntry;
      const je = where.journalEntry ?? {};
      const account = where.account;
      if (where.accountId && line.accountId !== where.accountId) return false;
      if (account?.type && !account.type.in.includes(line.account.type)) return false;
      if (account?.organizationId && line.account.organizationId !== account.organizationId) return false;
      if (account && "deletedAt" in account && line.account.deletedAt !== null) return false;
      if (je.fiscalYearId && entry.fiscalYearId !== je.fiscalYearId) return false;
      if (je.organizationId && entry.organizationId !== je.organizationId) return false;
      if ("deletedAt" in je && entry.deletedAt !== null) return false;
      if (typeof je.status === "string" && entry.status !== je.status) return false;
      if (typeof je.status === "object" && !je.status.in.includes(entry.status)) return false;
      if (je.type && entry.type === je.type.not) return false;
      if (je.entryDate?.lt && entry.entryDate >= je.entryDate.lt) return false;
      if (je.entryDate?.gte && entry.entryDate < je.entryDate.gte) return false;
      if (je.entryDate?.lte && entry.entryDate > je.entryDate.lte) return false;
      return true;
    }).sort((a, b) => a.journalEntry.entryDate.getTime() - b.journalEntry.entryDate.getTime())),
  );
});

describe("income statement preserves activity after closing", () => {
  const equity = { ...cash, id: "equity", code: "3000", nameEn: "Net assets", type: "EQUITY", nature: "CREDIT" };

  function activity() {
    return [
      ...posting("receipt", "POSTED", "2026-01-10", cash, revenue, 1500, "RECEIPT"),
      ...posting("payment", "POSTED", "2026-02-20", expense, cash, 200, "PAYMENT"),
    ];
  }

  function closing() {
    // One balanced closing journal: Dr Revenue 1500, Cr Expense 200, Cr Equity 1300.
    return [
      posting("closing", "POSTED", "2026-12-31", revenue, equity, 1500, "CLOSING")[0]!,
      posting("closing", "POSTED", "2026-12-31", equity, expense, 200, "CLOSING")[1]!,
      posting("closing", "POSTED", "2026-12-31", revenue, equity, 1300, "CLOSING")[1]!,
    ];
  }

  it("keeps revenue 1500, expenses 200 and surplus 1300 before and after closing", async () => {
    lines = activity();
    const before = await income();
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ totalRevenue: 1500, totalExpenses: 200, netIncome: 1300 });
    lines.push(...closing());
    db.fiscalYear.findFirst.mockResolvedValue({ id: "fy", organizationId: "org", status: "CLOSED" });
    const after = await income();
    expect(after.status).toBe(200);
    expect(after.body).toEqual(before.body);
    expect(db.journalEntryLine.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        account: expect.objectContaining({ organizationId: "org" }),
        journalEntry: expect.objectContaining({
          fiscalYearId: "fy", organizationId: "org",
          fiscalYear: { organizationId: "org" },
          status: { in: ["POSTED", "REVERSED", "LOCKED"] },
          type: { not: "CLOSING" },
          entryDate: { gte: new Date("2026-01-01"), lte: new Date("2026-12-31") },
        }),
      }),
    }));
  });

  it("keeps other journal types and reversed originals with their reversals", async () => {
    lines = activity();
    lines.push(
      ...posting("extra-original", "REVERSED", "2026-03-01", cash, revenue, 700),
      ...posting("extra-reversal", "POSTED", "2026-03-02", revenue, cash, 700, "REVERSAL"),
      ...closing(),
    );
    const res = await income();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalRevenue: 1500, totalExpenses: 200, netIncome: 1300 });
  });

  it("still includes closing entries in trial balance, balance sheet and ledger", async () => {
    lines = [...activity(), ...closing()];
    const tb = await trial();
    expect(tb.status).toBe(200);
    expect(tb.body.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: "revenue", balance: 0 }),
      expect.objectContaining({ accountId: "expense", balance: 0 }),
      expect.objectContaining({ accountId: "equity", totalCredit: 1300, balance: -1300 }),
    ]));
    expect(tb.body).toMatchObject({ totalDebit: 3200, totalCredit: 3200 });
    const bs = await balance();
    expect(bs.status).toBe(200);
    expect(bs.body).toMatchObject({ totalAssets: 1300, totalEquity: 1300, isBalanced: true });
    db.chartOfAccount.findFirst.mockResolvedValue(revenue);
    const ledger = await request(app).get("/reports/account-ledger")
      .query({ accountId: "revenue", from: "2026-01-01", to: "2026-12-31" });
    expect(ledger.status).toBe(200);
    expect(ledger.body).toMatchObject({ totalDebit: 1500, totalCredit: 1500, endingBalance: 0 });
    expect(ledger.body.lines).toHaveLength(2);
  });
});

const trial = (asOf = "2026-12-31") =>
  request(app).get("/reports/trial-balance").query({ fiscalYearId: "fy", asOf });
const income = (to = "2026-12-31") =>
  request(app).get("/reports/income-statement").query({ fiscalYearId: "fy", from: "2026-01-01", to });
const balance = (asOf = "2026-12-31") =>
  request(app).get("/reports/balance-sheet").query({ fiscalYearId: "fy", asOf });

describe("financial reports include reversed originals exactly once", () => {
  it.each(["POSTED", "REVERSED", "LOCKED"])("recognizes %s exactly once across all four reports", async (status) => {
    lines = [
      ...posting("recognized", status, "2026-01-10", cash, revenue, 1500),
      ...posting("expense", "POSTED", "2026-02-20", expense, cash, 200),
    ];
    expect((await trial()).body).toMatchObject({ totalDebit: 1700, totalCredit: 1700 });
    expect((await income()).body).toMatchObject({ totalRevenue: 1500, totalExpenses: 200, netIncome: 1300 });
    expect((await balance()).body).toMatchObject({ totalAssets: 1300, totalEquity: 1300, isBalanced: true });
    const ledger = await request(app).get("/reports/account-ledger")
      .query({ accountId: "cash", from: "2026-02-01", to: "2026-12-31" });
    expect(ledger.status).toBe(200);
    expect(ledger.body).toMatchObject({ beginningBalance: 1500, totalCredit: 200, endingBalance: 1300 });
    expect(ledger.body.lines).toHaveLength(1);
  });

  it.each(["DRAFT", "UNDER_REVIEW", "APPROVED", "POSTED"])(
    "recognizes the original but only a posted reversal (reversal %s)", async (status) => {
      lines.find((line) => line.journalEntryId === "reversal")!.journalEntry.status = status;
      const posted = status === "POSTED";
      const net = posted ? -200 : 1300;
      const tb = await trial();
      expect(tb.body).toMatchObject({
        totalDebit: posted ? 3200 : 1700, totalCredit: posted ? 3200 : 1700,
      });
      expect((await income()).body).toMatchObject({
        totalRevenue: posted ? 0 : 1500, totalExpenses: 200, netIncome: net,
      });
      expect((await balance()).body).toMatchObject({ totalAssets: net, totalEquity: net, isBalanced: true });
      const ledger = await request(app).get("/reports/account-ledger")
        .query({ accountId: "cash", from: "2026-01-01", to: "2026-12-31" });
      expect(ledger.body.endingBalance).toBe(net);
      expect(ledger.body.lines).toHaveLength(posted ? 3 : 2);
    },
  );

  it("trial balance nets Cash to -200 and Revenue to zero without duplicating debits/credits", async () => {
    const res = await trial();
    expect(res.status).toBe(200);
    expect(res.body.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: "cash", totalDebit: 1500, totalCredit: 1700, balance: -200 }),
      expect.objectContaining({ accountId: "revenue", totalDebit: 1500, totalCredit: 1500, balance: 0 }),
      expect.objectContaining({ accountId: "expense", totalDebit: 200, totalCredit: 0, balance: 200 }),
    ]));
    expect(res.body.lines).toHaveLength(3);
    expect(res.body.totalDebit).toBe(3200);
    expect(res.body.totalCredit).toBe(3200);
  });

  it("income statement reports Revenue zero, Expenses 200, and Net Loss 200", async () => {
    const res = await income();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalRevenue: 0, totalExpenses: 200, netIncome: -200 });
  });

  it("balance sheet includes the loss in equity and remains balanced", async () => {
    const res = await balance();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalAssets: -200, totalLiabilities: 0, totalEquity: -200, isBalanced: true,
    });
    expect(res.body.assets).toEqual([expect.objectContaining({ accountId: "cash", balance: -200 })]);
    expect(res.body.equity).toEqual([expect.objectContaining({ balance: -200 })]);
  });

  it("a fully reversed pair alone has zero net impact in every report", async () => {
    lines = lines.filter((line) => line.journalEntryId !== "separate-expense");
    const tb = await trial();
    const is = await income();
    const bs = await balance();
    expect(tb.status).toBe(200);
    expect(tb.body.lines.every((line: { balance: number }) => line.balance === 0)).toBe(true);
    expect(tb.body).toMatchObject({ totalDebit: 3000, totalCredit: 3000 });
    expect(is.status).toBe(200);
    expect(is.body).toMatchObject({ totalRevenue: 0, totalExpenses: 0, netIncome: 0 });
    expect(bs.status).toBe(200);
    expect(bs.body).toMatchObject({ totalAssets: 0, totalEquity: 0, isBalanced: true });
  });

  it("ledger movement and opening balance include the original without changing signs", async () => {
    const full = await request(app).get("/reports/account-ledger")
      .query({ accountId: "cash", from: "2026-01-01", to: "2026-12-31" });
    expect(full.status).toBe(200);
    expect(full.body).toMatchObject({ beginningBalance: 0, totalDebit: 1500, totalCredit: 1700, endingBalance: -200 });
    expect(full.body.lines.map((line: { runningBalance: number }) => line.runningBalance)).toEqual([1500, 0, -200]);
    const later = await request(app).get("/reports/account-ledger")
      .query({ accountId: "cash", from: "2026-02-01", to: "2026-12-31" });
    expect(later.status).toBe(200);
    expect(later.body).toMatchObject({ beginningBalance: 1500, totalDebit: 0, totalCredit: 1700, endingBalance: -200 });
  });

  it("an as-of date before the reversal still includes the original posted impact", async () => {
    const tb = await trial("2026-01-31");
    const is = await income("2026-01-31");
    const bs = await balance("2026-01-31");
    expect(tb.body).toMatchObject({ totalDebit: 1500, totalCredit: 1500 });
    expect(is.body).toMatchObject({ totalRevenue: 1500, netIncome: 1500 });
    expect(bs.body).toMatchObject({ totalAssets: 1500, totalEquity: 1500, isBalanced: true });
  });

  it("continues to exclude unposted, voided, and deleted entries", async () => {
    for (const status of ["DRAFT", "SUBMITTED", "APPROVED", "VOIDED"]) {
      lines.push(...posting(status, status, "2026-03-01", cash, revenue, 9000));
    }
    const deleted = posting("deleted", "REVERSED", "2026-03-01", cash, revenue, 9000);
    deleted.forEach((line) => { line.journalEntry.deletedAt = new Date("2026-03-02"); });
    lines.push(...deleted);
    expect((await trial()).body).toMatchObject({ totalDebit: 3200, totalCredit: 3200 });
    expect((await income()).body).toMatchObject({ totalRevenue: 0, totalExpenses: 200, netIncome: -200 });
    expect((await balance()).body).toMatchObject({ totalAssets: -200, totalEquity: -200, isBalanced: true });
  });
});

describe("financial reports aggregate in organization base currency", () => {
  const liability = { ...cash, id: "liability", code: "2000", nameEn: "Liability", type: "LIABILITY", nature: "CREDIT" };
  const fxRevenue = { ...cash, id: "fx-revenue", code: "4000", nameEn: "FX Revenue", type: "REVENUE", nature: "CREDIT" };
  const fxExpense = { ...cash, id: "fx-expense", code: "5000", nameEn: "FX Expense", type: "EXPENSE", nature: "DEBIT" };

  beforeEach(() => {
    lines = [
      ...posting("usd-revenue", "POSTED", "2026-01-10", cash, fxRevenue, 1000, "MANUAL", 3750),
      ...posting("eur-expense", "POSTED", "2026-02-10", fxExpense, cash, 200, "MANUAL", 800),
      ...posting("usd-liability", "POSTED", "2026-03-10", cash, liability, 100, "MANUAL", 375),
    ];
  });

  it("uses base amounts in all four reports, including the ledger opening balance", async () => {
    const tb = await trial();
    expect(tb.status).toBe(200);
    expect(tb.body).toMatchObject({ totalDebit: 4925, totalCredit: 4925 });
    expect(tb.body.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: "cash", totalDebit: 4125, totalCredit: 800, balance: 3325 }),
      expect.objectContaining({ accountId: "liability", totalDebit: 0, totalCredit: 375, balance: -375 }),
      expect.objectContaining({ accountId: "fx-revenue", totalDebit: 0, totalCredit: 3750, balance: -3750 }),
      expect.objectContaining({ accountId: "fx-expense", totalDebit: 800, totalCredit: 0, balance: 800 }),
    ]));

    const bs = await balance();
    expect(bs.status).toBe(200);
    expect(bs.body).toMatchObject({
      totalAssets: 3325,
      totalLiabilities: 375,
      totalEquity: 2950,
      isBalanced: true,
    });

    const is = await income();
    expect(is.status).toBe(200);
    expect(is.body).toMatchObject({ totalRevenue: 3750, totalExpenses: 800, netIncome: 2950 });

    db.chartOfAccount.findFirst.mockResolvedValue(cash);
    const ledger = await request(app).get("/reports/account-ledger")
      .query({ accountId: "cash", from: "2026-01-01", to: "2026-12-31" });
    expect(ledger.status).toBe(200);
    expect(ledger.body).toMatchObject({
      beginningBalance: 0,
      totalDebit: 4125,
      totalCredit: 800,
      endingBalance: 3325,
    });
  });

  it("uses base amounts for the ledger opening balance and period movements", async () => {
    db.chartOfAccount.findFirst.mockResolvedValue(cash);
    const ledger = await request(app).get("/reports/account-ledger")
      .query({ accountId: "cash", from: "2026-02-01", to: "2026-12-31" });

    expect(ledger.status).toBe(200);
    expect(ledger.body).toMatchObject({
      beginningBalance: 3750,
      totalDebit: 375,
      totalCredit: 800,
      endingBalance: 3325,
    });
    expect(ledger.body.lines.map((line: { debit: number; credit: number; runningBalance: number }) => ({
      debit: line.debit,
      credit: line.credit,
      runningBalance: line.runningBalance,
    }))).toEqual([
      { debit: 0, credit: 800, runningBalance: 2950 },
      { debit: 375, credit: 0, runningBalance: 3325 },
    ]);
  });
});
