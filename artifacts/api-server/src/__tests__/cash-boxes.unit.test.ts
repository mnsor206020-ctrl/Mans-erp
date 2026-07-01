import { describe, it, expect } from "vitest";
import { createSchema, updateSchema } from "../lib/cash-box-utils";

const validCreate = {
  currencyCode: "SAR",
  nameEn:       "Main Cash Box",
  nameAr:       "الصندوق الرئيسي",
  code:         "CB-001",
};

// ─── createSchema ─────────────────────────────────────────────────────────────

describe("createSchema (cash box)", () => {
  it("CB-U-01: rejects missing currencyCode", () => {
    const { currencyCode: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("currencyCode");
  });

  it("CB-U-02: rejects missing nameEn", () => {
    const { nameEn: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("nameEn");
  });

  it("CB-U-03: rejects missing nameAr", () => {
    const { nameAr: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("nameAr");
  });

  it("CB-U-04: rejects missing code", () => {
    const { code: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("code");
  });

  it("CB-U-05: rejects negative openingBalance", () => {
    const result = createSchema.safeParse({ ...validCreate, openingBalance: -500 });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("openingBalance");
  });

  it("CB-U-06: accepts valid minimal payload with defaults applied", () => {
    const result = createSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    expect(result.data!.openingBalance).toBe(0);
  });

  it("CB-U-07: accepts optional glAccountId as a valid UUID", () => {
    const result = createSchema.safeParse({
      ...validCreate,
      glAccountId: "aaaaaaaa-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(true);
    expect(result.data!.glAccountId).toBe("aaaaaaaa-0000-0000-0000-000000000001");
  });

  it("CB-U-08: rejects invalid UUID for glAccountId", () => {
    const result = createSchema.safeParse({ ...validCreate, glAccountId: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("glAccountId");
  });

  it("CB-U-09: accepts optional branchId as a valid UUID", () => {
    const result = createSchema.safeParse({
      ...validCreate,
      branchId: "bbbbbbbb-0000-0000-0000-000000000002",
    });
    expect(result.success).toBe(true);
  });
});

// ─── updateSchema ─────────────────────────────────────────────────────────────

describe("updateSchema (cash box)", () => {
  it("CB-U-10: allows partial update with only nameEn", () => {
    const result = updateSchema.safeParse({ nameEn: "Updated Box" });
    expect(result.success).toBe(true);
    expect(result.data!.nameEn).toBe("Updated Box");
  });

  it("CB-U-11: allows empty object (no-op patch)", () => {
    const result = updateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("CB-U-12: openingBalance is not a recognised field → stripped, not an error", () => {
    const result = updateSchema.safeParse({ openingBalance: 9999 });
    expect(result.success).toBe(true);
    expect((result.data as any).openingBalance).toBeUndefined();
  });

  it("CB-U-13: currentBalance is not a recognised field → stripped", () => {
    const result = updateSchema.safeParse({ currentBalance: 5000 });
    expect(result.success).toBe(true);
    expect((result.data as any).currentBalance).toBeUndefined();
  });

  it("CB-U-14: allows nullable glAccountId to clear the link", () => {
    const result = updateSchema.safeParse({ glAccountId: null });
    expect(result.success).toBe(true);
    expect(result.data!.glAccountId).toBeNull();
  });

  it("CB-U-15: rejects invalid UUID for glAccountId", () => {
    const result = updateSchema.safeParse({ glAccountId: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("glAccountId");
  });

  it("CB-U-16: allows nullable branchId to clear the link", () => {
    const result = updateSchema.safeParse({ branchId: null });
    expect(result.success).toBe(true);
    expect(result.data!.branchId).toBeNull();
  });
});
