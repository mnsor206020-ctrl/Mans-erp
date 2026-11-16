/**
 * Pure helpers for the Journal Entries UI. No React, no API calls — testable.
 */

export type Lang = "ar" | "en" | string;

/** Server rule: entry is balanced when abs(totalDebit - totalCredit) < 0.01 (zero totals included). */
export const BALANCE_TOLERANCE = 0.01;

export interface AmountLine {
  debit: string | number | null | undefined;
  credit: string | number | null | undefined;
}

export function parseAmount(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function computeTotals(lines: AmountLine[]) {
  const totalDebit = lines.reduce((s, l) => s + parseAmount(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + parseAmount(l.credit), 0);
  const difference = totalDebit - totalCredit;
  return {
    totalDebit,
    totalCredit,
    difference,
    isBalanced: isBalancedTotals(totalDebit, totalCredit),
    isEmpty: totalDebit === 0 && totalCredit === 0,
  };
}

export function isBalancedTotals(totalDebit: number, totalCredit: number): boolean {
  return Math.abs(totalDebit - totalCredit) < BALANCE_TOLERANCE;
}

export function formatAmount(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = parseFloat(String(n));
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Extracts a server error message from the customFetch ApiError (`.data.error`), with legacy fallbacks. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const e = err as any;
  const msg =
    e?.data?.error ??
    e?.data?.message ??
    e?.response?.data?.error ??
    (typeof e?.message === "string" && e.message ? e.message : undefined);
  return typeof msg === "string" && msg.trim() ? msg : fallback;
}

// ---------------------------------------------------------------------------
// Single description editor over legacy bilingual fields
// ---------------------------------------------------------------------------

export type DescriptionField = "descriptionEn" | "descriptionAr";

export interface LegacyDescription {
  descriptionEn?: string | null;
  descriptionAr?: string | null;
}

export interface DescriptionEditorState {
  /** Legacy field the single editor writes to. */
  field: DescriptionField;
  /** Text shown in the single editor. */
  value: string;
  /** Original values as loaded (null for a new entry). */
  original: { descriptionEn: string; descriptionAr: string } | null;
}

/** New entries store arbitrary-language description in descriptionEn (no API change). */
export function newDescriptionState(): DescriptionEditorState {
  return { field: "descriptionEn", value: "", original: null };
}

/**
 * Picks which legacy field the editor shows: the UI-language-preferred field if
 * non-empty, otherwise the other one; if both empty, the preferred field.
 */
export function initDescriptionState(src: LegacyDescription, lang: Lang): DescriptionEditorState {
  const en = src.descriptionEn ?? "";
  const ar = src.descriptionAr ?? "";
  const preferred: DescriptionField = lang === "ar" ? "descriptionAr" : "descriptionEn";
  const other: DescriptionField = preferred === "descriptionAr" ? "descriptionEn" : "descriptionAr";
  const vals = { descriptionEn: en, descriptionAr: ar };
  const field = vals[preferred] ? preferred : vals[other] ? other : preferred;
  return { field, value: vals[field], original: { descriptionEn: en, descriptionAr: ar } };
}

/**
 * Builds the description part of the payload.
 * - Unchanged edit: both legacy strings are sent back exactly as loaded.
 * - Edited: only the chosen field changes; the other legacy field is retained.
 * - An explicitly cleared legacy field is sent as "", not omitted (PATCH
 *   omission means "keep the previous value").
 */
export function buildDescriptionPayload(state: DescriptionEditorState): {
  descriptionEn: string | undefined;
  descriptionAr: string | undefined;
} {
  const base = state.original ?? { descriptionEn: "", descriptionAr: "" };
  const next = { ...base, [state.field]: state.value };
  return {
    descriptionEn: state.original && state.field === "descriptionEn" ? next.descriptionEn : next.descriptionEn || undefined,
    descriptionAr: state.original && state.field === "descriptionAr" ? next.descriptionAr : next.descriptionAr || undefined,
  };
}

/** Display text for a record's bilingual description, language-preferred with fallback. */
export function pickDescription(src: LegacyDescription, lang: Lang): string {
  return lang === "ar"
    ? src.descriptionAr || src.descriptionEn || ""
    : src.descriptionEn || src.descriptionAr || "";
}

/** /users/me already includes these nested permissions at runtime. No role-name shortcuts. */
export function hasJournalPermission(user: unknown, action: string): boolean {
  const profile = user as {
    userRoles?: Array<{ role?: { rolePermissions?: Array<{ permission?: { resource?: string; action?: string } }> } }>;
  } | null | undefined;
  return profile?.userRoles?.some(({ role }) => role?.rolePermissions?.some(
    ({ permission }) => permission?.resource === "journal_entries" && permission.action === action,
  )) ?? false;
}

/** Status-based action availability (mirrors previous UI rules; server stays authoritative). */
export function getEntryActions(status: string, reversedByEntryId?: string | null, fiscalYearStatus?: string, type?: string) {
  const open = fiscalYearStatus === undefined || fiscalYearStatus === "OPEN";
  const reversible = type !== "CLOSING";
  return {
    canCopy: open,
    canEdit: open && (status === "DRAFT" || status === "UNDER_REVIEW"),
    canSubmit: open && status === "DRAFT",
    canApprove: open && status === "UNDER_REVIEW",
    canReject: open && (status === "UNDER_REVIEW" || status === "APPROVED"),
    canPost: open && status === "APPROVED",
    canLock: false,
    canReverse: open && reversible && (status === "POSTED" || status === "LOCKED") && !reversedByEntryId,
    canVoid: open && reversible && status === "POSTED",
    canDelete: open && status === "DRAFT",
  };
}

export function canChangeBankingJournal(record: { accountingState?: { fiscalYearStatus: string; type: string } | null }) {
  return !record.accountingState
    || (record.accountingState.fiscalYearStatus === "OPEN" && record.accountingState.type !== "CLOSING");
}

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
  UNDER_REVIEW: "bg-amber-50 text-amber-800 border-amber-300",
  APPROVED: "bg-sky-50 text-sky-800 border-sky-300",
  POSTED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  LOCKED: "bg-primary/10 text-primary border-primary/30",
  REVERSED: "bg-orange-50 text-orange-800 border-orange-300",
  VOIDED: "bg-red-50 text-red-700 border-red-300",
};

// ---------------------------------------------------------------------------
// Local journal UI strings (kept here to avoid touching unrelated translations)
// ---------------------------------------------------------------------------

const STRINGS = {
  entryInfo: ["Entry details", "بيانات القيد"],
  description: ["Description", "البيان"],
  descriptionHint: ["Arabic or English", "بالعربية أو الإنجليزية"],
  descriptionPlaceholder: ["What is this entry for?", "اكتب بيان القيد"],
  optional: ["Optional", "اختياري"],
  noFiscalYears: ["No open fiscal years", "لا توجد سنوات مالية مفتوحة"],
  saving: ["Saving...", "جارٍ الحفظ..."],
  processing: ["Processing...", "جارٍ التنفيذ..."],
  draftSaved: ["Draft saved", "تم حفظ المسودة"],
  created: ["created", "تم إنشاؤه"],
  saved: ["Saved", "تم الحفظ"],
  error: ["Error", "خطأ"],
  saveFailed: ["Failed to save", "تعذر الحفظ"],
  actionFailed: ["Action failed", "تعذر تنفيذ الإجراء"],
  validation: ["Check the entry", "راجع القيد"],
  needFiscalYear: ["Please select a fiscal year.", "اختر السنة المالية."],
  needDate: ["Please enter a date.", "أدخل التاريخ."],
  needAccounts: ["Every line needs an account.", "يجب اختيار حساب لكل سطر."],
  notEditable: ["Not editable", "غير قابل للتعديل"],
  notEditableDesc: ["This entry status cannot be edited.", "لا يمكن تعديل قيد بهذه الحالة."],
  loadFailed: ["Could not load the journal entry", "تعذر تحميل القيد"],
  retry: ["Retry", "إعادة المحاولة"],
  back: ["Back to journal entries", "العودة إلى القيود"],
  totalDebit: ["Total debit", "إجمالي المدين"],
  totalCredit: ["Total credit", "إجمالي الدائن"],
  difference: ["Difference", "الفرق"],
  balanced: ["Balanced", "متوازن"],
  unbalanced: ["Not balanced", "غير متوازن"],
  zeroNote: ["Totals are zero — enter amounts", "الإجماليات صفر — أدخل المبالغ"],
  blocking: ["Debit and credit must match before saving.", "يجب تساوي المدين والدائن قبل الحفظ."],
  lines: ["Lines", "الأسطر"],
  addLine: ["Add line", "إضافة سطر"],
  removeLine: ["Remove line", "حذف السطر"],
  minLines: ["At least 2 lines are required", "يلزم سطران على الأقل"],
  line: ["Line", "سطر"],
  account: ["Account", "الحساب"],
  debit: ["Debit", "مدين"],
  credit: ["Credit", "دائن"],
  costCenter: ["Cost center", "مركز التكلفة"],
  lineReference: ["Line reference", "مرجع السطر"],
  none: ["None", "بدون"],
  more: ["More", "المزيد"],
  selectAccount: ["Select account", "اختر الحساب"],
  searchAccount: ["Search by code or name", "ابحث بالرمز أو الاسم"],
  noAccounts: ["No matching postable accounts", "لا توجد حسابات مطابقة قابلة للترحيل"],
  noAccountsHint: ["Try a code like 1101 or part of a name", "جرّب رمزاً مثل 1101 أو جزءاً من الاسم"],
  view: ["View", "عرض"],
  allTypes: ["All types", "كل الأنواع"],
  showing: ["Showing", "عرض"],
  of: ["of", "من"],
  refresh: ["Refresh", "تحديث"],
  noDescription: ["No description", "بدون بيان"],
  workflow: ["Workflow", "سير العمل"],
  submitted: ["Submitted for review", "تم الإرسال للمراجعة"],
  approved: ["Approved", "تم الاعتماد"],
  rejected: ["Rejected — returned to draft", "تم الرفض — أعيد إلى مسودة"],
  posted: ["Posted", "تم الترحيل"],
  locked: ["Locked", "تم القفل"],
  reversalCreated: ["Reversal created", "تم إنشاء قيد العكس"],
  copied: ["Copied", "تم النسخ"],
  voided: ["Voided", "تم الإلغاء"],
  deleted: ["Deleted", "تم الحذف"],
  submitConfirm: ["Submit this entry for review?", "إرسال هذا القيد للمراجعة؟"],
  loading: ["Loading entry...", "جارٍ تحميل القيد..."],
} as const;

export type JeStringKey = keyof typeof STRINGS;

export function jt(lang: Lang, key: JeStringKey): string {
  return STRINGS[key][lang === "ar" ? 1 : 0];
}
