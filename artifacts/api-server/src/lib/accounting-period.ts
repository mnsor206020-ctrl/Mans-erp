import type { Prisma } from "@workspace/prisma";

export class AccountingPeriodError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export const CLOSED_YEAR_MESSAGE = "السنة المالية مقفلة؛ لا يمكن إنشاء أو تغيير أو نسخ أو عكس قيودها.";
export const CLOSING_ENTRY_MESSAGE = "لا يمكن إبطال أو عكس قيد الإقفال من المسارات العامة.";

/** Prisma's @db.Date persists UTC calendar days, not time-of-day. */
function day(value: unknown): number {
  if (!(value instanceof Date) && typeof value !== "string") return NaN;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) : NaN;
}

export function assertJournalDate(entryDate: unknown, year: { startDate: Date; endDate: Date }) {
  const date = day(entryDate);
  if (!Number.isFinite(date) || date < day(year.startDate) || date > day(year.endDate)) {
    throw new AccountingPeriodError("تاريخ القيد يجب أن يقع ضمن بداية ونهاية السنة المالية المرتبطة به.");
  }
}

/** Caller holds the organization's accounting lock through validation + write. */
export async function fiscalYearWindowError(
  db: Pick<Prisma.TransactionClient, "fiscalYear">,
  organizationId: string, startDate: Date, endDate: Date, excludeId?: string,
): Promise<string | null> {
  if (!Number.isFinite(day(startDate)) || !Number.isFinite(day(endDate))) return "تواريخ السنة المالية غير صالحة.";
  if (day(startDate) > day(endDate)) return "تاريخ بداية السنة المالية لا يمكن أن يكون بعد تاريخ نهايتها.";
  const overlap = await db.fiscalYear.findFirst({
    where: {
      organizationId, deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: new Date(day(endDate)) },
      endDate: { gte: new Date(day(startDate)) },
    },
  });
  return overlap ? "تواريخ السنة المالية تتداخل مع سنة مالية أخرى في منظمتك." : null;
}

export async function assertOpenAccountingYear(
  db: Pick<Prisma.TransactionClient, "fiscalYear">,
  organizationId: string,
  fiscalYearId: string,
) {
  const year = await db.fiscalYear.findFirst({
    where: { id: fiscalYearId, organizationId, deletedAt: null },
  });
  if (!year) throw new AccountingPeriodError("السنة المالية غير موجودة ضمن منظمتك.");
  if (year.status !== "OPEN") throw new AccountingPeriodError(CLOSED_YEAR_MESSAGE);
  return year;
}

export async function assertMutableJournal(
  db: Pick<Prisma.TransactionClient, "journalEntry" | "fiscalYear">,
  organizationId: string,
  id: string,
  reversal = false,
) {
  const entry = await db.journalEntry.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!entry) throw new AccountingPeriodError("القيد غير موجود ضمن منظمتك.", 404);
  if (reversal && entry.type === "CLOSING") throw new AccountingPeriodError(CLOSING_ENTRY_MESSAGE);
  await assertOpenAccountingYear(db, organizationId, entry.fiscalYearId);
  return entry;
}
