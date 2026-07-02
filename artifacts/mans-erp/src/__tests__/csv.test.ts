import { describe, it, expect } from "vitest";
import { escapeCsvCell, buildCsv, generateFilename } from "../lib/csv";

const BOM = "\uFEFF";

// ─── escapeCsvCell ────────────────────────────────────────────────────────────

describe("escapeCsvCell", () => {
  it("returns plain string unchanged when no special characters", () => {
    expect(escapeCsvCell("Hello")).toBe("Hello");
    expect(escapeCsvCell("Account Name")).toBe("Account Name");
  });

  it("wraps value in quotes when it contains a comma", () => {
    expect(escapeCsvCell("cash, bank")).toBe('"cash, bank"');
  });

  it("wraps value in quotes when it contains a double-quote", () => {
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("doubles internal double-quotes for proper CSV escaping", () => {
    expect(escapeCsvCell('"quoted"')).toBe('"""quoted"""');
  });

  it("wraps value in quotes when it contains a newline", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps value in quotes when it contains a carriage return", () => {
    expect(escapeCsvCell("line1\rline2")).toBe('"line1\rline2"');
  });

  it("handles numbers correctly", () => {
    expect(escapeCsvCell(12345.67)).toBe("12345.67");
    expect(escapeCsvCell(0)).toBe("0");
  });

  it("handles null as empty string", () => {
    expect(escapeCsvCell(null)).toBe("");
  });

  it("handles undefined as empty string", () => {
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("handles Arabic text without quoting", () => {
    expect(escapeCsvCell("رأس المال")).toBe("رأس المال");
  });

  it("handles Arabic text with comma (must be quoted)", () => {
    expect(escapeCsvCell("إيرادات, مبيعات")).toBe('"إيرادات, مبيعات"');
  });

  it("preserves numeric zero", () => {
    expect(escapeCsvCell(0)).toBe("0");
  });
});

// ─── buildCsv ─────────────────────────────────────────────────────────────────

describe("buildCsv", () => {
  it("prepends UTF-8 BOM", () => {
    const csv = buildCsv(["A"], []);
    expect(csv.startsWith(BOM)).toBe(true);
  });

  it("first line is the header row", () => {
    const csv  = buildCsv(["Code", "Name", "Balance"], []);
    const lines = csv.slice(BOM.length).split("\r\n");
    expect(lines[0]).toBe("Code,Name,Balance");
  });

  it("uses CRLF line endings", () => {
    const csv = buildCsv(["H"], [["v1"], ["v2"]]);
    expect(csv).toContain("\r\n");
  });

  it("produces correct row count (header + data)", () => {
    const csv   = buildCsv(["H1", "H2"], [["a", "b"], ["c", "d"], ["e", "f"]]);
    const lines = csv.slice(BOM.length).split("\r\n");
    expect(lines).toHaveLength(4); // 1 header + 3 rows
  });

  it("escapes cells in headers and rows", () => {
    const csv   = buildCsv(["Name, Code"], [['O"Neill', 1000]]);
    const lines = csv.slice(BOM.length).split("\r\n");
    expect(lines[0]).toBe('"Name, Code"');
    expect(lines[1]).toBe('"O""Neill",1000');
  });

  it("handles empty dataset (header only)", () => {
    const csv   = buildCsv(["Account Code", "Balance"], []);
    const lines = csv.slice(BOM.length).split("\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Account Code,Balance");
  });

  it("handles Arabic headers and values", () => {
    const csv   = buildCsv(["الكود", "الحساب"], [["1010", "النقد"]]);
    const lines = csv.slice(BOM.length).split("\r\n");
    expect(lines[0]).toBe("الكود,الحساب");
    expect(lines[1]).toBe("1010,النقد");
  });

  it("handles null and undefined values as empty strings", () => {
    const csv   = buildCsv(["A", "B", "C"], [[null, undefined, "ok"]]);
    const lines = csv.slice(BOM.length).split("\r\n");
    expect(lines[1]).toBe(",,ok");
  });
});

// ─── generateFilename ─────────────────────────────────────────────────────────

describe("generateFilename", () => {
  it("produces the correct prefix", () => {
    expect(generateFilename("trial-balance")).toMatch(/^trial-balance-/);
    expect(generateFilename("income-statement")).toMatch(/^income-statement-/);
    expect(generateFilename("balance-sheet")).toMatch(/^balance-sheet-/);
    expect(generateFilename("account-ledger")).toMatch(/^account-ledger-/);
  });

  it("ends with .csv extension", () => {
    expect(generateFilename("trial-balance")).toMatch(/\.csv$/);
  });

  it("includes today's date in YYYY-MM-DD format", () => {
    const filename = generateFilename("test");
    const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})\.csv$/);
    expect(dateMatch).not.toBeNull();
    const now  = new Date();
    const yyyy = String(now.getFullYear());
    const mm   = String(now.getMonth() + 1).padStart(2, "0");
    const dd   = String(now.getDate()).padStart(2, "0");
    expect(dateMatch![1]).toBe(yyyy);
    expect(dateMatch![2]).toBe(mm);
    expect(dateMatch![3]).toBe(dd);
  });

  it("matches full expected pattern", () => {
    expect(generateFilename("my-report")).toMatch(/^my-report-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
