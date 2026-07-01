import { describe, it, expect } from "vitest";
import { createSchema, updateSchema, voidSchema, formatReceiptNumber } from "../lib/receipt-utils";

const BANK_ACCOUNT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const CASH_BOX_ID     = "bbbbbbbb-0000-0000-0000-000000000002";

const validCreate = {
  receiptDate:   "2026-07-01",
  paymentMethod: "BANK_TRANSFER" as const,
  amount:        1000,
  bankAccountId: BANK_ACCOUNT_ID,
};

// ─── formatReceiptNumber ───────────────────────────────────────────────────────

describe("formatReceiptNumber", () => {
  it("RCP-U-01: pads single-digit sequence to 4 digits", () => {
    expect(formatReceiptNumber(2026, 1)).toBe("RCP-2026-0001");
  });

  it("RCP-U-02: pads double-digit sequence to 4 digits", () => {
    expect(formatReceiptNumber(2026, 10)).toBe("RCP-2026-0010");
  });

  it("RCP-U-03: does not pad sequence >= 10000", () => {
    expect(formatReceiptNumber(2026, 10000)).toBe("RCP-2026-10000");
  });

  it("RCP-U-04: uses the provided year correctly", () => {
    expect(formatReceiptNumber(2025, 42)).toBe("RCP-2025-0042");
  });
});

// ─── createSchema ─────────────────────────────────────────────────────────────

describe("createSchema", () => {
  it("RCP-U-05: rejects missing receiptDate", () => {
    const { receiptDate: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("receiptDate");
  });

  it("RCP-U-06: rejects missing paymentMethod", () => {
    const { paymentMethod: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("paymentMethod");
  });

  it("RCP-U-07: rejects missing amount", () => {
    const { amount: _omit, ...rest } = validCreate;
    const result = createSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("amount");
  });

  it("RCP-U-08: rejects negative amount", () => {
    const result = createSchema.safeParse({ ...validCreate, amount: -100 });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("amount");
  });

  it("RCP-U-09: rejects invalid paymentMethod", () => {
    const result = createSchema.safeParse({ ...validCreate, paymentMethod: "WIRE" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("paymentMethod");
  });

  it("RCP-U-10: accepts a valid minimal payload and applies defaults", () => {
    const result = createSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    expect(result.data!.currencyCode).toBe("SAR");
    expect(result.data!.exchangeRate).toBe(1);
  });

  it("RCP-U-11: accepts all six valid paymentMethod values", () => {
    const methods = ["CASH", "BANK_TRANSFER", "CHEQUE", "CREDIT_CARD", "ONLINE", "OTHER"] as const;
    for (const paymentMethod of methods) {
      const result = createSchema.safeParse({ ...validCreate, paymentMethod });
      expect(result.success).toBe(true);
    }
  });

  it("RCP-U-12: rejects invalid UUID for bankAccountId", () => {
    const result = createSchema.safeParse({ ...validCreate, bankAccountId: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("bankAccountId");
  });
});

// ─── updateSchema ─────────────────────────────────────────────────────────────

describe("updateSchema", () => {
  it("RCP-U-13: allows partial update with only amount", () => {
    const result = updateSchema.safeParse({ amount: 500 });
    expect(result.success).toBe(true);
    expect(result.data!.amount).toBe(500);
  });

  it("RCP-U-14: allows empty object (no-op patch)", () => {
    const result = updateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("RCP-U-15: allows nullable bankAccountId to clear the link", () => {
    const result = updateSchema.safeParse({ bankAccountId: null });
    expect(result.success).toBe(true);
    expect(result.data!.bankAccountId).toBeNull();
  });

  it("RCP-U-16: rejects invalid UUID for cashBoxId", () => {
    const result = updateSchema.safeParse({ cashBoxId: "not-a-uuid" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("cashBoxId");
  });
});

// ─── voidSchema ───────────────────────────────────────────────────────────────

describe("voidSchema", () => {
  it("RCP-U-17: rejects missing voidReason", () => {
    const result = voidSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("voidReason");
  });

  it("RCP-U-18: rejects empty string voidReason", () => {
    const result = voidSchema.safeParse({ voidReason: "" });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toHaveProperty("voidReason");
  });

  it("RCP-U-19: accepts a non-empty voidReason", () => {
    const result = voidSchema.safeParse({ voidReason: "Duplicate entry" });
    expect(result.success).toBe(true);
    expect(result.data!.voidReason).toBe("Duplicate entry");
  });
});
