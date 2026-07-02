import { describe, it, expect } from "vitest";

// ─── Balance calculation logic (mirrored from reports.ts) ──────────────────────

type AccountNature = "DEBIT" | "CREDIT";
type AccountType   = "REVENUE" | "EXPENSE";

interface RawAccount {
  accountId:     string;
  accountCode:   string;
  accountNameEn: string;
  accountNameAr: string;
  type:          AccountType;
  nature:        AccountNature;
  totalDebit:    number;
  totalCredit:   number;
}

function calcBalance(nature: AccountNature, debit: number, credit: number): number {
  return nature === "CREDIT" ? credit - debit : debit - credit;
}

function buildSections(accounts: RawAccount[]) {
  const revenue:  { accountId: string; accountCode: string; balance: number }[] = [];
  const expenses: typeof revenue = [];

  for (const acc of accounts) {
    const balance = calcBalance(acc.nature, acc.totalDebit, acc.totalCredit);
    const row = { accountId: acc.accountId, accountCode: acc.accountCode, balance };
    if      (acc.type === "REVENUE") revenue.push(row);
    else if (acc.type === "EXPENSE") expenses.push(row);
  }

  const totalRevenue  = revenue.reduce((s, r) => s + r.balance, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0);
  const netIncome     = totalRevenue - totalExpenses;

  return { revenue, expenses, totalRevenue, totalExpenses, netIncome };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Income Statement — balance calculation", () => {
  it("CREDIT nature (revenue): balance = credit − debit", () => {
    expect(calcBalance("CREDIT", 500, 8000)).toBe(7500);
  });

  it("DEBIT nature (expense): balance = debit − credit", () => {
    expect(calcBalance("DEBIT", 3000, 200)).toBe(2800);
  });

  it("CREDIT nature with no debits gives full credit as balance", () => {
    expect(calcBalance("CREDIT", 0, 5000)).toBe(5000);
  });

  it("DEBIT nature with no credits gives full debit as balance", () => {
    expect(calcBalance("DEBIT", 1200, 0)).toBe(1200);
  });

  it("returns zero when debit equals credit for CREDIT nature", () => {
    expect(calcBalance("CREDIT", 1000, 1000)).toBe(0);
  });

  it("returns zero when debit equals credit for DEBIT nature", () => {
    expect(calcBalance("DEBIT", 500, 500)).toBe(0);
  });
});

describe("Income Statement — section grouping and net income", () => {
  const accounts: RawAccount[] = [
    { accountId: "r1", accountCode: "4010", accountNameEn: "Sales",   accountNameAr: "مبيعات",   type: "REVENUE", nature: "CREDIT", totalDebit: 0,    totalCredit: 50000 },
    { accountId: "r2", accountCode: "4020", accountNameEn: "Other",   accountNameAr: "أخرى",    type: "REVENUE", nature: "CREDIT", totalDebit: 200,  totalCredit: 5000  },
    { accountId: "e1", accountCode: "5010", accountNameEn: "Salaries",accountNameAr: "رواتب",   type: "EXPENSE", nature: "DEBIT",  totalDebit: 20000, totalCredit: 0    },
    { accountId: "e2", accountCode: "5020", accountNameEn: "Rent",    accountNameAr: "إيجار",   type: "EXPENSE", nature: "DEBIT",  totalDebit: 10000, totalCredit: 500  },
  ];

  it("places accounts in correct sections", () => {
    const r = buildSections(accounts);
    expect(r.revenue).toHaveLength(2);
    expect(r.expenses).toHaveLength(2);
  });

  it("computes totalRevenue correctly", () => {
    const r = buildSections(accounts);
    // (50000 - 0) + (5000 - 200) = 50000 + 4800 = 54800
    expect(r.totalRevenue).toBe(54800);
  });

  it("computes totalExpenses correctly", () => {
    const r = buildSections(accounts);
    // (20000 - 0) + (10000 - 500) = 20000 + 9500 = 29500
    expect(r.totalExpenses).toBe(29500);
  });

  it("computes netIncome = totalRevenue − totalExpenses", () => {
    const r = buildSections(accounts);
    expect(r.netIncome).toBe(r.totalRevenue - r.totalExpenses);
    expect(r.netIncome).toBe(25300);
  });

  it("netIncome is negative when expenses exceed revenue (net loss)", () => {
    const lossAccounts: RawAccount[] = [
      { accountId: "r1", accountCode: "4010", accountNameEn: "Sales", accountNameAr: "مبيعات", type: "REVENUE", nature: "CREDIT", totalDebit: 0, totalCredit: 1000 },
      { accountId: "e1", accountCode: "5010", accountNameEn: "Cost",  accountNameAr: "تكاليف", type: "EXPENSE", nature: "DEBIT",  totalDebit: 5000, totalCredit: 0 },
    ];
    const r = buildSections(lossAccounts);
    expect(r.netIncome).toBe(-4000);
  });

  it("empty sections produce zero totals and netIncome=0", () => {
    const r = buildSections([]);
    expect(r.totalRevenue).toBe(0);
    expect(r.totalExpenses).toBe(0);
    expect(r.netIncome).toBe(0);
  });
});
