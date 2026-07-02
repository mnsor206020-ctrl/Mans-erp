import { describe, it, expect } from "vitest";

// ─── Pure logic mirrored from the close endpoint ──────────────────────────────

interface AccountEntry {
  accountId:   string;
  totalDebit:  number;
  totalCredit: number;
}

interface ClosingLine {
  accountId:  string;
  lineNumber: number;
  debit:      number;
  credit:     number;
}

function buildClosingLines(
  accounts: AccountEntry[],
  retainedEarningsAccountId: string,
): {
  lines:               ClosingLine[];
  totalClosingDebits:  number;
  totalClosingCredits: number;
  netIncome:           number;
} {
  const lines: ClosingLine[] = [];
  let lineNumber = 1;
  let totalClosingDebits  = 0;
  let totalClosingCredits = 0;

  for (const acc of accounts) {
    const netDebit = acc.totalDebit - acc.totalCredit;
    if (netDebit === 0) continue;
    if (netDebit > 0) {
      lines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: 0, credit: netDebit });
      totalClosingCredits += netDebit;
    } else {
      lines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: -netDebit, credit: 0 });
      totalClosingDebits += -netDebit;
    }
  }

  const imbalance = totalClosingDebits - totalClosingCredits;

  if (imbalance > 0) {
    lines.push({ accountId: retainedEarningsAccountId, lineNumber: lineNumber++, debit: 0, credit: imbalance });
    totalClosingCredits += imbalance;
  } else if (imbalance < 0) {
    lines.push({ accountId: retainedEarningsAccountId, lineNumber: lineNumber++, debit: -imbalance, credit: 0 });
    totalClosingDebits += -imbalance;
  }

  return { lines, totalClosingDebits, totalClosingCredits, netIncome: imbalance };
}

const RE_ID = "re-account-id";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildClosingLines — profit scenario", () => {
  // Revenue: credit 50000, Expenses: debit 30000 → net income 20000
  const accounts: AccountEntry[] = [
    { accountId: "rev-1", totalDebit: 0,     totalCredit: 50000 },
    { accountId: "exp-1", totalDebit: 30000, totalCredit: 0     },
  ];

  it("creates a debit line to zero the revenue account", () => {
    const { lines } = buildClosingLines(accounts, RE_ID);
    const rev = lines.find((l) => l.accountId === "rev-1");
    expect(rev).toBeDefined();
    expect(rev!.debit).toBe(50000);
    expect(rev!.credit).toBe(0);
  });

  it("creates a credit line to zero the expense account", () => {
    const { lines } = buildClosingLines(accounts, RE_ID);
    const exp = lines.find((l) => l.accountId === "exp-1");
    expect(exp).toBeDefined();
    expect(exp!.debit).toBe(0);
    expect(exp!.credit).toBe(30000);
  });

  it("credits retained earnings for the net income", () => {
    const { lines } = buildClosingLines(accounts, RE_ID);
    const re = lines.find((l) => l.accountId === RE_ID);
    expect(re).toBeDefined();
    expect(re!.credit).toBe(20000);
    expect(re!.debit).toBe(0);
  });

  it("produces a balanced entry (total debits = total credits)", () => {
    const { totalClosingDebits, totalClosingCredits } = buildClosingLines(accounts, RE_ID);
    expect(totalClosingDebits).toBe(totalClosingCredits);
    expect(totalClosingDebits).toBe(50000);
  });

  it("returns netIncome = 20000 (positive = profit)", () => {
    const { netIncome } = buildClosingLines(accounts, RE_ID);
    expect(netIncome).toBe(20000);
  });
});

describe("buildClosingLines — loss scenario", () => {
  // Revenue: credit 20000, Expenses: debit 35000 → net loss 15000
  const accounts: AccountEntry[] = [
    { accountId: "rev-1", totalDebit: 0,     totalCredit: 20000 },
    { accountId: "exp-1", totalDebit: 35000, totalCredit: 0     },
  ];

  it("debits retained earnings for the net loss", () => {
    const { lines } = buildClosingLines(accounts, RE_ID);
    const re = lines.find((l) => l.accountId === RE_ID);
    expect(re).toBeDefined();
    expect(re!.debit).toBe(15000);
    expect(re!.credit).toBe(0);
  });

  it("produces a balanced entry", () => {
    const { totalClosingDebits, totalClosingCredits } = buildClosingLines(accounts, RE_ID);
    expect(totalClosingDebits).toBe(totalClosingCredits);
    expect(totalClosingDebits).toBe(35000);
  });

  it("returns netIncome = -15000 (negative = loss)", () => {
    const { netIncome } = buildClosingLines(accounts, RE_ID);
    expect(netIncome).toBe(-15000);
  });
});

describe("buildClosingLines — break-even scenario", () => {
  // Revenue = Expenses = 10000 → no RE line
  const accounts: AccountEntry[] = [
    { accountId: "rev-1", totalDebit: 0,     totalCredit: 10000 },
    { accountId: "exp-1", totalDebit: 10000, totalCredit: 0     },
  ];

  it("does NOT add a retained earnings line when net = 0", () => {
    const { lines } = buildClosingLines(accounts, RE_ID);
    const re = lines.find((l) => l.accountId === RE_ID);
    expect(re).toBeUndefined();
  });

  it("is balanced without a retained earnings line", () => {
    const { totalClosingDebits, totalClosingCredits } = buildClosingLines(accounts, RE_ID);
    expect(totalClosingDebits).toBe(totalClosingCredits);
  });

  it("returns netIncome = 0", () => {
    const { netIncome } = buildClosingLines(accounts, RE_ID);
    expect(netIncome).toBe(0);
  });
});

describe("buildClosingLines — accounts with zero balance", () => {
  const accounts: AccountEntry[] = [
    { accountId: "rev-1", totalDebit: 5000,  totalCredit: 5000  }, // zero balance → skip
    { accountId: "rev-2", totalDebit: 0,     totalCredit: 10000 }, // has balance
  ];

  it("skips accounts with zero net balance", () => {
    const { lines } = buildClosingLines(accounts, RE_ID);
    const skipped = lines.find((l) => l.accountId === "rev-1");
    expect(skipped).toBeUndefined();
  });

  it("includes accounts with non-zero net balance", () => {
    const { lines } = buildClosingLines(accounts, RE_ID);
    const included = lines.find((l) => l.accountId === "rev-2");
    expect(included).toBeDefined();
  });
});

describe("buildClosingLines — multiple accounts", () => {
  const accounts: AccountEntry[] = [
    { accountId: "rev-1", totalDebit: 100,   totalCredit: 80000 },
    { accountId: "rev-2", totalDebit: 0,     totalCredit: 20000 },
    { accountId: "exp-1", totalDebit: 30000, totalCredit: 0     },
    { accountId: "exp-2", totalDebit: 15000, totalCredit: 1000  },
    { accountId: "exp-3", totalDebit: 0,     totalCredit: 0     }, // zero → skipped
  ];

  it("assigns sequential line numbers", () => {
    const { lines } = buildClosingLines(accounts, RE_ID);
    const numbers = lines.map((l) => l.lineNumber);
    for (let i = 0; i < numbers.length - 1; i++) {
      expect(numbers[i + 1]).toBe(numbers[i] + 1);
    }
  });

  it("produces a balanced entry across multiple accounts", () => {
    const { totalClosingDebits, totalClosingCredits } = buildClosingLines(accounts, RE_ID);
    expect(totalClosingDebits).toBe(totalClosingCredits);
  });
});
