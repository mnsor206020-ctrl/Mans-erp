import type { Prisma } from "@workspace/prisma";

export class AccountingPeriodError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export const CLOSED_YEAR_MESSAGE = "السنة المالية مقفلة؛ لا يمكن إنشاء أو تغيير أو نسخ أو عكس قيودها.";
export const CLOSING_ENTRY_MESSAGE = "لا يمكن إبطال أو عكس قيد الإقفال من المسارات العامة.";

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
