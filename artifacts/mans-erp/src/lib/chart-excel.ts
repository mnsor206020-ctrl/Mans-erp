import type { ChartImportRow } from "@workspace/api-client-react";
import type { Cell } from "exceljs";
import { mapChartWorkbook, type ChartWorkbookData, type ChartColumnMapping, type ChartImportField } from "./chart-column-mapping";

const MAX_ROWS = 2000;
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/[\s_()[\]-]/g, "");
const headers: Record<string, keyof ChartImportRow> = {};
const aliases: Partial<Record<keyof ChartImportRow, string[]>> = {
  code: ["Account Code", "code", "كود الحساب", "رقم الحساب", "الرمز"],
  name: ["Account Name", "name", "اسم الحساب"],
  nameAr: ["Account Name Arabic", "nameAr", "اسم الحساب عربي", "الاسم بالعربية", "الاسم العربي", "اسم الحساب بالعربية"],
  nameEn: ["Account Name English", "nameEn", "اسم الحساب إنجليزي", "اسم الحساب انجليزي", "الاسم بالإنجليزية", "الاسم الإنجليزي", "اسم الحساب بالإنجليزية"],
  parentCode: ["Parent Account Code", "parentCode", "كود الحساب الأب", "كود الحساب الاب", "رقم الحساب الأب", "رمز الحساب الرئيسي", "كود الحساب الرئيسي", "الحساب الأب"],
  type: ["Account Type", "type", "نوع الحساب"],
  nature: ["Account Nature", "nature", "طبيعة الحساب"],
  notes: ["Account Description", "Description", "notes", "وصف الحساب", "الوصف"],
};
for (const [key, values] of Object.entries(aliases))
  values.forEach((label) => { headers[normalize(label)] = key as keyof ChartImportRow; });

function text(cell: Cell, code = false): string {
  if (cell.type === 6 || (cell.value && typeof cell.value === "object" && "formula" in cell.value))
    throw new Error(`الصف ${cell.row}: الصيغ غير مسموحة. استبدلها بقيم نصية.`);
  if (cell.value instanceof Date) throw new Error(`الصف ${cell.row}: استخدم نصًا وليس تاريخًا.`);
  if (typeof cell.value === "number") {
    if (!Number.isFinite(cell.value) || Math.abs(cell.value) > Number.MAX_SAFE_INTEGER)
      throw new Error(`الصف ${cell.row}: الرقم كبير جدًا. احفظ الأكواد كنص في Excel.`);
    if (code && Number.isInteger(cell.value) && /^0+$/.test(cell.numFmt))
      return String(cell.value).padStart(cell.numFmt.length, "0");
  }
  return cell.text.trim();
}

export async function inspectChartWorkbook(buffer: ArrayBuffer): Promise<ChartWorkbookData> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new Error("تعذر قراءة الملف. تأكد أنه ملف Excel صالح بصيغة .xlsx وغير محمي بكلمة مرور."); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("الملف لا يحتوي على ورقة عمل.");
  const rows: ChartWorkbookData["rows"] = [];
  const columnIndices = new Set<number>();
  sheet.getRow(1).eachCell((_, col) => columnIndices.add(col));
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const cells: ChartWorkbookData["rows"][number]["cells"] = {};
    row.eachCell((cell, col) => {
      columnIndices.add(col);
      try { cells[col] = { value: text(cell), codeValue: text(cell, true) }; }
      catch (e) {
        cells[col] = { value: cell.text, codeValue: cell.text, error: e instanceof Error ? e.message : "خلية غير صالحة." };
      }
    });
    if (Object.values(cells).every((cell) => !cell.value && !cell.error)) return;
    if (rows.length >= MAX_ROWS) throw new Error("الحد الأقصى 2000 حساب لكل ملف. قسّم الملف إلى دفعات.");
    rows.push({ rowNumber: number, cells });
  });
  if (!rows.length) throw new Error("الملف لا يحتوي على حسابات.");
  return {
    sheetName: sheet.name, rows,
    columns: [...columnIndices].sort((a, b) => a - b).map((index) => ({
      index, label: sheet.getRow(1).getCell(index).text.trim() || `عمود ${index} (بدون عنوان)`,
      samples: rows.slice(0, 3).map((row) => row.cells[index]?.value || ""),
    })),
  };
}

/** Suggestions are editable; ambiguous duplicate headers are never chosen silently. */
export function suggestChartMapping(data: ChartWorkbookData): ChartColumnMapping {
  const mapping: ChartColumnMapping = {};
  const ambiguous = new Set<ChartImportField>();
  for (const column of data.columns) {
    const field = headers[normalize(column.label)] as ChartImportField | undefined;
    if (!field) continue;
    if (mapping[field] !== undefined) ambiguous.add(field);
    mapping[field] = column.index;
  }
  ambiguous.forEach((field) => delete mapping[field]);
  return mapping;
}

const isLevelColumn = (label: string) => ["المستوى", "مستوى الحساب", "Level", "Account Level"].some((name) => normalize(name) === normalize(label));

/** Known headings are deterministic; ambiguous headings still require review. */
export function automaticChartMapping(data: ChartWorkbookData): ChartColumnMapping {
  const mapping = suggestChartMapping(data);
  const hasHeading = (field: ChartImportField) => data.columns.some((column) => headers[normalize(column.label)] === field);
  if (!hasHeading("nature")) mapping.nature = null;
  if (!hasHeading("parentCode")) {
    const level = data.columns.find((column) => isLevelColumn(column.label));
    const clearlyFlat = level && data.rows.every((row) => !row.cells[level.index]?.error && row.cells[level.index]?.value === "1");
    const onlyKnownColumns = data.columns.every((column) => !!headers[normalize(column.label)]);
    // An unknown column could contain parents: do not silently flatten such files.
    if (clearlyFlat || onlyKnownColumns) mapping.parentCode = null;
  }
  return mapping;
}

export function chartImportNotices(data: ChartWorkbookData, mapping: ChartColumnMapping, previewRows: { rowNumber: number; level: number }[]): string[] {
  const notices: string[] = [];
  if (mapping.nature === null)
    notices.push("الطبيعة تلقائية حسب النوع: الأصول والمصروفات مدين، والباقي دائن. راجع الحسابات العكسية قبل التأكيد؛ يمكنك تحديد طبيعتها من ملفك عبر تعديل المطابقة.");
  if (mapping.parentCode === null)
    notices.push("لا يوجد عمود أب محدد؛ ستُستورد الحسابات كحسابات رئيسية.");
  const level = data.columns.find((column) => isLevelColumn(column.label));
  if (level) {
    const actual = new Map(previewRows.map((row) => [row.rowNumber, row.level]));
    const mismatches = data.rows.filter((row) => {
      const value = row.cells[level.index]?.value;
      return value && actual.has(row.rowNumber) && Number(value) !== actual.get(row.rowNumber);
    }).length;
    if (mismatches)
      notices.push(`يوجد ${mismatches} حسابًا يختلف مستوى ملفه عن العلاقة المحددة بالأب. المعاينة تعتمد كود الأب المباشر؛ لا تُنشأ حسابات وسيطة تلقائيًا.`);
  }
  return notices;
}

export async function parseChartWorkbook(buffer: ArrayBuffer): Promise<ChartImportRow[]> {
  const data = await inspectChartWorkbook(buffer);
  const fields = data.columns.map((column) => headers[normalize(column.label)]).filter(Boolean);
  if (new Set(fields).size !== fields.length) throw new Error("العمود مكرر؛ راجع مطابقة الأعمدة.");
  return mapChartWorkbook(data, suggestChartMapping(data));
}

export async function createChartTemplate(): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Accounts");
  sheet.columns = [
    { header: "Account Code", key: "code", width: 22, style: { numFmt: "@" } },
    { header: "Account Name", key: "name", width: 30 },
    { header: "Parent Account Code", key: "parentCode", width: 24, style: { numFmt: "@" } },
    { header: "Account Type", key: "type", width: 20 },
    { header: "Account Nature", key: "nature", width: 20 },
    { header: "Account Description", key: "notes", width: 35 },
    { header: "Account Name Arabic", key: "nameAr", width: 30 },
    { header: "Account Name English", key: "nameEn", width: 30 },
  ];
  sheet.addRows([
    { code: "A", name: "الأصول", nameEn: "Assets", type: "ASSET", nature: "DEBIT" },
    { code: "A-10", name: "النقدية", nameEn: "Cash", parentCode: "A", type: "ASSET", nature: "DEBIT" },
    { code: "001", name: "الصندوق", nameEn: "Cash Box", parentCode: "A-10", type: "ASSET", nature: "DEBIT", notes: "حساب تجريبي في القالب" },
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const instructions = workbook.addWorksheet("Instructions");
  [
    "احذف صفوف المثال واستبدلها بحساباتك. تُقرأ الورقة الأولى فقط.",
    "يمكنك استخدام عناوين مختلفة واختيار مطابقة الأعمدة قبل المعاينة؛ الأعمدة غير المحددة تُتجاهل.",
    "احفظ الأكواد كنص للحفاظ على الأصفار، ولا تستخدم صيغ Excel.",
    "Account Type: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
    "Account Nature: DEBIT, CREDIT (مدين، دائن)",
    "Account Name مطلوب، أو استخدم أحد حقلي الاسم العربي والإنجليزي. الاسم الواحد يُستخدم للغتين.",
    "Parent Account Code فارغ للحسابات الرئيسية. لا يوجد تنسيق رقمي أو حد عمق ثابت.",
    "يمكن استخدام أب موجود فقط إذا كان تجميعيًا ونشطًا وبنفس النوع. لن تُعدّل حسابات موجودة.",
    "حد الملف 5 ميجابايت و2000 حساب. امتداد xlsx فقط.",
  ].forEach((line) => instructions.addRow([line]));
  instructions.getColumn(1).width = 120;
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer).slice().buffer;
}
