import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteChartOfAccount } from "@workspace/api-client-react";
import { chartAccountDeleteError } from "@/lib/chart-account-delete-error";

afterEach(() => vi.unstubAllGlobals());

// Only a mocked HTTP transport is used. Never send DELETE to the running ERP.
describe("Chart account deletion responses", () => {
  it.each([
    [403, "Forbidden: you do not have permission to perform this action", "لا يملك صلاحية"],
    [400, "Cannot delete an account with 2 sub-account(s). Delete or reassign them first.", "2 حسابًا فرعيًا"],
    [400, "Cannot delete an account with 3 transaction(s). Consider deactivating it instead.", "3 حركة محاسبية"],
    [401, "Unauthorized", "انتهت جلسة الدخول"],
    [404, "Account not found", "غير موجود"],
    [500, "Failed to delete account", "خطأ في الخادم"],
  ])("displays the real generated client's %s response in Arabic", async (status, message, expected) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: message }), {
      status, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);
    let caught: unknown;
    try { await deleteChartOfAccount("TEST-account"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ status, data: { error: message } });
    expect(chartAccountDeleteError(caught, "ar")).toContain(expected);
    expect(fetch).toHaveBeenCalledWith("/api/chart-of-accounts/TEST-account", expect.objectContaining({ method: "DELETE" }));
  });
  it("accepts a successful deletion without expecting a request payload", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);
    await expect(deleteChartOfAccount("TEST-account")).resolves.toEqual({ success: true });
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });
  it("keeps server reasons in English and handles network failures safely", () => {
    expect(chartAccountDeleteError({ status: 400, data: { error: "Cannot delete an account with 2 sub-account(s)." } }, "en"))
      .toContain("2 sub-account(s)");
    expect(chartAccountDeleteError(new TypeError("Failed to fetch"), "ar")).toContain("تحقق من الاتصال");
    expect(chartAccountDeleteError(null, "ar")).toContain("تعذر حذف الحساب");
  });
});
