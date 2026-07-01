import { describe, it, expect } from "vitest";
import { createSchema, updateSchema } from "../lib/bank-account-utils";

const BANK_ID    = "aaaaaaaa-0000-0000-0000-000000000001";
const BRANCH_ID  = "bbbbbbbb-0000-0000-0000-000000000002";
const GL_ID      = "cccccccc-0000-0000-0000-000000000003";

const validCreate = {
  bankId:        BANK_ID,
  currencyCode:  "SAR",
  accountNumber: "SA0000000001",
  accountNameEn: "Main Account",
  accountNameAr: "الحساب الرئيسي",
  type:          "CURRENT" as const,
};

// ─── createSchema ─────────────────────────────────────────────────────────────

describe("createSchema", () => {
  it("BA-U-01: rejects missing bankId", () => {
    const { bankId: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("bankId");
  });

  it("BA-U-02: rejects missing accountNumber", () => {
    const { accountNumber: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("accountNumber");
  });

  it("BA-U-03: rejects invalid BankAccountType", () => {
    const result = createSchema.safeParse({ ...validCreate, type: "INVALID_TYPE" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("type");
  });

  it("BA-U-04: rejects negative openingBalance", () => {
    const result = createSchema.safeParse({ ...validCreate, openingBalance: -100 });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("openingBalance");
  });

  it("BA-U-05: accepts a valid minimal payload with defaults applied", () => {
    const result = createSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    expect(result.data!.type).toBe("CURRENT");
    expect(result.data!.openingBalance).toBe(0);
  });

  it("BA-U-05b: accepts all four valid BankAccountType values", () => {
    for (const type of ["CURRENT", "SAVINGS", "FIXED_DEPOSIT", "PETTY_CASH"] as const) {
      const result = createSchema.safeParse({ ...validCreate, type });
      expect(result.success).toBe(true);
    }
  });
});

// ─── updateSchema ─────────────────────────────────────────────────────────────

describe("updateSchema", () => {
  it("BA-U-06: allows partial update with only accountNameEn", () => {
    const result = updateSchema.safeParse({ accountNameEn: "Updated Name" });
    expect(result.success).toBe(true);
    expect(result.data!.accountNameEn).toBe("Updated Name");
  });

  it("BA-U-06b: allows empty object (no-op patch)", () => {
    const result = updateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("BA-U-07: openingBalance is not a recognised field → extra key is stripped, not an error", () => {
    const result = updateSchema.safeParse({ openingBalance: 9999 });
    expect(result.success).toBe(true);
    expect((result.data as any).openingBalance).toBeUndefined();
  });

  it("BA-U-07b: currentBalance is not a recognised field → stripped", () => {
    const result = updateSchema.safeParse({ currentBalance: 5000 });
    expect(result.success).toBe(true);
    expect((result.data as any).currentBalance).toBeUndefined();
  });

  it("BA-U-06c: allows nullable glAccountId to clear the link", () => {
    const result = updateSchema.safeParse({ glAccountId: null });
    expect(result.success).toBe(true);
    expect(result.data!.glAccountId).toBeNull();
  });

  it("BA-U-06d: rejects an invalid UUID for glAccountId", () => {
    const result = updateSchema.safeParse({ glAccountId: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("glAccountId");
  });
});
