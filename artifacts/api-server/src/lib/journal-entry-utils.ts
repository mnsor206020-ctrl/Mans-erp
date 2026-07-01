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

/**
 * Validates that the sum of debits equals the sum of credits across all lines.
 * A tolerance of 0.01 is applied to account for floating-point rounding.
 *
 * Accounting rule: every journal entry must balance — total debits must equal
 * total credits. This is the fundamental constraint of double-entry bookkeeping.
 */
export function validateBalance(
  lines: { debit: number | string; credit: number | string }[]
): { totalDebit: number; totalCredit: number; balanced: boolean } {
  const totalDebit  = lines.reduce((s, l) => s + parseFloat(String(l.debit  || 0)), 0);
  const totalCredit = lines.reduce((s, l) => s + parseFloat(String(l.credit || 0)), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  return { totalDebit, totalCredit, balanced };
}

// Minimal interface for the DB client used by validateAccounts.
// Using dependency injection keeps this module free of a live Prisma import
// so that unit tests can import it without triggering a database connection.
interface AccountRecord {
  code: string;
  nameEn: string;
  isActive: boolean;
  isGroup: boolean;
  allowDirectEntry: boolean;
}

interface PrismaForValidation {
  chartOfAccount: {
    findFirst(args: {
      where: { id: string; organizationId: string; deletedAt: null };
    }): Promise<AccountRecord | null>;
  };
}

/**
 * Validates that every account referenced in the lines is eligible for posting.
 * Each account must: exist in the organisation, be active, not be a group account,
 * and have allowDirectEntry enabled.
 *
 * Receives a prisma-compatible client via dependency injection so that unit tests
 * can import this module without a live database connection.
 *
 * Known limitation: performs one DB query per line (N+1 pattern). Acceptable for
 * typical journal entries (≤20 lines). Document for follow-up sprint optimisation.
 *
 * @returns Array of human-readable error strings. Empty array means all valid.
 */
export async function validateAccounts(
  lines: { accountId: string }[],
  orgId: string,
  prismaClient: PrismaForValidation
): Promise<string[]> {
  const errors: string[] = [];
  for (const line of lines) {
    const account = await prismaClient.chartOfAccount.findFirst({
      where: { id: line.accountId, organizationId: orgId, deletedAt: null },
    });
    if (!account) {
      errors.push(`Account ${line.accountId} not found`);
      continue;
    }
    if (!account.isActive)         errors.push(`Account ${account.code} (${account.nameEn}) is not active`);
    if (account.isGroup)           errors.push(`Account ${account.code} (${account.nameEn}) is a group account — posting not allowed`);
    if (!account.allowDirectEntry) errors.push(`Account ${account.code} (${account.nameEn}) does not allow direct entries`);
  }
  return errors;
}

/**
 * Zod schema for a single journal entry line.
 * Each line must carry a debit or credit amount greater than zero.
 */
export const lineSchema = z
  .object({
    accountId:     z.string().uuid(),
    costCenterId:  z.string().uuid().nullish(),
    lineNumber:    z.number().int().positive(),
    descriptionEn: z.string().nullish(),
    descriptionAr: z.string().nullish(),
    debit:         z.number().min(0).default(0),
    credit:        z.number().min(0).default(0),
    reference:     z.string().nullish(),
  })
  .refine(
    (l) => l.debit > 0 || l.credit > 0,
    { message: "Each line must have a debit or credit amount greater than zero" }
  );

/**
 * Zod schema for creating a journal entry.
 * Lines are required (minimum 2) — every journal entry must follow double-entry
 * bookkeeping rules from the moment of creation.
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
  lines:          z.array(lineSchema).min(2, "At least 2 lines required"),
});

/**
 * Zod schema for partially updating a journal entry header.
 * When `lines` is provided, the server replaces all existing lines atomically.
 * Minimum 2 lines is enforced server-side when lines are included.
 */
export const updateHeaderSchema = z.object({
  fiscalYearId:  z.string().uuid().optional(),
  entryDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type:          z.enum(["MANUAL", "AUTOMATIC", "OPENING", "CLOSING", "ADJUSTMENT"]).optional(),
  currencyCode:  z.string().optional(),
  exchangeRate:  z.number().positive().optional(),
  descriptionEn: z.string().nullish(),
  descriptionAr: z.string().nullish(),
  reference:     z.string().nullish(),
  lines:         z.array(lineSchema).optional(),
});

export type CreateHeaderInput = z.infer<typeof createHeaderSchema>;
export type UpdateHeaderInput = z.infer<typeof updateHeaderSchema>;
export type LineInput         = z.infer<typeof lineSchema>;

/**
 * Computes the number of whole seconds elapsed between the previous approval
 * action and the current action timestamp.
 *
 * Returns null when there is no previous action (i.e. this is the first
 * approval record on the entry).
 */
export function computeDuration(
  prevCreatedAt: Date | null,
  currentAt: Date
): number | null {
  if (prevCreatedAt === null) return null;
  return Math.floor((currentAt.getTime() - prevCreatedAt.getTime()) / 1000);
}

/**
 * Zod schema for the body of a reject workflow action.
 * A comment is mandatory and must be at least 10 characters so the reviewer
 * is forced to provide a meaningful reason.
 */
export const rejectCommentSchema = z.object({
  comment: z
    .string({ required_error: "A rejection comment is required" })
    .min(10, "Rejection comment must be at least 10 characters"),
});
