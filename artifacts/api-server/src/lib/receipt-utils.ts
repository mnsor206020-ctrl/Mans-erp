import { z } from "zod";

const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "CREDIT_CARD",
  "ONLINE",
  "OTHER",
] as const;

export const createSchema = z.object({
  receiptDate:    z.string().min(1),
  paymentMethod:  z.enum(PAYMENT_METHODS),
  currencyCode:   z.string().min(1).default("SAR"),
  exchangeRate:   z.number().min(0).default(1),
  amount:         z.number().min(0),
  bankAccountId:  z.string().uuid().optional(),
  cashBoxId:      z.string().uuid().optional(),
  branchId:       z.string().uuid().optional(),
  payerName:      z.string().optional(),
  payerNameAr:    z.string().optional(),
  payerType:      z.string().optional(),
  payerId:        z.string().uuid().optional(),
  chequeNumber:   z.string().optional(),
  chequeDate:     z.string().optional(),
  chequeBankName: z.string().optional(),
  descriptionEn:  z.string().optional(),
  descriptionAr:  z.string().optional(),
  reference:      z.string().optional(),
});

export const updateSchema = z.object({
  receiptDate:    z.string().min(1).optional(),
  paymentMethod:  z.enum(PAYMENT_METHODS).optional(),
  currencyCode:   z.string().min(1).optional(),
  exchangeRate:   z.number().min(0).optional(),
  amount:         z.number().min(0).optional(),
  bankAccountId:  z.string().uuid().nullable().optional(),
  cashBoxId:      z.string().uuid().nullable().optional(),
  branchId:       z.string().uuid().nullable().optional(),
  payerName:      z.string().nullable().optional(),
  payerNameAr:    z.string().nullable().optional(),
  payerType:      z.string().nullable().optional(),
  payerId:        z.string().uuid().nullable().optional(),
  chequeNumber:   z.string().nullable().optional(),
  chequeDate:     z.string().nullable().optional(),
  chequeBankName: z.string().nullable().optional(),
  descriptionEn:  z.string().nullable().optional(),
  descriptionAr:  z.string().nullable().optional(),
  reference:      z.string().nullable().optional(),
});

export const voidSchema = z.object({
  voidReason: z.string().min(1),
});

/**
 * Formats a receipt sequence number into the canonical RCP number format.
 * Pure function — no side effects, no database dependency.
 *
 * @example formatReceiptNumber(2026, 1)  → "RCP-2026-0001"
 * @example formatReceiptNumber(2026, 10) → "RCP-2026-0010"
 */
export function formatReceiptNumber(year: number, seq: number): string {
  return `RCP-${year}-${String(seq).padStart(4, "0")}`;
}
