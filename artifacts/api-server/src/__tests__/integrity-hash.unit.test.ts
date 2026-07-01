import { createHash } from "crypto";
import { describe, it, expect } from "vitest";
import {
  buildCanonicalJson,
  computeIntegrityHash,
  type HashEntry,
  type HashLine,
} from "../services/integrity-hash";

const BASE_ENTRY: HashEntry = {
  id:             "00000000-0000-0000-0000-000000000001",
  number:         "JE-2026-0001",
  organizationId: "00000000-0000-0000-0000-000000000002",
  fiscalYearId:   "00000000-0000-0000-0000-000000000003",
  entryDate:      new Date("2026-06-30T00:00:00.000Z"),
  type:           "MANUAL",
  currencyCode:   "SAR",
  exchangeRate:   1,
  totalDebit:     10000,
  totalCredit:    10000,
  postedAt:       new Date("2026-06-30T12:00:00.000Z"),
  postedByUserId: "00000000-0000-0000-0000-000000000004",
};

const BASE_LINES: HashLine[] = [
  { lineNumber: 1, accountId: "00000000-0000-0000-0000-000000000010", debit: 10000, credit: 0, debitBase: 10000, creditBase: 0 },
  { lineNumber: 2, accountId: "00000000-0000-0000-0000-000000000011", debit: 0, credit: 10000, debitBase: 0, creditBase: 10000 },
];

const EXPECTED_CANONICAL =
  '{"currencyCode":"SAR","entryDate":"2026-06-30","exchangeRate":"1.00000000",' +
  '"fiscalYearId":"00000000-0000-0000-0000-000000000003",' +
  '"id":"00000000-0000-0000-0000-000000000001",' +
  '"lines":[' +
    '{"accountId":"00000000-0000-0000-0000-000000000010","credit":"0.0000","creditBase":"0.0000","debit":"10000.0000","debitBase":"10000.0000","lineNumber":1},' +
    '{"accountId":"00000000-0000-0000-0000-000000000011","credit":"10000.0000","creditBase":"10000.0000","debit":"0.0000","debitBase":"0.0000","lineNumber":2}' +
  '],' +
  '"number":"JE-2026-0001",' +
  '"organizationId":"00000000-0000-0000-0000-000000000002",' +
  '"postedAt":"2026-06-30T12:00:00.000Z",' +
  '"postedByUserId":"00000000-0000-0000-0000-000000000004",' +
  '"totalCredit":"10000.0000","totalDebit":"10000.0000","type":"MANUAL"}';

const EXPECTED_HASH = createHash("sha256").update(EXPECTED_CANONICAL, "utf8").digest("hex");

describe("buildCanonicalJson", () => {
  it("produces the expected canonical JSON string (keys sorted, decimals formatted)", () => {
    expect(buildCanonicalJson(BASE_ENTRY, BASE_LINES)).toBe(EXPECTED_CANONICAL);
  });

  it("serializes entryDate as YYYY-MM-DD (date only)", () => {
    const json = buildCanonicalJson(BASE_ENTRY, BASE_LINES);
    const parsed = JSON.parse(json);
    expect(parsed.entryDate).toBe("2026-06-30");
  });

  it("serializes exchangeRate to 8 decimal places", () => {
    const json = buildCanonicalJson(BASE_ENTRY, BASE_LINES);
    const parsed = JSON.parse(json);
    expect(parsed.exchangeRate).toBe("1.00000000");
  });

  it("serializes monetary Decimals to 4 decimal places", () => {
    const json = buildCanonicalJson(BASE_ENTRY, BASE_LINES);
    const parsed = JSON.parse(json);
    expect(parsed.totalDebit).toBe("10000.0000");
    expect(parsed.totalCredit).toBe("10000.0000");
    expect(parsed.lines[0].debit).toBe("10000.0000");
    expect(parsed.lines[0].credit).toBe("0.0000");
  });

  it("sorts lines by lineNumber regardless of input order", () => {
    const reversed = [...BASE_LINES].reverse();
    const canonical = buildCanonicalJson(BASE_ENTRY, reversed);
    const parsed = JSON.parse(canonical);
    expect(parsed.lines[0].lineNumber).toBe(1);
    expect(parsed.lines[1].lineNumber).toBe(2);
  });

  it("produces identical output when lines are already ordered", () => {
    const fwd = buildCanonicalJson(BASE_ENTRY, BASE_LINES);
    const rev = buildCanonicalJson(BASE_ENTRY, [...BASE_LINES].reverse());
    expect(fwd).toBe(rev);
  });

  it("accepts Prisma Decimal-like objects (has toString)", () => {
    const decimalLike = { toString: () => "12345.6789" };
    const entry = { ...BASE_ENTRY, totalDebit: decimalLike, totalCredit: decimalLike, exchangeRate: decimalLike };
    const parsed = JSON.parse(buildCanonicalJson(entry, BASE_LINES));
    expect(parsed.totalDebit).toBe("12345.6789");
    expect(parsed.exchangeRate).toBe("12345.67890000");
  });
});

describe("computeIntegrityHash", () => {
  it("returns a 64-character lowercase hex string", () => {
    const hash = computeIntegrityHash(BASE_ENTRY, BASE_LINES);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the expected SHA-256 of the canonical JSON (known test vector)", () => {
    expect(computeIntegrityHash(BASE_ENTRY, BASE_LINES)).toBe(EXPECTED_HASH);
  });

  it("is deterministic — same input always yields same hash", () => {
    const h1 = computeIntegrityHash(BASE_ENTRY, BASE_LINES);
    const h2 = computeIntegrityHash(BASE_ENTRY, BASE_LINES);
    expect(h1).toBe(h2);
  });

  it("changes hash when entry id changes", () => {
    const mutated = { ...BASE_ENTRY, id: "00000000-0000-0000-0000-000000000099" };
    expect(computeIntegrityHash(mutated, BASE_LINES)).not.toBe(computeIntegrityHash(BASE_ENTRY, BASE_LINES));
  });

  it("changes hash when totalDebit changes", () => {
    const mutated = { ...BASE_ENTRY, totalDebit: 99999 };
    expect(computeIntegrityHash(mutated, BASE_LINES)).not.toBe(computeIntegrityHash(BASE_ENTRY, BASE_LINES));
  });

  it("changes hash when a line amount changes", () => {
    const mutatedLines = [
      { ...BASE_LINES[0], debit: 9999 },
      BASE_LINES[1],
    ];
    expect(computeIntegrityHash(BASE_ENTRY, mutatedLines)).not.toBe(computeIntegrityHash(BASE_ENTRY, BASE_LINES));
  });

  it("changes hash when postedAt changes", () => {
    const mutated = { ...BASE_ENTRY, postedAt: new Date("2026-07-01T00:00:00.000Z") };
    expect(computeIntegrityHash(mutated, BASE_LINES)).not.toBe(computeIntegrityHash(BASE_ENTRY, BASE_LINES));
  });
});
