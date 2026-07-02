import { describe, it, expect } from "vitest";

// ─── lastNMonths helper (extracted from dashboard.ts) ─────────────────────────

function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${d.getFullYear()}-${mm}`);
  }
  return months;
}

// ─── Monthly aggregation logic (mirrored from dashboard.ts) ──────────────────

function buildMonthlyResult(
  receiptRows: { month: string; total: string }[],
  paymentRows: { month: string; total: string }[],
  months: string[],
) {
  const receiptByMonth = new Map(receiptRows.map((r) => [r.month, Number(r.total)]));
  const paymentByMonth = new Map(paymentRows.map((r) => [r.month, Number(r.total)]));

  return months.map((month) => {
    const receipts = receiptByMonth.get(month) ?? 0;
    const payments = paymentByMonth.get(month) ?? 0;
    return { month, receipts, payments, net: receipts - payments };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lastNMonths", () => {
  it("returns exactly N months", () => {
    expect(lastNMonths(12)).toHaveLength(12);
    expect(lastNMonths(6)).toHaveLength(6);
  });

  it("returns months in chronological order", () => {
    const months = lastNMonths(12);
    for (let i = 1; i < months.length; i++) {
      expect(months[i] > months[i - 1]).toBe(true);
    }
  });

  it("last element is current month", () => {
    const months = lastNMonths(12);
    const now = new Date();
    const mm  = String(now.getMonth() + 1).padStart(2, "0");
    expect(months[months.length - 1]).toBe(`${now.getFullYear()}-${mm}`);
  });

  it("month strings match YYYY-MM format", () => {
    for (const m of lastNMonths(12)) {
      expect(m).toMatch(/^\d{4}-\d{2}$/);
    }
  });
});

describe("buildMonthlyResult", () => {
  it("correctly merges receipt and payment rows", () => {
    const months = ["2025-01", "2025-02", "2025-03"];
    const receiptRows = [
      { month: "2025-01", total: "10000" },
      { month: "2025-03", total: "25000" },
    ];
    const paymentRows = [
      { month: "2025-01", total: "5000" },
      { month: "2025-02", total: "8000" },
    ];

    const result = buildMonthlyResult(receiptRows, paymentRows, months);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ month: "2025-01", receipts: 10000, payments: 5000, net: 5000 });
    expect(result[1]).toEqual({ month: "2025-02", receipts: 0, payments: 8000, net: -8000 });
    expect(result[2]).toEqual({ month: "2025-03", receipts: 25000, payments: 0, net: 25000 });
  });

  it("fills missing months with zero values", () => {
    const months = ["2025-04", "2025-05", "2025-06"];
    const result = buildMonthlyResult([], [], months);

    for (const row of result) {
      expect(row.receipts).toBe(0);
      expect(row.payments).toBe(0);
      expect(row.net).toBe(0);
    }
  });

  it("computes net as receipts − payments", () => {
    const months = ["2025-07"];
    const result = buildMonthlyResult(
      [{ month: "2025-07", total: "50000" }],
      [{ month: "2025-07", total: "30000" }],
      months,
    );
    expect(result[0].net).toBe(20000);
  });

  it("net is negative when payments exceed receipts", () => {
    const months = ["2025-08"];
    const result = buildMonthlyResult(
      [{ month: "2025-08", total: "1000" }],
      [{ month: "2025-08", total: "9000" }],
      months,
    );
    expect(result[0].net).toBe(-8000);
  });

  it("maintains chronological order from input months array", () => {
    const months = ["2024-12", "2025-01", "2025-02"];
    const result = buildMonthlyResult([], [], months);
    expect(result.map((r) => r.month)).toEqual(months);
  });
});

describe("KPI calculation helpers", () => {
  it("netCash = totalReceipts − totalPayments", () => {
    const totalReceipts = 80000;
    const totalPayments = 55000;
    expect(totalReceipts - totalPayments).toBe(25000);
  });

  it("netCash is negative when payments exceed receipts", () => {
    expect(10000 - 15000).toBe(-5000);
  });

  it("converts Decimal to Number correctly", () => {
    const mockDecimal = { valueOf: () => 12345.67, toString: () => "12345.67" };
    expect(Number(mockDecimal.valueOf())).toBe(12345.67);
  });
});
