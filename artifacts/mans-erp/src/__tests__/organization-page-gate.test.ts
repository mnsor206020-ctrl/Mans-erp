import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationPageGate } from "../components/OrganizationPageGate";
import Dashboard from "../pages/Dashboard";
import ChartOfAccounts from "../pages/ChartOfAccounts";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), lang: "en" }));
vi.mock("@workspace/api-client-react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/api-client-react")>(),
  useGetCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/language-provider", () => ({
  useLanguage: () => ({ lang: mocks.lang }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lang = "en";
});

function state(overrides = {}) {
  return { isPending: false, isError: false, isFetching: false, data: undefined, refetch: vi.fn(), ...overrides };
}

describe.each([
  { name: "Dashboard", page: Dashboard },
  { name: "Chart of Accounts", page: ChartOfAccounts },
])("$name account initialization", ({ page }) => {
  it("does not mount page queries while the local account is initializing", () => {
    mocks.currentUser.mockReturnValue(state({ isPending: true }));
    expect(renderToStaticMarkup(createElement(page))).toContain("Initializing your account");
    expect(mocks.currentUser).toHaveBeenCalledWith({ query: { queryKey: ["/api/users/me"], retry: false } });
    // The unmocked page query hooks require a QueryClient; mounting them here
    // would throw, exposing the original premature-query regression.
  });

  it("does not request organization data for an unassigned account", () => {
    mocks.currentUser.mockReturnValue(state({ data: { organizationId: null } }));
    const html = renderToStaticMarkup(createElement(page));
    expect(html).toContain("not assigned to an organization");
    expect(html).toContain("Retry");
    expect(html).not.toContain("An error occurred");
  });

  it("waits for a refreshed account after organization assignment", () => {
    mocks.currentUser.mockReturnValue(state({
      isFetching: true,
      data: { organizationId: null },
    }));
    expect(renderToStaticMarkup(createElement(page))).toContain("Initializing your account");
  });

  it("shows an explicit initialization failure instead of mounting the page", () => {
    mocks.currentUser.mockReturnValue(state({ isError: true }));
    const html = renderToStaticMarkup(createElement(page));
    expect(html).toContain('role="alert"');
    expect(html).toContain("could not be initialized");
    expect(html).toContain("Retry");
  });
});

it("mounts organization queries only after successful account initialization and assignment", () => {
  mocks.currentUser.mockReturnValue(state({ data: { organizationId: "test-organization" } }));
  const requests = vi.fn();
  function ScopedPage() {
    requests();
    return createElement("div", null, "Organization data");
  }
  const html = renderToStaticMarkup(
    createElement(OrganizationPageGate, null, createElement(ScopedPage)),
  );
  expect(requests).toHaveBeenCalledTimes(1);
  expect(html).toContain("Organization data");
});

it("renders the organization assignment message in Arabic", () => {
  mocks.lang = "ar";
  mocks.currentUser.mockReturnValue(state({ data: { organizationId: null } }));
  expect(renderToStaticMarkup(createElement(OrganizationPageGate, null, "hidden data")))
    .toContain("حسابك غير مرتبط بمنظمة");
});
