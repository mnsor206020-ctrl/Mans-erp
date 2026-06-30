import { describe, it, expect, vi } from "vitest";
import {
  formatJENumber,
  createHeaderSchema,
  lineSchema,
  validateBalance,
  validateAccounts,
} from "../lib/journal-entry-utils";

// ── formatJENumber ────────────────────────────────────────────────────────────

describe("formatJENumber", () => {
  it("formats the first entry of a year as JE-YYYY-0001", () => {
    expect(formatJENumber(2026, 1)).toBe("JE-2026-0001");
  });

  it("formats the 10th entry of a year as JE-YYYY-0010", () => {
    expect(formatJENumber(2026, 10)).toBe("JE-2026-0010");
  });

  it("resets sequence number to 0001 on a year boundary", () => {
    expect(formatJENumber(2027, 1)).toBe("JE-2027-0001");
  });
});

// ── validateBalance ───────────────────────────────────────────────────────────

describe("validateBalance", () => {
  it("U-1: two lines with equal debit and credit totals → balanced", () => {
    const result = validateBalance([
      { debit: 500, credit: 0 },
      { debit: 0,   credit: 500 },
    ]);
    expect(result.balanced).toBe(true);
    expect(result.totalDebit).toBe(500);
    expect(result.totalCredit).toBe(500);
  });

  it("U-2: debit total does not equal credit total → not balanced", () => {
    const result = validateBalance([
      { debit: 500, credit: 0 },
      { debit: 0,   credit: 400 },
    ]);
    expect(result.balanced).toBe(false);
    expect(result.totalDebit).toBe(500);
    expect(result.totalCredit).toBe(400);
  });

  it("U-3: difference of 0.009 is within tolerance → balanced", () => {
    const result = validateBalance([
      { debit: 100.009, credit: 0 },
      { debit: 0,       credit: 100 },
    ]);
    expect(result.balanced).toBe(true);
  });

  it("U-4: difference of 0.011 exceeds tolerance → not balanced", () => {
    const result = validateBalance([
      { debit: 100.011, credit: 0 },
      { debit: 0,       credit: 100 },
    ]);
    expect(result.balanced).toBe(false);
  });
});

// ── validateAccounts ─────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const ACC_ID = "eeeeeeee-0000-0000-0000-000000000005";

function makeMockPrisma(account: object | null) {
  return {
    chartOfAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
    },
  };
}

describe("validateAccounts", () => {
  it("U-5: inactive account → error containing 'not active'", async () => {
    const p = makeMockPrisma({ code: "1001", nameEn: "Cash", isActive: false, isGroup: false, allowDirectEntry: true });
    const errors = await validateAccounts([{ accountId: ACC_ID }], ORG_ID, p);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/not active/i);
  });

  it("U-6: group account → error containing 'group account'", async () => {
    const p = makeMockPrisma({ code: "1000", nameEn: "Current Assets", isActive: true, isGroup: true, allowDirectEntry: false });
    const errors = await validateAccounts([{ accountId: ACC_ID }], ORG_ID, p);
    expect(errors.some((e) => /group account/i.test(e))).toBe(true);
  });

  it("U-7: account with allowDirectEntry=false → error containing 'direct entries'", async () => {
    const p = makeMockPrisma({ code: "9999", nameEn: "Summary Account", isActive: true, isGroup: false, allowDirectEntry: false });
    const errors = await validateAccounts([{ accountId: ACC_ID }], ORG_ID, p);
    expect(errors.some((e) => /direct entries/i.test(e))).toBe(true);
  });

  it("U-8: valid account → returns empty error array", async () => {
    const p = makeMockPrisma({ code: "1001", nameEn: "Cash", isActive: true, isGroup: false, allowDirectEntry: true });
    const errors = await validateAccounts([{ accountId: ACC_ID }], ORG_ID, p);
    expect(errors).toHaveLength(0);
  });

  it("U-9: account not found → error containing 'not found'", async () => {
    const p = makeMockPrisma(null);
    const errors = await validateAccounts([{ accountId: ACC_ID }], ORG_ID, p);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/not found/i);
  });
});

// ── lineSchema (Zod) ─────────────────────────────────────────────────────────

describe("lineSchema", () => {
  it("U-12: line with both debit=0 and credit=0 → fails refine", () => {
    const result = lineSchema.safeParse({
      accountId: "eeeeeeee-0000-0000-0000-000000000005",
      lineNumber: 1,
      debit: 0,
      credit: 0,
    });
    expect(result.success).toBe(false);
  });

  it("U-13: line with debit>0 and credit=0 → passes", () => {
    const result = lineSchema.safeParse({
      accountId: "eeeeeeee-0000-0000-0000-000000000005",
      lineNumber: 1,
      debit: 100,
      credit: 0,
    });
    expect(result.success).toBe(true);
  });

  it("line with credit>0 and debit=0 → passes", () => {
    const result = lineSchema.safeParse({
      accountId: "eeeeeeee-0000-0000-0000-000000000005",
      lineNumber: 1,
      debit: 0,
      credit: 100,
    });
    expect(result.success).toBe(true);
  });
});

// ── createHeaderSchema (Zod) ─────────────────────────────────────────────────

describe("createHeaderSchema", () => {
  it("rejects a payload that is missing fiscalYearId", () => {
    const result = createHeaderSchema.safeParse({ entryDate: "2026-06-30" });
    expect(result.success).toBe(false);
    const fieldErrors = result.error!.flatten().fieldErrors;
    expect(fieldErrors).toHaveProperty("fiscalYearId");
  });

  it("rejects an entryDate in DD-MM-YYYY format (must be YYYY-MM-DD)", () => {
    const result = createHeaderSchema.safeParse({
      fiscalYearId: "00000000-0000-0000-0000-000000000001",
      entryDate: "30-06-2026",
    });
    expect(result.success).toBe(false);
    const fieldErrors = result.error!.flatten().fieldErrors;
    expect(fieldErrors).toHaveProperty("entryDate");
  });

  it("U-10: rejects a payload with 0 lines → 'At least 2 lines required'", () => {
    const result = createHeaderSchema.safeParse({
      fiscalYearId: "00000000-0000-0000-0000-000000000001",
      entryDate: "2026-06-30",
      lines: [],
    });
    expect(result.success).toBe(false);
    const fieldErrors = result.error!.flatten().fieldErrors;
    expect(fieldErrors.lines?.[0]).toMatch(/at least 2 lines/i);
  });

  it("U-11: rejects a payload with 1 line → 'At least 2 lines required'", () => {
    const result = createHeaderSchema.safeParse({
      fiscalYearId: "00000000-0000-0000-0000-000000000001",
      entryDate: "2026-06-30",
      lines: [
        { accountId: "eeeeeeee-0000-0000-0000-000000000005", lineNumber: 1, debit: 100, credit: 0 },
      ],
    });
    expect(result.success).toBe(false);
    const fieldErrors = result.error!.flatten().fieldErrors;
    expect(fieldErrors.lines?.[0]).toMatch(/at least 2 lines/i);
  });

  it("accepts a payload with 2 balanced-syntax lines (Zod only, no business validation)", () => {
    const result = createHeaderSchema.safeParse({
      fiscalYearId: "00000000-0000-0000-0000-000000000001",
      entryDate: "2026-06-30",
      lines: [
        { accountId: "eeeeeeee-0000-0000-0000-000000000005", lineNumber: 1, debit: 500, credit: 0 },
        { accountId: "ffffffff-0000-0000-0000-000000000006", lineNumber: 2, debit: 0,   credit: 500 },
      ],
    });
    expect(result.success).toBe(true);
  });
});
