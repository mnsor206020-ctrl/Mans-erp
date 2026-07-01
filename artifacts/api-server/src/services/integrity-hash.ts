import { createHash } from "crypto";

export interface HashEntry {
  id: string;
  number: string;
  organizationId: string;
  fiscalYearId: string;
  entryDate: Date | string;
  type: string;
  currencyCode: string;
  exchangeRate: { toString(): string } | number | string;
  totalDebit: { toString(): string } | number | string;
  totalCredit: { toString(): string } | number | string;
  postedAt: Date | string;
  postedByUserId: string;
}

export interface HashLine {
  lineNumber: number;
  accountId: string;
  debit: { toString(): string } | number | string;
  credit: { toString(): string } | number | string;
  debitBase: { toString(): string } | number | string;
  creditBase: { toString(): string } | number | string;
}

function fmt4(v: { toString(): string } | number | string): string {
  return parseFloat(v.toString()).toFixed(4);
}

function fmt8(v: { toString(): string } | number | string): string {
  return parseFloat(v.toString()).toFixed(8);
}

function toDateOnly(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toIso(d: Date | string): string {
  if (typeof d === "string") return d;
  return d.toISOString();
}

export function buildCanonicalJson(entry: HashEntry, lines: HashLine[]): string {
  const sortedLines = [...lines]
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((l) => ({
      accountId:  l.accountId,
      credit:     fmt4(l.credit),
      creditBase: fmt4(l.creditBase),
      debit:      fmt4(l.debit),
      debitBase:  fmt4(l.debitBase),
      lineNumber: l.lineNumber,
    }));

  const payload = {
    currencyCode:   entry.currencyCode,
    entryDate:      toDateOnly(entry.entryDate),
    exchangeRate:   fmt8(entry.exchangeRate),
    fiscalYearId:   entry.fiscalYearId,
    id:             entry.id,
    lines:          sortedLines,
    number:         entry.number,
    organizationId: entry.organizationId,
    postedAt:       toIso(entry.postedAt),
    postedByUserId: entry.postedByUserId,
    totalCredit:    fmt4(entry.totalCredit),
    totalDebit:     fmt4(entry.totalDebit),
    type:           entry.type,
  };

  return JSON.stringify(payload);
}

export function computeIntegrityHash(entry: HashEntry, lines: HashLine[]): string {
  const canonical = buildCanonicalJson(entry, lines);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
