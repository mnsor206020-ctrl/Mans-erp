import { describe, it, expect } from "vitest";

interface AccountEntry {
  accountId:   string;
  totalDebit:  number;
  totalCredit: number;
}

interface OpeningLine {
  accountId:  string;
  lineNumber: number;
  debit:      number;
  credit:     number;
}

function buildOpeningLines(accounts: AccountEntry[]): {
  lines:               OpeningLine[];
  totalOpeningDebits:  number;
  totalOpeningCredits: number;
} {
  const lines: OpeningLine[] = [];
  let lineNumber = 1;
  let totalOpeningDebits  = 0;
  let totalOpeningCredits = 0;

  for (const acc of accounts) {
    const netDebit = acc.totalDebit - acc.totalCredit;
    if (netDebit === 0) continue;
    if (netDebit > 0) {
      lines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: netDebit, credit: 0 });
      totalOpeningDebits += netDebit;
    } else {
      lines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: 0, credit: -netDebit });
      totalOpeningCredits += -netDebit;
    }
  }

  return { lines, totalOpeningDebits, totalOpeningCredits };
}

function computeNewFYDates(sourceEndDate: Date) {
  const newStartDate = new Date(sourceEndDate);
  newStartDate.setDate(newStartDate.getDate() + 1);
  const newEndDate = new Date(newStartDate);
  newEndDate.setFullYear(newEndDate.getFullYear() + 1);
  newEndDate.setDate(newEndDate.getDate() - 1);
  return { newStartDate, newEndDate };
}

describe("buildOpeningLines — carries forward balance sheet balances", () => {
  const accounts: AccountEntry[] = [
    { accountId: "cash-1",     totalDebit: 100000, totalCredit: 20000 }, // ASSET, net debit 80000
    { accountId: "ap-1",       totalDebit: 5000,   totalCredit: 25000 }, // LIABILITY, net credit 20000
    { accountId: "capital-1",  totalDebit: 0,      totalCredit: 60000 }, // EQUITY, net credit 60000
  ];

  it("creates a debit line for an asset account with a debit balance", () => {
    const { lines } = buildOpeningLines(accounts);
    const cash = lines.find((l) => l.accountId === "cash-1");
    expect(cash).toBeDefined();
    expect(cash!.debit).toBe(80000);
    expect(cash!.credit).toBe(0);
  });

  it("creates a credit line for a liability account with a credit balance", () => {
    const { lines } = buildOpeningLines(accounts);
    const ap = lines.find((l) => l.accountId === "ap-1");
    expect(ap).toBeDefined();
    expect(ap!.credit).toBe(20000);
    expect(ap!.debit).toBe(0);
  });

  it("creates a credit line for an equity account with a credit balance", () => {
    const { lines } = buildOpeningLines(accounts);
    const capital = lines.find((l) => l.accountId === "capital-1");
    expect(capital).toBeDefined();
    expect(capital!.credit).toBe(60000);
  });

  it("produces a naturally balanced entry (no plug line needed)", () => {
    const { totalOpeningDebits, totalOpeningCredits } = buildOpeningLines(accounts);
    expect(totalOpeningDebits).toBe(totalOpeningCredits);
    expect(totalOpeningDebits).toBe(80000);
  });
});

describe("buildOpeningLines — skips zero-balance accounts", () => {
  const accounts: AccountEntry[] = [
    { accountId: "acc-1", totalDebit: 500, totalCredit: 500 }, // zero balance
    { accountId: "acc-2", totalDebit: 1000, totalCredit: 0 },
  ];

  it("excludes the zero-balance account", () => {
    const { lines } = buildOpeningLines(accounts);
    expect(lines.find((l) => l.accountId === "acc-1")).toBeUndefined();
    expect(lines.find((l) => l.accountId === "acc-2")).toBeDefined();
  });
});

describe("buildOpeningLines — no balance sheet accounts", () => {
  it("returns an empty lines array", () => {
    const { lines, totalOpeningDebits, totalOpeningCredits } = buildOpeningLines([]);
    expect(lines).toHaveLength(0);
    expect(totalOpeningDebits).toBe(0);
    expect(totalOpeningCredits).toBe(0);
  });
});

describe("computeNewFYDates — auto-derives next fiscal year window", () => {
  it("starts the day after the source fiscal year ends", () => {
    const { newStartDate } = computeNewFYDates(new Date("2025-12-31"));
    expect(newStartDate.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("ends exactly one year minus a day after the new start date", () => {
    const { newStartDate, newEndDate } = computeNewFYDates(new Date("2025-12-31"));
    expect(newStartDate.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(newEndDate.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("handles non-calendar-year fiscal years correctly", () => {
    const { newStartDate, newEndDate } = computeNewFYDates(new Date("2025-06-30"));
    expect(newStartDate.toISOString().slice(0, 10)).toBe("2025-07-01");
    expect(newEndDate.toISOString().slice(0, 10)).toBe("2026-06-30");
  });
});
