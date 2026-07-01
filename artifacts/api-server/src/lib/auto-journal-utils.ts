import { computeIntegrityHash } from "../services/integrity-hash";
import { generateJournalNumber } from "./journal-entry-utils";

// ─── Prisma DI interfaces ─────────────────────────────────────────────────────
// These minimal interfaces allow this module to be imported in unit tests
// without triggering a live Prisma connection.

interface JELine {
  id:          string;
  lineNumber:  number;
  accountId:   string;
  costCenterId: string | null;
  debit:       { toString(): string } | number | string;
  credit:      { toString(): string } | number | string;
  debitBase:   { toString(): string } | number | string;
  creditBase:  { toString(): string } | number | string;
}

interface CreatedJE {
  id:             string;
  number:         string;
  organizationId: string;
  fiscalYearId:   string;
  entryDate:      Date | string;
  type:           string;
  currencyCode:   string;
  exchangeRate:   { toString(): string } | number | string;
  totalDebit:     { toString(): string } | number | string;
  totalCredit:    { toString(): string } | number | string;
  lines:          JELine[];
}

interface PrismaForAutoJE {
  journalEntry: {
    findMany(args: any): Promise<{ number: string }[]>;
    create(args: any):   Promise<CreatedJE>;
    update(args: any):   Promise<any>;
  };
  fiscalYear: {
    findFirst(args: any): Promise<{ id: string; status: string } | null>;
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoJEParams {
  organizationId:  string;
  branchId?:       string | null;
  currencyCode:    string;
  exchangeRate:    number;
  entryDate:       Date;
  descriptionEn:   string;
  descriptionAr:   string;
  reference?:      string | null;
  sourceType:      string;
  sourceId:        string;
  sourceReference: string;
  createdByUserId: string;
  /** Debit account GL ID (cash/bank side for receipt; expense side for payment). */
  debitAccountId:  string;
  /** Credit account GL ID (revenue side for receipt; cash/bank side for payment). */
  creditAccountId: string;
  amount:          number;
  amountBase:      number;
}

export interface ReversalParams {
  organizationId:  string;
  currencyCode:    string;
  exchangeRate:    number;
  entryDate:       Date;
  descriptionEn:   string;
  descriptionAr:   string;
  sourceType:      string;
  sourceId:        string;
  sourceReference: string;
  createdByUserId: string;
  originalJEId:    string;
  originalLines:   JELine[];
  originalFiscalYearId: string;
  totalAmount:     number;
}

// ─── Fiscal Year resolution ───────────────────────────────────────────────────

/**
 * Finds an OPEN fiscal year covering the given transaction date.
 * Returns null if no open fiscal year covers the date.
 */
export async function resolveOpenFiscalYear(
  orgId: string,
  txDate: Date,
  prismaClient: PrismaForAutoJE
): Promise<{ id: string } | null> {
  return prismaClient.fiscalYear.findFirst({
    where: {
      organizationId: orgId,
      status: "OPEN",
      startDate: { lte: txDate },
      endDate:   { gte: txDate },
      deletedAt:  null,
    } as any,
  });
}

// ─── Create auto-posted JE ────────────────────────────────────────────────────

/**
 * Creates a 2-line AUTOMATIC journal entry and immediately marks it POSTED
 * with a SHA-256 integrity hash — all within the caller's $transaction context.
 *
 * Line structure:
 *   Line 1: debit  = amountBase,  credit = 0  (debitAccountId)
 *   Line 2: debit  = 0,           credit = amountBase  (creditAccountId)
 *
 * @returns The created and posted JournalEntry record.
 */
export async function createAutoPostedJE(
  params: AutoJEParams,
  fiscalYearId: string,
  tx: PrismaForAutoJE
): Promise<CreatedJE> {
  const { organizationId, currencyCode, exchangeRate, entryDate, amountBase } = params;

  const year   = entryDate.getFullYear();
  const number = await generateJournalNumber(organizationId, year, tx);
  const postedAt = new Date();

  const je = await tx.journalEntry.create({
    data: {
      organizationId,
      branchId:        params.branchId ?? null,
      fiscalYearId,
      number,
      entryDate,
      type:            "AUTOMATIC",
      status:          "POSTED",
      currencyCode,
      exchangeRate,
      totalDebit:      amountBase,
      totalCredit:     amountBase,
      descriptionEn:   params.descriptionEn,
      descriptionAr:   params.descriptionAr,
      reference:       params.reference ?? null,
      sourceType:      params.sourceType,
      sourceId:        params.sourceId,
      sourceReference: params.sourceReference,
      sourceModuleUrl: null,
      createdByUserId: params.createdByUserId,
      postedAt,
      postedByUserId:  params.createdByUserId,
      lines: {
        create: [
          {
            lineNumber:   1,
            accountId:    params.debitAccountId,
            debit:        amountBase,
            credit:       0,
            debitBase:    amountBase,
            creditBase:   0,
            descriptionEn: params.descriptionEn,
            descriptionAr: params.descriptionAr,
          },
          {
            lineNumber:   2,
            accountId:    params.creditAccountId,
            debit:        0,
            credit:       amountBase,
            debitBase:    0,
            creditBase:   amountBase,
            descriptionEn: params.descriptionEn,
            descriptionAr: params.descriptionAr,
          },
        ],
      },
    },
    include: { lines: true },
  });

  const hash = computeIntegrityHash(
    {
      id:             je.id,
      number:         je.number,
      organizationId: je.organizationId,
      fiscalYearId:   je.fiscalYearId,
      entryDate:      je.entryDate,
      type:           je.type,
      currencyCode:   je.currencyCode,
      exchangeRate:   je.exchangeRate,
      totalDebit:     je.totalDebit,
      totalCredit:    je.totalCredit,
      postedAt,
      postedByUserId: params.createdByUserId,
    },
    je.lines
  );

  await tx.journalEntry.update({
    where: { id: je.id },
    data:  { integrityHash: hash, hashAlgorithm: "SHA-256", hashedAt: postedAt },
  });

  return je;
}

// ─── Create reversal JE ───────────────────────────────────────────────────────

/**
 * Creates a reversal JE for an existing auto-JE (swaps debit↔credit on every line)
 * and immediately posts it with an integrity hash.
 * Also updates originalJEId.reversedByEntryId within the same transaction.
 *
 * @returns The created reversal JournalEntry record.
 */
export async function createReversalJE(
  params: ReversalParams,
  tx: PrismaForAutoJE
): Promise<CreatedJE> {
  const { organizationId, currencyCode, exchangeRate, entryDate, originalLines } = params;

  const year   = entryDate.getFullYear();
  const number = await generateJournalNumber(organizationId, year, tx);
  const postedAt = new Date();

  const totalDebit  = originalLines.reduce((s, l) => s + parseFloat(String(l.credit)), 0);
  const totalCredit = originalLines.reduce((s, l) => s + parseFloat(String(l.debit)),  0);

  const reversalJE = await tx.journalEntry.create({
    data: {
      organizationId,
      fiscalYearId:      params.originalFiscalYearId,
      number,
      entryDate,
      type:              "AUTOMATIC",
      status:            "POSTED",
      currencyCode,
      exchangeRate,
      totalDebit,
      totalCredit,
      descriptionEn:     params.descriptionEn,
      descriptionAr:     params.descriptionAr,
      sourceType:        params.sourceType,
      sourceId:          params.sourceId,
      sourceReference:   params.sourceReference,
      sourceModuleUrl:   null,
      createdByUserId:   params.createdByUserId,
      isReversal:        true,
      reversalOfEntryId: params.originalJEId,
      postedAt,
      postedByUserId:    params.createdByUserId,
      lines: {
        create: originalLines.map((l) => ({
          lineNumber:    l.lineNumber,
          accountId:     l.accountId,
          costCenterId:  l.costCenterId ?? null,
          debit:         parseFloat(String(l.credit)),
          credit:        parseFloat(String(l.debit)),
          debitBase:     parseFloat(String(l.creditBase)),
          creditBase:    parseFloat(String(l.debitBase)),
          descriptionEn: params.descriptionEn,
          descriptionAr: params.descriptionAr,
        })),
      },
    },
    include: { lines: true },
  });

  const hash = computeIntegrityHash(
    {
      id:             reversalJE.id,
      number:         reversalJE.number,
      organizationId: reversalJE.organizationId,
      fiscalYearId:   reversalJE.fiscalYearId,
      entryDate:      reversalJE.entryDate,
      type:           reversalJE.type,
      currencyCode:   reversalJE.currencyCode,
      exchangeRate:   reversalJE.exchangeRate,
      totalDebit:     reversalJE.totalDebit,
      totalCredit:    reversalJE.totalCredit,
      postedAt,
      postedByUserId: params.createdByUserId,
    },
    reversalJE.lines
  );

  await tx.journalEntry.update({
    where: { id: reversalJE.id },
    data:  { integrityHash: hash, hashAlgorithm: "SHA-256", hashedAt: postedAt },
  });

  await tx.journalEntry.update({
    where: { id: params.originalJEId },
    data:  { reversedByEntryId: reversalJE.id },
  });

  return reversalJE;
}
