import { describe, expect, it } from "vitest";
import { journalFiscalYearState } from "../lib/fiscal-year-selection";

const year = { id: "2026", status: "OPEN", nameAr: "اختبار 2026", nameEn: "TEST",
  startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z" };
const next = { ...year, id: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isDefault: true };
describe("date-driven journal fiscal year", () => {
  it.each(["2026-01-01", "2026-06-15", "2026-12-31"])("selects the year covering %s, not the default", date => {
    expect(journalFiscalYearState([next, year], date)).toEqual({ year, error: "" });
  });
  it.each(["", "not-a-date", "2026-02-30"])("rejects invalid date %s", date => {
    expect(journalFiscalYearState([year], date).error).toContain("صالح");
  });
  it("clears the resolved year for a date outside available years", () => {
    expect(journalFiscalYearState([year], "2027-01-01")).toEqual({ error: expect.stringContaining("لا توجد") });
  });
  it("shows the closed year but blocks saving", () => {
    const closed = { ...year, status: "CLOSED" };
    expect(journalFiscalYearState([closed], "2026-06-15")).toEqual({ year: closed, error: expect.stringContaining("مقفلة") });
  });
  it("rejects multiple matches including an open/closed overlap", () => {
    expect(journalFiscalYearState([year, { ...year, id: "legacy", status: "CLOSED" }], "2026-06-15"))
      .toEqual({ error: expect.stringContaining("أكثر من") });
  });
  it("resolves again from the new creation date", () => {
    expect(journalFiscalYearState([year, next], "2026-12-31").year?.id).toBe("2026");
    expect(journalFiscalYearState([year, next], "2027-01-01").year?.id).toBe("2027");
  });
  it("does not move an existing entry when its date changes to the next year", () => {
    expect(journalFiscalYearState([year, next], "2027-01-01", year.id))
      .toEqual({ year, error: expect.stringContaining("لن يُنقل") });
  });
});
