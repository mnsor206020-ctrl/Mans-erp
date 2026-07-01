import { z } from "zod";

export const createSchema = z.object({
  bankId: z.string().uuid(),
  currencyCode: z.string().min(1),
  accountNumber: z.string().min(1),
  iban: z.string().optional(),
  accountNameEn: z.string().min(1),
  accountNameAr: z.string().min(1),
  type: z.enum(["CURRENT", "SAVINGS", "FIXED_DEPOSIT", "PETTY_CASH"]).default("CURRENT"),
  openingBalance: z.number().min(0).default(0),
  glAccountId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
});

export const updateSchema = z.object({
  iban: z.string().optional(),
  accountNameEn: z.string().min(1).optional(),
  accountNameAr: z.string().min(1).optional(),
  type: z.enum(["CURRENT", "SAVINGS", "FIXED_DEPOSIT", "PETTY_CASH"]).optional(),
  glAccountId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
});
