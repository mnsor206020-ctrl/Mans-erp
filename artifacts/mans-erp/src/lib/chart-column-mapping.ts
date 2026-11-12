import type { ChartImportRow } from "@workspace/api-client-react";

export type ChartImportField = Exclude<keyof ChartImportRow, "rowNumber">;
/** null is an explicit choice: omit an optional field, roots only, or default nature. */
export type ChartColumnMapping = Partial<Record<ChartImportField, number | null>>;
export interface ChartWorkbookData {
  sheetName: string;
  columns: { index: number; label: string; samples: string[] }[];
  rows: {
    rowNumber: number;
    cells: Record<number, { value: string; codeValue: string; error?: string }>;
  }[];
}
export const CHART_IMPORT_FIELDS: { key: ChartImportField; label: string }[] = [
  { key: "code", label: "كود الحساب" },
  { key: "name", label: "اسم الحساب" },
  { key: "nameAr", label: "الاسم العربي" },
  { key: "nameEn", label: "الاسم الإنجليزي" },
  { key: "parentCode", label: "كود الحساب الأب" },
  { key: "type", label: "نوع الحساب" },
  { key: "nature", label: "طبيعة الحساب" },
  { key: "notes", label: "الوصف" },
];

/** A column has one owner; choosing it again moves it instead of creating a conflict. */
export function assignChartColumn(mapping: ChartColumnMapping, field: ChartImportField, column: number | null | undefined): ChartColumnMapping {
  const next = { ...mapping };
  if (typeof column === "number") {
    for (const key of Object.keys(next) as ChartImportField[])
      if (key !== field && next[key] === column) delete next[key];
  }
  next[field] = column;
  return next;
}

export function chartMappingErrors(data: ChartWorkbookData, mapping: ChartColumnMapping): string[] {
  const errors: string[] = [];
  for (const key of ["code", "type"] as const)
    if (typeof mapping[key] !== "number") errors.push(`اختر عمود ${CHART_IMPORT_FIELDS.find((f) => f.key === key)!.label}.`);
  if (!["name", "nameAr", "nameEn"].some((key) => typeof mapping[key as ChartImportField] === "number"))
    errors.push("اختر عمودًا واحدًا على الأقل لاسم الحساب.");
  if (mapping.parentCode === undefined)
    errors.push("اختر عمود الأب أو اختر صراحةً أن جميع الحسابات رئيسية.");
  if (mapping.nature === undefined)
    errors.push("اختر عمود الطبيعة أو وافق على الطبيعة الافتراضية حسب النوع.");
  const assigned = new Set<number>();
  const available = new Set(data.columns.map((c) => c.index));
  for (const field of CHART_IMPORT_FIELDS) {
    const col = mapping[field.key];
    if (typeof col !== "number") continue;
    if (!available.has(col)) errors.push(`عمود ${field.label} غير موجود في الملف.`);
    if (assigned.has(col)) errors.push("لا يمكن مطابقة العمود نفسه مع أكثر من حقل؛ استخدم اسم الحساب العام لتعبئة اللغتين.");
    assigned.add(col);
  }
  return errors;
}

const typeAliases: Record<string, string> = {
  "أصول": "ASSET", "اصول": "ASSET", asset: "ASSET", assets: "ASSET",
  "التزامات": "LIABILITY", "خصوم": "LIABILITY", liability: "LIABILITY", liabilities: "LIABILITY",
  "حقوق الملكية": "EQUITY", equity: "EQUITY",
  "إيرادات": "REVENUE", "ايرادات": "REVENUE", revenue: "REVENUE",
  "مصروفات": "EXPENSE", expense: "EXPENSE", expenses: "EXPENSE",
};

export function mapChartWorkbook(data: ChartWorkbookData, mapping: ChartColumnMapping): ChartImportRow[] {
  const errors = chartMappingErrors(data, mapping);
  if (errors.length) throw new Error(`مطابقة الأعمدة غير مكتملة: ${errors.join(" ")}`);
  const rows: ChartImportRow[] = [];
  for (const row of data.rows) {
    const values: Partial<Record<ChartImportField, string>> = {};
    for (const field of CHART_IMPORT_FIELDS) {
      const col = mapping[field.key];
      if (typeof col !== "number") continue;
      const cell = row.cells[col];
      if (cell?.error) throw new Error(cell.error);
      values[field.key] = cell
        ? (field.key === "code" || field.key === "parentCode" ? cell.codeValue : cell.value) : "";
    }
    // Data in ignored columns does not turn a blank account row into an account.
    if (Object.values(values).every((value) => !value)) continue;
    const typeText = values.type || "";
    const type = typeAliases[typeText.toLowerCase()] || typeText.toUpperCase();
    const natureText = values.nature || "";
    const nature = mapping.nature === null
      ? ["ASSET", "EXPENSE"].includes(type) ? "DEBIT"
        : ["LIABILITY", "EQUITY", "REVENUE"].includes(type) ? "CREDIT" : ""
      : ({ "مدين": "DEBIT", "دائن": "CREDIT" } as Record<string, string>)[natureText] || natureText.toUpperCase();
    rows.push({
      rowNumber: row.rowNumber, code: values.code || "", parentCode: values.parentCode || "",
      name: values.name, nameAr: values.nameAr, nameEn: values.nameEn, notes: values.notes,
      type, nature,
    });
  }
  if (!rows.length) throw new Error("الملف لا يحتوي على حسابات في الأعمدة المحددة.");
  return rows;
}
