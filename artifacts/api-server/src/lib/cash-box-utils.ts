import { z } from "zod";

export const createSchema = z.object({
  currencyCode:   z.string().min(1),
  nameEn:         z.string().min(1),
  nameAr:         z.string().min(1),
  code:           z.string().min(1),
  openingBalance: z.number().min(0).default(0),
  glAccountId:    z.string().uuid().optional(),
  branchId:       z.string().uuid().optional(),
});

export const updateSchema = z.object({
  nameEn:      z.string().min(1).optional(),
  nameAr:      z.string().min(1).optional(),
  glAccountId: z.string().uuid().nullable().optional(),
  branchId:    z.string().uuid().nullable().optional(),
});
