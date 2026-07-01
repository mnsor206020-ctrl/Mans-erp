import { describe, it, expect } from "vitest";
import { computeDuration, rejectCommentSchema } from "../lib/journal-entry-utils";

// ── computeDuration ───────────────────────────────────────────────────────────

describe("computeDuration", () => {
  it("returns null when there is no previous action (first approval record)", () => {
    const now = new Date("2026-07-01T10:00:00Z");
    expect(computeDuration(null, now)).toBeNull();
  });

  it("returns the correct number of whole seconds between two timestamps", () => {
    const prev = new Date("2026-07-01T10:00:00Z");
    const curr = new Date("2026-07-01T11:02:00Z");
    expect(computeDuration(prev, curr)).toBe(3720);
  });

  it("floors fractional seconds rather than rounding", () => {
    const prev = new Date("2026-07-01T10:00:00.000Z");
    const curr = new Date("2026-07-01T10:00:01.999Z");
    expect(computeDuration(prev, curr)).toBe(1);
  });

  it("returns 0 when timestamps are identical", () => {
    const ts = new Date("2026-07-01T10:00:00Z");
    expect(computeDuration(ts, ts)).toBe(0);
  });
});

// ── rejectCommentSchema ───────────────────────────────────────────────────────

describe("rejectCommentSchema", () => {
  it("accepts a comment that meets the minimum length", () => {
    const result = rejectCommentSchema.safeParse({ comment: "Valid reason here" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing comment field", () => {
    const result = rejectCommentSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/required/i);
  });

  it("rejects a comment shorter than 10 characters", () => {
    const result = rejectCommentSchema.safeParse({ comment: "Too short" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/10 characters/i);
  });

  it("rejects an empty string comment", () => {
    const result = rejectCommentSchema.safeParse({ comment: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a comment of exactly 10 characters", () => {
    const result = rejectCommentSchema.safeParse({ comment: "1234567890" });
    expect(result.success).toBe(true);
  });
});
