import { describe, expect, it } from "vitest";
import {
  createAccountFormSession,
  syncAccountFormSession,
  type AccountFormData,
  type AccountFormSession,
} from "@/lib/chart-account-form-session";

const defaults: AccountFormData = {
  parentId: null, code: "", nameEn: "", nameAr: "", type: "", nature: "",
  isGroup: false, notes: "",
};
const accountA = {
  id: "TEST-A", parentId: "TEST-parent", code: "A-001", nameEn: "TEST Cash",
  nameAr: "نقد اختباري", type: "ASSET", nature: "DEBIT", isGroup: true, notes: "TEST notes",
} satisfies AccountFormData & { id: string };
const accountB = {
  ...accountA, id: "TEST-B", code: "B-001", nameEn: "TEST Revenue",
  nameAr: "إيراد اختباري", type: "REVENUE", nature: "CREDIT", isGroup: false,
} satisfies AccountFormData & { id: string };

function entered(session: AccountFormSession): AccountFormSession {
  const { id: _id, ...values } = accountA;
  return { ...session, values };
}

describe("chart account dialog session boundaries (no network or database)", () => {
  it("initializes every new-account field to the existing defaults", () => {
    expect(createAccountFormSession(true).values).toEqual(defaults);
  });
  it("resets every field when a successful save closes the dialog then it reopens", () => {
    const filled = entered(createAccountFormSession(true));
    const closed = syncAccountFormSession(filled, false);
    const reopened = syncAccountFormSession(closed, true);
    expect(reopened.values).toEqual(defaults);
    expect(reopened.accountId).toBeNull();
  });
  it("resets after cancellation and an initially closed controlled dialog opens", () => {
    const cancelled = syncAccountFormSession(entered(createAccountFormSession(true)), false);
    expect(syncAccountFormSession(cancelled, true).values).toEqual(defaults);
    expect(syncAccountFormSession(createAccountFormSession(false), true).values).toEqual(defaults);
  });
  it("copies all existing account fields for editing without including id in the form data", () => {
    const { id: _id, ...values } = accountA;
    const editing = createAccountFormSession(true, accountA);
    expect(editing.values).toEqual(values);
    expect(editing.values).not.toHaveProperty("id");
    expect(editing.values).not.toBe(accountA);
  });
  it("loads another account when the edited identity changes while open", () => {
    const editing = entered(createAccountFormSession(true, accountA));
    const switched = syncAccountFormSession(editing, true, accountB);
    const { id: _id, ...values } = accountB;
    expect(switched.accountId).toBe("TEST-B");
    expect(switched.values).toEqual(values);
  });
  it("keeps unsaved input across parent rerenders and refreshed data for the same identity", () => {
    const editing = createAccountFormSession(true, accountA);
    editing.values.nameAr = "وصف لم يُحفظ";
    const refreshed = { ...accountA, nameAr: "قيمة من إعادة الجلب" };
    expect(syncAccountFormSession(editing, true, refreshed)).toBe(editing);
    expect(editing.values.nameAr).toBe("وصف لم يُحفظ");
    expect(syncAccountFormSession(editing, true, { ...refreshed })).toBe(editing);
  });
  it("preserves all entered fields while a failed save leaves the create session open", () => {
    const filled = entered(createAccountFormSession(true));
    // Loading/error changes do not change the session's open/account inputs.
    expect(syncAccountFormSession(filled, true)).toBe(filled);
    expect(syncAccountFormSession(filled, true).values).toEqual(filled.values);
  });
  it("reopening the same account discards cancelled edits and loads the latest saved values", () => {
    const editing = entered(createAccountFormSession(true, accountA));
    editing.values.notes = "cancelled edit";
    const closed = syncAccountFormSession(editing, false, accountA);
    const latest = { ...accountA, notes: "latest saved notes" };
    expect(syncAccountFormSession(closed, true, latest).values.notes).toBe("latest saved notes");
  });
  it("switches between edit and create without carrying account values into the new form", () => {
    const editing = createAccountFormSession(true, accountA);
    const creating = syncAccountFormSession(editing, true);
    expect(creating.values).toEqual(defaults);
    expect(syncAccountFormSession(creating, true, accountB).values.code).toBe("B-001");
  });
  it("does not share mutable default or initial objects across sessions", () => {
    const first = createAccountFormSession(true);
    first.values.code = "changed";
    expect(createAccountFormSession(true).values).toEqual(defaults);
    const edit = createAccountFormSession(true, accountA);
    edit.values.code = "changed";
    expect(accountA.code).toBe("A-001");
  });
  it("stabilizes the render guard after each open or account transition", () => {
    const initial = createAccountFormSession(false);
    const opened = syncAccountFormSession(initial, true, accountA);
    expect(syncAccountFormSession(opened, true, { ...accountA })).toBe(opened);
    const closed = syncAccountFormSession(opened, false, accountA);
    expect(syncAccountFormSession(closed, false, { ...accountA })).toBe(closed);
  });
});
