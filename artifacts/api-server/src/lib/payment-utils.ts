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
  paymentDate:    z.string().min(1),
  paymentMethod:  z.enum(PAYMENT_METHODS),
  currencyCode:   z.string().min(1).default("SAR"),
  exchangeRate:   z.number().positive().default(1),
  amount:         z.number().positive(),
  bankAccountId:  z.string().uuid().optional(),
  cashBoxId:      z.string().uuid().optional(),
  branchId:       z.string().uuid().optional(),
  glAccountId:    z.string().uuid().optional(),
  payeeName:      z.string().optional(),
  payeeNameAr:    z.string().optional(),
  payeeType:      z.string().optional(),
  payeeId:        z.string().uuid().optional(),
  chequeNumber:   z.string().optional(),
  chequeDate:     z.string().optional(),
  chequeBankName: z.string().optional(),
  descriptionEn:  z.string().optional(),
  descriptionAr:  z.string().optional(),
  reference:      z.string().optional(),
});

export const updateSchema = z.object({
  paymentDate:    z.string().min(1).optional(),
  paymentMethod:  z.enum(PAYMENT_METHODS).optional(),
  currencyCode:   z.string().min(1).optional(),
  exchangeRate:   z.number().min(0).optional(),
  amount:         z.number().min(0).optional(),
  bankAccountId:  z.string().uuid().nullable().optional(),
  cashBoxId:      z.string().uuid().nullable().optional(),
  branchId:       z.string().uuid().nullable().optional(),
  payeeName:      z.string().nullable().optional(),
  payeeNameAr:    z.string().nullable().optional(),
  payeeType:      z.string().nullable().optional(),
  payeeId:        z.string().uuid().nullable().optional(),
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
 * Formats a payment sequence number into the canonical PMT number format.
 * Pure function — no side effects, no database dependency.
 *
 * @example formatPaymentNumber(2026, 1)  → "PMT-2026-0001"
 * @example formatPaymentNumber(2026, 10) → "PMT-2026-0010"
 */
export function formatPaymentNumber(year: number, seq: number): string {
  return `PMT-${year}-${String(seq).padStart(4, "0")}`;
}
