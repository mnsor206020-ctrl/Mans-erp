import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { ledgerErrorMessage, retryLedgerRequest } from "@/lib/account-ledger-ui";
import { LanguageProvider } from "@/lib/language-provider";
import AccountLedger from "@/pages/AccountLedger";

const state = vi.hoisted(() => ({
  error: null as unknown,
  options: undefined as unknown,
  lang: "ar",
}));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: (initial: unknown) => {
      if (initial === null) return [{ accountId: "test-account", from: "2026-01-01", to: "2026-12-31" }, vi.fn()];
      if (initial === "en") return [state.lang, vi.fn()];
      return original.useState(initial);
    },
  };
});
vi.mock("@workspace/api-client-react", () => ({
  useListChartOfAccounts: () => ({ data: { data: [] }, isLoading: false }),
  useGetAccountLedger: (_params: unknown, options: unknown) => {
    state.options = options;
    return { error: state.error, isLoading: false, refetch: vi.fn() };
  },
}));

function renderPage() {
  return renderToStaticMarkup(createElement(LanguageProvider, null, createElement(AccountLedger)));
}

beforeEach(() => {
  state.error = null;
  state.lang = "ar";
});

describe("Ledger-only request and error presentation", () => {
  it("makes exactly one request for HTTP 400 with the page retry policy", async () => {
    renderPage();
    const options = state.options as { query: { retry: typeof retryLedgerRequest } };
    const request = vi.fn().mockRejectedValue({ status: 400, data: { error: "نطاق غير صالح" } });
    const client = new QueryClient();
    try {
      await expect(client.fetchQuery({
        queryKey: ["ledger-error"],
        queryFn: request,
        ...options.query,
        retryDelay: 0,
      })).rejects.toMatchObject({ status: 400 });
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      client.clear();
    }
  });

  it("preserves the default three retries for other failures", () => {
    expect(retryLedgerRequest(0, { status: 500 })).toBe(true);
    expect(retryLedgerRequest(2, new Error("Network error"))).toBe(true);
    expect(retryLedgerRequest(3, { status: 500 })).toBe(false);
  });

  it.each(["ar", "en"])("renders the real refresh translation in %s", (lang) => {
    state.lang = lang;
    const html = renderPage();
    expect(html).toContain(lang === "ar" ? "تحديث" : "Refresh");
    expect(html).not.toContain("common.refresh");
  });

  it("renders the Arabic server error without a technical prefix and keeps filters visible", () => {
    state.error = { status: 400, data: { error: "نطاق تواريخ دفتر الأستاذ غير صالح" }, message: "HTTP 400 Bad Request: نطاق تواريخ دفتر الأستاذ غير صالح" };
    const html = renderPage();
    expect(html).toContain('role="alert"');
    expect(html).toContain("نطاق تواريخ دفتر الأستاذ غير صالح");
    expect(html).not.toContain("HTTP 400");
    expect(html).toContain('type="date"');
    expect(html).toContain('role="combobox"');
    state.error = null;
    expect(renderPage()).not.toContain('role="alert"');
  });

  it.each([
    [{ message: "HTTP 400 : رسالة عربية" }, "رسالة عربية"],
    [{ message: "HTTP 400 Bad Request: رسالة عربية" }, "رسالة عربية"],
    [{ message: "HTTP 400 Bad Request" }, "حدث خطأ"],
    [{ data: { message: "خطأ: راجع الفترة" } }, "خطأ: راجع الفترة"],
    [{ data: "رسالة عربية" }, "رسالة عربية"],
    [undefined, "حدث خطأ"],
  ])("keeps useful error text and falls back for empty errors", (error, expected) => {
    expect(ledgerErrorMessage(error, "حدث خطأ")).toBe(expected);
  });
});
