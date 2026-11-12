import type { ChartImportResult, ChartImportRow } from "@workspace/api-zod";

export interface ExistingImportAccount {
  id: string;
  code: string;
  type: string;
  level: number;
  isGroup: boolean;
  isActive: boolean;
  deletedAt: Date | null;
}

const types = new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]);
const natures = new Set(["DEBIT", "CREDIT"]);

/** Iterative topological traversal: codes need no numeric format or fixed depth. */
export function validateChartImport(input: ChartImportRow[], existing: ExistingImportAccount[]): ChartImportResult {
  const errors: ChartImportResult["errors"] = [];
  const rows = input.map((r) => {
    const name = r.name?.trim() || r.nameAr?.trim() || r.nameEn?.trim() || "";
    return {
      rowNumber: r.rowNumber, code: r.code.trim(), parentCode: r.parentCode.trim(),
      nameAr: r.nameAr?.trim() || name, nameEn: r.nameEn?.trim() || name,
      type: r.type.trim().toUpperCase(), nature: r.nature.trim().toUpperCase(),
      notes: r.notes?.trim() || "", level: 1, isGroup: false,
    };
  });
  const byCode = new Map<string, typeof rows>();
  const existingByCode = new Map(existing.map((a) => [a.code, a]));
  const add = (r: typeof rows[number], message: string) =>
    errors.push({ rowNumber: r.rowNumber, code: r.code, message });

  for (const r of rows) {
    const matches = byCode.get(r.code) || [];
    matches.push(r);
    byCode.set(r.code, matches);
    if (!r.code || r.code.length > 20) add(r, "كود الحساب مطلوب وبحد أقصى 20 حرفًا.");
    if (!r.nameAr || !r.nameEn || r.nameAr.length > 200 || r.nameEn.length > 200)
      add(r, "اسم الحساب مطلوب وبحد أقصى 200 حرف لكل لغة.");
    if (!types.has(r.type)) add(r, "نوع الحساب غير صالح: ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE.");
    if (!natures.has(r.nature)) add(r, "طبيعة الحساب مطلوبة: DEBIT أو CREDIT.");
    if (existingByCode.has(r.code)) add(r, "كود الحساب موجود مسبقًا، حتى لو كان مؤرشفًا. لن يتم استبداله.");
    if (r.notes.length > 5000) add(r, "الوصف يتجاوز 5000 حرف.");
  }
  for (const matches of byCode.values()) {
    if (matches.length > 1) matches.forEach((r) => add(r, "كود حساب مكرر داخل الملف."));
  }

  const children = new Map<string, typeof rows>();
  const pending = new Map<typeof rows[number], number>();
  const queue: typeof rows = [];
  for (const r of rows) {
    const parentRows = byCode.get(r.parentCode);
    const parent = existingByCode.get(r.parentCode);
    if (r.parentCode && parentRows) {
      pending.set(r, 1);
      const list = children.get(r.parentCode) || [];
      list.push(r);
      children.set(r.parentCode, list);
      if (parentRows[0].type !== r.type) add(r, "نوع الحساب لا يطابق نوع الحساب الأب.");
    } else {
      pending.set(r, 0);
      if (r.parentCode) {
        if (!parent || parent.deletedAt) add(r, "كود الحساب الأب غير موجود أو مؤرشف.");
        else {
          r.level = parent.level + 1;
          if (!parent.isGroup || !parent.isActive)
            add(r, "الحساب الأب الموجود يجب أن يكون تجميعيًا ونشطًا؛ لن يتم تعديل حساب موجود.");
          if (parent.type !== r.type) add(r, "نوع الحساب لا يطابق نوع الحساب الأب.");
        }
      }
      queue.push(r);
    }
  }
  const ordered: typeof rows = [];
  for (let i = 0; i < queue.length; i++) {
    const r = queue[i];
    ordered.push(r);
    r.isGroup = children.has(r.code);
    for (const child of children.get(r.code) || []) {
      if (pending.get(child) === 1) {
        child.level = r.level + 1;
        pending.set(child, 0);
        queue.push(child);
      }
    }
  }
  const seen = new Set(ordered);
  for (const r of rows) {
    if (!seen.has(r)) {
      add(r, "توجد دورة في تسلسل الآباء أو يعتمد الحساب على دورة.");
      ordered.push(r);
    }
  }
  return {
    valid: errors.length === 0, total: rows.length,
    mainAccounts: rows.filter((r) => !r.parentCode).length,
    subaccounts: rows.filter((r) => !!r.parentCode).length,
    imported: 0, rows: ordered, errors,
  };
}
