import { describe, it, expect } from "vitest";
import { createSchema, updateSchema, voidSchema, formatPaymentNumber } from "../lib/payment-utils";

const BANK_ACCOUNT_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const validCreate = {
  paymentDate:   "2026-07-01",
  paymentMethod: "BANK_TRANSFER" as const,
  amount:        500,
  bankAccountId: BANK_ACCOUNT_ID,
};

// ─── formatPaymentNumber ───────────────────────────────────────────────────────

describe("formatPaymentNumber", () => {
  it("PMT-U-01: pads single-digit sequence to 4 digits", () => {
    expect(formatPaymentNumber(2026, 1)).toBe("PMT-2026-0001");
  });

  it("PMT-U-02: pads double-digit sequence to 4 digits", () => {
    expect(formatPaymentNumber(2026, 10)).toBe("PMT-2026-0010");
  });

  it("PMT-U-03: does not pad sequence >= 10000", () => {
    expect(formatPaymentNumber(2026, 10000)).toBe("PMT-2026-10000");
  });

  it("PMT-U-04: uses the provided year correctly", () => {
    expect(formatPaymentNumber(2025, 7)).toBe("PMT-2025-0007");
  });
});

// ─── createSchema ─────────────────────────────────────────────────────────────

describe("createSchema", () => {
  it("PMT-U-05: rejects missing paymentDate", () => {
    const { paymentDate: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("paymentDate");
  });

  it("PMT-U-06: rejects missing paymentMethod", () => {
    const { paymentMethod: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("paymentMethod");
  });

  it("PMT-U-07: rejects missing amount", () => {
    const { amount: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("amount");
  });

  it("PMT-U-08: rejects negative amount", () => {
    const result = createSchema.safeParse({ ...validCreate, amount: -50 });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("amount");
  });

  it("PMT-U-09: rejects invalid paymentMethod", () => {
    const result = createSchema.safeParse({ ...validCreate, paymentMethod: "WIRE" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("paymentMethod");
  });

  it("PMT-U-10: accepts a valid minimal payload and applies defaults", () => {
    const result = createSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    expect(result.data!.currencyCode).toBe("SAR");
    expect(result.data!.exchangeRate).toBe(1);
  });

  it("PMT-U-11: accepts all six valid paymentMethod values", () => {
    const methods = ["CASH", "BANK_TRANSFER", "CHEQUE", "CREDIT_CARD", "ONLINE", "OTHER"] as const;
    for (const paymentMethod of methods) {
      const result = createSchema.safeParse({ ...validCreate, paymentMethod });
      expect(result.success).toBe(true);
    }
  });

  it("PMT-U-12: rejects invalid UUID for bankAccountId", () => {
    const result = createSchema.safeParse({ ...validCreate, bankAccountId: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("bankAccountId");
  });
});

// ─── updateSchema ─────────────────────────────────────────────────────────────

describe("updateSchema", () => {
  it("PMT-U-13: allows partial update with only amount", () => {
    const result = updateSchema.safeParse({ amount: 250 });
    expect(result.success).toBe(true);
    expect(result.data!.amount).toBe(250);
  });

  it("PMT-U-14: allows empty object (no-op patch)", () => {
    const result = updateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("PMT-U-15: allows nullable bankAccountId to clear the link", () => {
    const result = updateSchema.safeParse({ bankAccountId: null });
    expect(result.success).toBe(true);
    expect(result.data!.bankAccountId).toBeNull();
  });

  it("PMT-U-16: rejects invalid UUID for cashBoxId", () => {
    const result = updateSchema.safeParse({ cashBoxId: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("cashBoxId");
  });
});

// ─── voidSchema ───────────────────────────────────────────────────────────────

describe("voidSchema", () => {
  it("PMT-U-17: rejects missing voidReason", () => {
    const result = voidSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("voidReason");
  });

  it("PMT-U-18: rejects empty string voidReason", () => {
    const result = voidSchema.safeParse({ voidReason: "" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("voidReason");
  });

  it("PMT-U-19: accepts a non-empty voidReason", () => {
    const result = voidSchema.safeParse({ voidReason: "Wrong payee" });
    expect(result.success).toBe(true);
    expect(result.data!.voidReason).toBe("Wrong payee");
  });
});
