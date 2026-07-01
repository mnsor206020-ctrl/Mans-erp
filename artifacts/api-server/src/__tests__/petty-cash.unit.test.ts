import { describe, it, expect } from "vitest";
import { createSchema } from "../lib/petty-cash-utils";

const CASH_BOX_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const validCreate = {
  cashBoxId:       CASH_BOX_ID,
  type:            "OUT" as const,
  transactionDate: "2026-07-01",
  amount:          200,
  descriptionEn:   "Office supplies",
  descriptionAr:   "مستلزمات مكتبية",
};

// ─── createSchema ─────────────────────────────────────────────────────────────

describe("createSchema", () => {
  it("PC-U-01: rejects missing cashBoxId", () => {
    const { cashBoxId: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("cashBoxId");
  });

  it("PC-U-02: rejects invalid UUID for cashBoxId", () => {
    const result = createSchema.safeParse({ ...validCreate, cashBoxId: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("cashBoxId");
  });

  it("PC-U-03: rejects missing type", () => {
    const { type: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("type");
  });

  it("PC-U-04: rejects invalid type value", () => {
    const result = createSchema.safeParse({ ...validCreate, type: "TRANSFER" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("type");
  });

  it("PC-U-05: accepts both valid type values", () => {
    for (const type of ["IN", "OUT"] as const) {
      const result = createSchema.safeParse({ ...validCreate, type });
      expect(result.success).toBe(true);
    }
  });

  it("PC-U-06: rejects missing transactionDate", () => {
    const { transactionDate: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("transactionDate");
  });

  it("PC-U-07: rejects negative amount", () => {
    const result = createSchema.safeParse({ ...validCreate, amount: -10 });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("amount");
  });

  it("PC-U-08: rejects missing descriptionEn", () => {
    const { descriptionEn: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("descriptionEn");
  });

  it("PC-U-09: rejects empty descriptionEn", () => {
    const result = createSchema.safeParse({ ...validCreate, descriptionEn: "" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("descriptionEn");
  });

  it("PC-U-10: rejects missing descriptionAr", () => {
    const { descriptionAr: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("descriptionAr");
  });

  it("PC-U-11: accepts a valid minimal payload", () => {
    const result = createSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    expect(result.data!.type).toBe("OUT");
    expect(result.data!.amount).toBe(200);
  });

  it("PC-U-12: accepts optional fields when provided", () => {
    const result = createSchema.safeParse({
      ...validCreate,
      reference:    "REF-001",
      receiptNumber: "RC-001",
    });
    expect(result.success).toBe(true);
    expect(result.data!.reference).toBe("REF-001");
    expect(result.data!.receiptNumber).toBe("RC-001");
  });
});
