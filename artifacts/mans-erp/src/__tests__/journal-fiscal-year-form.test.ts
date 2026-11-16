import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  years: { data: [] as Array<{ id: string; status: string; startDate: string; endDate: string; nameEn: string; nameAr: string }>,
    isPending: false, isError: false, refetch: vi.fn() },
}));
vi.mock("@workspace/api-client-react", () => ({
  useListFiscalYears: () => state.years,
  useGetCurrentUser: () => ({ data: {} }),
  useGetJournalEntry: () => ({ data: undefined }),
  useListCostCenters: () => ({ data: [] }),
  useListChartOfAccounts: () => ({ data: { data: [] } }),
  useCreateJournalEntry: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateJournalEntry: () => ({ isPending: false, mutate: vi.fn() }),
  getListJournalEntriesQueryKey: () => [],
  getGetJournalEntryQueryKey: () => [],
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/language-provider", () => ({ useLanguage: () => ({ lang: "ar", t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/journal-entries/new", vi.fn()],
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/journal-entries/JournalLinesTable", () => ({ JournalLinesTable: () => null }));
vi.mock("@/components/journal-entries/BalanceSummary", () => ({ BalanceSummary: () => null }));
vi.mock("@/components/journal-entries/AttachmentsPanel", () => ({ AttachmentsPanel: () => null }));
vi.mock("@/components/journal-entries/SourceTrackingFields", () => ({ SourceTrackingFields: () => null }));
import JournalEntryForm from "../pages/JournalEntryForm";

const year = { id: "TEST-year", status: "OPEN", startDate: "2026-01-01", endDate: "2026-12-31",
  nameEn: "TEST year", nameAr: "سنة اختبار تلقائية" };
const html = () => renderToStaticMarkup(createElement(JournalEntryForm));
describe("journal creation fiscal-year field", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    state.years.data = [year];
    state.years.isPending = false;
    state.years.isError = false;
  });
  afterEach(() => vi.useRealTimers());
  it("renders the resolved year read-only, with no manual fiscal-year selector", () => {
    const markup = html();
    expect(markup).toContain('data-testid="resolved-fiscal-year"');
    expect(markup).toMatch(/readonly=""/i);
    expect(markup).toContain(year.nameAr);
    expect(markup).not.toContain('data-testid="select-fiscal-year"');
  });
  it("shows a loading state without selecting any default year", () => {
    state.years.isPending = true;
    state.years.data = [];
    expect(html()).toContain("جارٍ تحديد السنة المالية");
  });
  it("shows a retry action when the fiscal-year request fails", () => {
    state.years.isError = true;
    state.years.data = [];
    const markup = html();
    expect(markup).toContain("تعذر تحميل السنوات المالية");
    expect(markup).toContain("إعادة المحاولة");
  });
  it.each(["CLOSED", "missing", "ambiguous"])("renders an Arabic rejection for %s", scenario => {
    state.years.data = scenario === "missing" ? [] : scenario === "CLOSED"
      ? [{ ...year, status: "CLOSED" }] : [year, { ...year, id: "TEST-overlap" }];
    const markup = html();
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(scenario === "missing" ? "لا توجد سنة" : scenario === "CLOSED" ? "مقفلة" : "أكثر من");
  });
});
