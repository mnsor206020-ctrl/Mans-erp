import { describe, it, expect } from "vitest";

// ─── Running balance calculation (pure logic, extracted for unit testing) ─────

function calcRunningBalance(
  lines: { debit: number; credit: number }[],
): { debit: number; credit: number; runningBalance: number }[] {
  let balance = 0;
  return lines.map((l) => {
    balance += l.debit - l.credit;
    return { ...l, runningBalance: balance };
  });
}

describe("Account Ledger — running balance logic", () => {
  it("starts at zero with no lines", () => {
    expect(calcRunningBalance([])).toEqual([]);
  });

  it("single debit line produces positive balance", () => {
    const result = calcRunningBalance([{ debit: 1000, credit: 0 }]);
    expect(result[0].runningBalance).toBe(1000);
  });

  it("single credit line produces negative balance", () => {
    const result = calcRunningBalance([{ debit: 0, credit: 500 }]);
    expect(result[0].runningBalance).toBe(-500);
  });

  it("accumulates balance across multiple lines", () => {
    const lines = [
      { debit: 1000, credit: 0 },
      { debit: 0,    credit: 300 },
      { debit: 200,  credit: 0 },
    ];
    const result = calcRunningBalance(lines);
    expect(result[0].runningBalance).toBe(1000);
    expect(result[1].runningBalance).toBe(700);
    expect(result[2].runningBalance).toBe(900);
  });

  it("balance reaches zero when debits equal credits", () => {
    const lines = [
      { debit: 500, credit: 0 },
      { debit: 0,   credit: 500 },
    ];
    const result = calcRunningBalance(lines);
    expect(result[1].runningBalance).toBe(0);
  });

  it("handles Decimal-converted numbers (float precision)", () => {
    const lines = [
      { debit: 1000.5, credit: 0 },
      { debit: 0,      credit: 0.5 },
    ];
    const result = calcRunningBalance(lines);
    expect(result[1].runningBalance).toBeCloseTo(1000, 5);
  });

  it("preserves each row's own debit and credit", () => {
    const lines = [
      { debit: 750, credit: 0 },
      { debit: 0,   credit: 250 },
    ];
    const result = calcRunningBalance(lines);
    expect(result[0].debit).toBe(750);
    expect(result[0].credit).toBe(0);
    expect(result[1].debit).toBe(0);
    expect(result[1].credit).toBe(250);
  });

  it("large batch — final balance equals total debit minus total credit", () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({
      debit:  i % 2 === 0 ? (i + 1) * 100 : 0,
      credit: i % 2 === 1 ? (i + 1) * 100 : 0,
    }));
    const result = calcRunningBalance(lines);
    const totalDebit  = lines.reduce((s, l) => s + l.debit,  0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(result[result.length - 1].runningBalance).toBeCloseTo(totalDebit - totalCredit, 5);
  });
});
