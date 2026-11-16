import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  toast: vi.fn(),
  createOptions: {} as { mutation?: { onError: (error: unknown) => void } },
  updateOptions: {} as { mutation?: { onError: (error: unknown) => void } },
}));
vi.mock("@workspace/api-client-react", () => ({
  useGetCurrentUser: () => ({ data: {} }),
  useGetJournalEntry: () => ({ data: undefined }),
  useListCostCenters: () => ({ data: [] }),
  useListChartOfAccounts: () => ({ data: { data: [] } }),
  useCreateJournalEntry: (options: typeof state.createOptions) => {
    state.createOptions = options;
    return { isPending: false, mutate: vi.fn() };
  },
  useUpdateJournalEntry: (options: typeof state.updateOptions) => {
    state.updateOptions = options;
    return { isPending: false, mutate: vi.fn() };
  },
  getListJournalEntriesQueryKey: () => [],
  getGetJournalEntryQueryKey: () => [],
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/language-provider", () => ({ useLanguage: () => ({ lang: "ar", t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/journal-entries/new", vi.fn()],
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/journal-entries/JournalLinesTable", () => ({ JournalLinesTable: () => null }));
vi.mock("@/components/journal-entries/BalanceSummary", () => ({ BalanceSummary: () => null }));
vi.mock("@/components/journal-entries/AttachmentsPanel", () => ({ AttachmentsPanel: () => null }));
vi.mock("@/components/journal-entries/SourceTrackingFields", () => ({ SourceTrackingFields: () => null }));
import JournalEntryForm from "../pages/JournalEntryForm";

describe("journal form uses the date without a fiscal-year field", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    state.toast.mockClear();
  });
  afterEach(() => vi.useRealTimers());
  it("renders creation without a year picker, readonly field, hint or pre-save year error", () => {
    const markup = renderToStaticMarkup(createElement(JournalEntryForm));
    expect(markup).toContain('data-testid="input-entry-date"');
    for (const text of ["resolved-fiscal-year", "select-fiscal-year", "je.fiscalYear",
      "تُحدد تلقائيًا", "تم تحديد السنة", "لا توجد سنة"]) expect(markup).not.toContain(text);
  });
  it("has no fiscal-year query, field or payload assignment in create or edit code", () => {
    const source = readFileSync(new URL("../pages/JournalEntryForm.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/useListFiscalYears|setFiscalYearId|select-fiscal-year|resolved-fiscal-year/);
    expect(source).not.toMatch(/^\s*fiscalYearId[,:]/m);
    expect(source).toContain("updateMutation.mutate({ id: entryId, data: payload })");
    expect(source).toContain("createMutation.mutate({ data: payload })");
  });
  it.each([
    "لا توجد سنة مالية تغطي تاريخ القيد؛ لا يمكن الحفظ.",
    "السنة المالية التي تغطي تاريخ القيد مقفلة؛ لا يمكن إنشاء القيد.",
    "تاريخ القيد يجب أن يقع ضمن بداية ونهاية السنة المالية المرتبطة به.",
  ])("displays the API save rejection: %s", message => {
    renderToStaticMarkup(createElement(JournalEntryForm));
    for (const options of [state.createOptions, state.updateOptions]) {
      options.mutation!.onError({ data: { error: message }, message: `HTTP 400: ${message}` });
      expect(state.toast).toHaveBeenLastCalledWith(expect.objectContaining({
        description: message, variant: "destructive",
      }));
    }
  });
});
