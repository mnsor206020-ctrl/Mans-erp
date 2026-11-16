import { describe, expect, it } from "vitest";
import {
  buildDescriptionPayload, initDescriptionState, newDescriptionState,
  computeTotals, isBalancedTotals, getEntryActions, getApiErrorMessage,
  hasJournalPermission, canChangeBankingJournal,
} from "@/lib/journal-entry-ui";

describe("Single journal description editor", () => {
  it.each(["ar", "en"])("preserves both legacy values in %s without edits", (lang) => {
    const original = { descriptionAr: "بيان قديم", descriptionEn: "Legacy description" };
    expect(buildDescriptionPayload(initDescriptionState(original, lang))).toEqual(original);
  });
  it("changes only the displayed legacy field and retains the other", () => {
    const state = initDescriptionState({ descriptionAr: "قديم", descriptionEn: "Keep me" }, "ar");
    expect(buildDescriptionPayload({ ...state, value: "بيان / Updated" }))
      .toEqual({ descriptionAr: "بيان / Updated", descriptionEn: "Keep me" });
  });
  it("uses the populated fallback field regardless of UI language", () => {
    const state = initDescriptionState({ descriptionEn: "English only" }, "ar");
    expect(state.field).toBe("descriptionEn");
    expect(buildDescriptionPayload({ ...state, value: "عربي" }).descriptionEn).toBe("عربي");
  });
  it("supports either language for a new entry with no contract changes", () => {
    expect(buildDescriptionPayload({ ...newDescriptionState(), value: "بيان Test" }))
      .toEqual({ descriptionEn: "بيان Test", descriptionAr: undefined });
  });
  it("explicitly clears the edited field instead of silently keeping its previous value", () => {
    const state = initDescriptionState({ descriptionAr: "قديم", descriptionEn: "Retain legacy" }, "ar");
    expect(buildDescriptionPayload({ ...state, value: "" }))
      .toEqual({ descriptionAr: "", descriptionEn: "Retain legacy" });
  });
});

describe("Accounting presentation remains consistent with the server", () => {
  it.each(["DRAFT", "UNDER_REVIEW", "APPROVED", "POSTED", "LOCKED", "REVERSED"])(
    "disables every journal mutation in CLOSED (%s)", (status) => {
      expect(Object.values(getEntryActions(status, null, "CLOSED", "MANUAL"))).not.toContain(true);
    },
  );
  it("retains OPEN actions but never reverses or voids CLOSING", () => {
    expect(getEntryActions("POSTED", null, "OPEN", "MANUAL").canReverse).toBe(true);
    expect(getEntryActions("POSTED", null, "OPEN", "CLOSING")).toMatchObject({ canReverse: false, canVoid: false, canCopy: true });
    expect(getEntryActions("DRAFT", null, "OPEN")).toMatchObject({ canEdit: true, canSubmit: true });
  });
  it("disables automatic banking reversal for closed years and closing entries", () => {
    expect(canChangeBankingJournal({ accountingState: { fiscalYearStatus: "CLOSED", type: "AUTOMATIC" } })).toBe(false);
    expect(canChangeBankingJournal({ accountingState: { fiscalYearStatus: "OPEN", type: "CLOSING" } })).toBe(false);
    expect(canChangeBankingJournal({ accountingState: { fiscalYearStatus: "OPEN", type: "AUTOMATIC" } })).toBe(true);
    expect(canChangeBankingJournal({ accountingState: null })).toBe(true);
  });
  it("totals decimal string amounts and reports imbalance", () => {
    expect(computeTotals([{ debit: "1500", credit: "" }, { debit: "", credit: "1300" }]))
      .toMatchObject({ totalDebit: 1500, totalCredit: 1300, difference: 200, isBalanced: false });
  });
  it("keeps the strict less-than-one-cent tolerance and zero rule", () => {
    expect(isBalancedTotals(0, 0)).toBe(true);
    expect(isBalancedTotals(0.009, 0)).toBe(true);
    expect(isBalancedTotals(0.01, 0)).toBe(false);
    expect(computeTotals([{ debit: 0.1 + 0.2, credit: 0.3 }]).isBalanced).toBe(true);
  });
  it("keeps status restrictions on edit, approve and post", () => {
    expect(getEntryActions("DRAFT")).toMatchObject({ canEdit: true, canSubmit: true, canPost: false, canApprove: false });
    expect(getEntryActions("UNDER_REVIEW")).toMatchObject({ canApprove: true, canPost: false });
    expect(getEntryActions("APPROVED")).toMatchObject({ canEdit: false, canPost: true });
    expect(getEntryActions("POSTED")).toMatchObject({ canEdit: false, canPost: false, canReverse: true });
    expect(getEntryActions("LOCKED", "reversal-id").canReverse).toBe(false);
    expect(getEntryActions("VOIDED").canDelete).toBe(false);
  });
  it("shows actual Fetch API failures and a safe fallback", () => {
    expect(getApiErrorMessage({ data: { error: "القيد غير متوازن" } }, "فشل")).toBe("القيد غير متوازن");
    expect(getApiErrorMessage(undefined, "تعذر الحفظ")).toBe("تعذر الحفظ");
  });
  it.each(["DRAFT", "UNDER_REVIEW", "APPROVED", "POSTED", "REVERSED", "LOCKED", "VOIDED"])(
    "never offers locking for %s while preserving legacy reversal availability", (status) => {
      expect(getEntryActions(status).canLock).toBe(false);
      expect(getEntryActions(status).canReverse).toBe(["POSTED", "LOCKED"].includes(status));
    },
  );
  it("uses explicit permissions from the existing profile and fails closed while loading", () => {
    expect(hasJournalPermission(undefined, "approve")).toBe(false);
    expect(hasJournalPermission({ userRoles: [{ role: { nameEn: "Super Admin" } }] }, "approve")).toBe(false);
    const profile = { userRoles: [{ role: { rolePermissions: [
      { permission: { resource: "journal_entries", action: "read" } },
      { permission: { resource: "journal_entries", action: "create" } },
      { permission: { resource: "receipts", action: "approve" } },
    ] } }] };
    expect(hasJournalPermission(profile, "create")).toBe(true);
    expect(hasJournalPermission(profile, "approve")).toBe(false);
    expect(hasJournalPermission(profile, "delete")).toBe(false);
  });
});
