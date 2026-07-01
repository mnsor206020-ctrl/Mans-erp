import { z } from "zod";

export const createSchema = z.object({
  cashBoxId:       z.string().uuid(),
  type:            z.enum(["IN", "OUT"]),
  transactionDate: z.string().min(1),
  amount:          z.number().min(0),
  descriptionEn:   z.string().min(1),
  descriptionAr:   z.string().min(1),
  reference:       z.string().optional(),
  receiptNumber:   z.string().optional(),
  categoryId:      z.string().uuid().optional(),
  glAccountId:     z.string().uuid().optional(),
  costCenterId:    z.string().uuid().optional(),
});
