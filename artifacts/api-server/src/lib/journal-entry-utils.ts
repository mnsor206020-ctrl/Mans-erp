import { z } from "zod";

/**
 * Formats a journal entry sequence number into the canonical JE number format.
 * Pure function — no side effects, no database dependency.
 *
 * @example formatJENumber(2026, 1)  → "JE-2026-0001"
 * @example formatJENumber(2026, 10) → "JE-2026-0010"
 */
export function formatJENumber(year: number, seq: number): string {
  return `JE-${year}-${String(seq).padStart(4, "0")}`;
}

export const lineSchema = z.object({
  accountId:    z.string().uuid(),
  costCenterId: z.string().uuid().nullish(),
  lineNumber:   z.number().int().positive(),
  descriptionEn: z.string().nullish(),
  descriptionAr: z.string().nullish(),
  debit:        z.number().min(0).default(0),
  credit:       z.number().min(0).default(0),
  reference:    z.string().nullish(),
});

/**
 * Zod schema for creating a journal entry header.
 *
 * TODO: Sprint 2.2 — restore `lines: z.array(lineSchema).min(2, "At least 2 lines required")`
 * and make `lines` required. Until then, lines are optional and may be empty so
 * that Sprint 2.1 (header-only CRUD) can create drafts without line items.
 */
export const createHeaderSchema = z.object({
  organizationId: z.string().uuid().optional(),
  fiscalYearId:   z.string().uuid(),
  entryDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "entryDate must be YYYY-MM-DD"),
  type:           z.enum(["MANUAL", "AUTOMATIC", "OPENING", "CLOSING", "ADJUSTMENT"]).default("MANUAL"),
  currencyCode:   z.string().default("SAR"),
  exchangeRate:   z.number().positive().default(1),
  descriptionEn:  z.string().nullish(),
  descriptionAr:  z.string().nullish(),
  reference:      z.string().nullish(),
  // TODO: Sprint 2.2 — make required with .min(2, "At least 2 lines required")
  lines:          z.array(lineSchema).optional().default([]),
});

export const updateHeaderSchema = z.object({
  fiscalYearId:  z.string().uuid().optional(),
  entryDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type:          z.enum(["MANUAL", "AUTOMATIC", "OPENING", "CLOSING", "ADJUSTMENT"]).optional(),
  currencyCode:  z.string().optional(),
  exchangeRate:  z.number().positive().optional(),
  descriptionEn: z.string().nullish(),
  descriptionAr: z.string().nullish(),
  reference:     z.string().nullish(),
  // TODO: Sprint 2.2 — restore .min(2) when updating with lines
  lines:         z.array(lineSchema).optional(),
});

export type CreateHeaderInput = z.infer<typeof createHeaderSchema>;
export type UpdateHeaderInput = z.infer<typeof updateHeaderSchema>;
export type LineInput         = z.infer<typeof lineSchema>;
