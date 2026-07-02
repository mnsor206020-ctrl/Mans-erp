import { describe, it, expect } from "vitest";

// ─── Inline aggregation logic (mirrors reports.ts) ───────────────────────────

type RawLine = {
  accountId: string;
  debit:     string | number;
  credit:    string | number;
  account:   { id: string; code: string; nameEn: string; nameAr: string };
};

function aggregateTrialBalance(lines: RawLine[]) {
  const accountMap = new Map<string, {
    accountId:     string;
    accountCode:   string;
    accountNameEn: string;
    accountNameAr: string;
    totalDebit:    number;
    totalCredit:   number;
  }>();

  for (const line of lines) {
    const key      = line.accountId;
    const existing = accountMap.get(key);
    if (existing) {
      existing.totalDebit  += Number(line.debit);
      existing.totalCredit += Number(line.credit);
    } else {
      accountMap.set(key, {
        accountId:     line.accountId,
        accountCode:   line.account.code,
        accountNameEn: line.account.nameEn,
        accountNameAr: line.account.nameAr,
        totalDebit:    Number(line.debit),
        totalCredit:   Number(line.credit),
      });
    }
  }

  return Array.from(accountMap.values())
    .map(row => ({ ...row, balance: row.totalDebit - row.totalCredit }))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCT_A = { id: "aaaa0001-0000-0000-0000-000000000001", code: "1000", nameEn: "Cash",    nameAr: "النقدية"    };
const ACCT_B = { id: "bbbb0002-0000-0000-0000-000000000002", code: "2000", nameEn: "Revenue", nameAr: "الإيرادات" };
const ACCT_C = { id: "cccc0003-0000-0000-0000-000000000003", code: "1500", nameEn: "AR",      nameAr: "المدينون"  };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Trial Balance aggregation", () => {
  it("TB-U-01: returns empty array for no lines", () => {
    expect(aggregateTrialBalance([])).toEqual([]);
  });

  it("TB-U-02: aggregates debit across multiple lines for same account", () => {
    const result = aggregateTrialBalance([
      { accountId: ACCT_A.id, debit: "1000.00", credit: "0.00", account: ACCT_A },
      { accountId: ACCT_A.id, debit: "500.00",  credit: "0.00", account: ACCT_A },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].totalDebit).toBe(1500);
    expect(result[0].totalCredit).toBe(0);
  });

  it("TB-U-03: aggregates credit across multiple lines for same account", () => {
    const result = aggregateTrialBalance([
      { accountId: ACCT_B.id, debit: "0.00", credit: "400.00", account: ACCT_B },
      { accountId: ACCT_B.id, debit: "0.00", credit: "600.00", account: ACCT_B },
    ]);
    expect(result[0].totalCredit).toBe(1000);
    expect(result[0].totalDebit).toBe(0);
  });

  it("TB-U-04: keeps accounts independent", () => {
    const result = aggregateTrialBalance([
      { accountId: ACCT_A.id, debit: "1000.00", credit: "0.00",    account: ACCT_A },
      { accountId: ACCT_B.id, debit: "0.00",    credit: "1000.00", account: ACCT_B },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.accountId === ACCT_A.id)?.totalDebit).toBe(1000);
    expect(result.find(r => r.accountId === ACCT_B.id)?.totalCredit).toBe(1000);
  });

  it("TB-U-05: balance = totalDebit - totalCredit", () => {
    const result = aggregateTrialBalance([
      { accountId: ACCT_A.id, debit: "1500.00", credit: "300.00", account: ACCT_A },
    ]);
    expect(result[0].balance).toBe(1200);
  });

  it("TB-U-06: balance is negative when credit > debit", () => {
    const result = aggregateTrialBalance([
      { accountId: ACCT_B.id, debit: "200.00", credit: "800.00", account: ACCT_B },
    ]);
    expect(result[0].balance).toBe(-600);
  });

  it("TB-U-07: sorts results by accountCode ascending", () => {
    const result = aggregateTrialBalance([
      { accountId: ACCT_B.id, debit: "0.00",    credit: "1000.00", account: ACCT_B },
      { accountId: ACCT_C.id, debit: "500.00",  credit: "0.00",    account: ACCT_C },
      { accountId: ACCT_A.id, debit: "1000.00", credit: "0.00",    account: ACCT_A },
    ]);
    expect(result[0].accountCode).toBe("1000");
    expect(result[1].accountCode).toBe("1500");
    expect(result[2].accountCode).toBe("2000");
  });

  it("TB-U-08: Decimal string values are converted to numbers correctly", () => {
    const result = aggregateTrialBalance([
      { accountId: ACCT_A.id, debit: "9999.9999", credit: "0.0001", account: ACCT_A },
    ]);
    expect(result[0].totalDebit).toBeCloseTo(9999.9999, 4);
    expect(result[0].totalCredit).toBeCloseTo(0.0001, 4);
  });

  it("TB-U-09: maps account metadata from first occurrence", () => {
    const result = aggregateTrialBalance([
      { accountId: ACCT_A.id, debit: "100.00", credit: "0.00", account: ACCT_A },
    ]);
    expect(result[0].accountCode).toBe(ACCT_A.code);
    expect(result[0].accountNameEn).toBe(ACCT_A.nameEn);
    expect(result[0].accountNameAr).toBe(ACCT_A.nameAr);
  });
});
