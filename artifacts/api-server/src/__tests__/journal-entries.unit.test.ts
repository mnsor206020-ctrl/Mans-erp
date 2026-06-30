import { describe, it, expect } from "vitest";
import { formatJENumber, createHeaderSchema } from "../lib/journal-entry-utils";

// ── Unit tests: formatJENumber (pure function) ────────────────────────────────

describe("formatJENumber", () => {
  it("formats the first entry of a year as JE-YYYY-0001", () => {
    expect(formatJENumber(2026, 1)).toBe("JE-2026-0001");
  });

  it("formats the 10th entry of a year as JE-YYYY-0010", () => {
    expect(formatJENumber(2026, 10)).toBe("JE-2026-0010");
  });

  it("resets sequence number to 0001 on a year boundary", () => {
    expect(formatJENumber(2027, 1)).toBe("JE-2027-0001");
  });
});

// ── Unit tests: createHeaderSchema (Zod validation) ──────────────────────────

describe("createHeaderSchema", () => {
  it("rejects a payload that is missing fiscalYearId", () => {
    const result = createHeaderSchema.safeParse({ entryDate: "2026-06-30" });
    expect(result.success).toBe(false);
    const fieldErrors = result.error!.flatten().fieldErrors;
    expect(fieldErrors).toHaveProperty("fiscalYearId");
  });

  it("rejects an entryDate in DD-MM-YYYY format (must be YYYY-MM-DD)", () => {
    const result = createHeaderSchema.safeParse({
      fiscalYearId: "00000000-0000-0000-0000-000000000001",
      entryDate: "30-06-2026",
    });
    expect(result.success).toBe(false);
    const fieldErrors = result.error!.flatten().fieldErrors;
    expect(fieldErrors).toHaveProperty("entryDate");
  });
});
