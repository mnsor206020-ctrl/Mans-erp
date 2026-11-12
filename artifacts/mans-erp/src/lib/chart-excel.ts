import type { ChartImportRow } from "@workspace/api-client-react";
import type { Cell } from "exceljs";

const MAX_ROWS = 2000;
const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_()[\]-]/g, "");
const headers: Record<string, keyof ChartImportRow> = {};
const aliases: Partial<Record<keyof ChartImportRow, string[]>> = {
  code: ["Account Code", "code", "كود الحساب", "رقم الحساب"],
  name: ["Account Name", "name", "اسم الحساب"],
  nameAr: ["Account Name Arabic", "nameAr", "اسم الحساب عربي"],
  nameEn: ["Account Name English", "nameEn", "اسم الحساب إنجليزي", "اسم الحساب انجليزي"],
  parentCode: ["Parent Account Code", "parentCode", "كود الحساب الأب", "كود الحساب الاب", "رقم الحساب الأب"],
  type: ["Account Type", "type", "نوع الحساب"],
  nature: ["Account Nature", "nature", "طبيعة الحساب"],
  notes: ["Account Description", "Description", "notes", "وصف الحساب", "الوصف"],
};
for (const [key, values] of Object.entries(aliases))
  values.forEach((label) => { headers[normalize(label)] = key as keyof ChartImportRow; });

const typeAliases: Record<string, string> = {
  "أصول": "ASSET", "اصول": "ASSET", asset: "ASSET", assets: "ASSET",
  "التزامات": "LIABILITY", "خصوم": "LIABILITY", liability: "LIABILITY", liabilities: "LIABILITY",
  "حقوق الملكية": "EQUITY", equity: "EQUITY",
  "إيرادات": "REVENUE", "ايرادات": "REVENUE", revenue: "REVENUE",
  "مصروفات": "EXPENSE", expense: "EXPENSE", expenses: "EXPENSE",
};

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

export async function parseChartWorkbook(buffer: ArrayBuffer): Promise<ChartImportRow[]> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new Error("تعذر قراءة الملف. تأكد أنه ملف Excel صالح بصيغة .xlsx وغير محمي بكلمة مرور."); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("الملف لا يحتوي على ورقة عمل.");
  const columns = new Map<number, keyof ChartImportRow>();
  const seen = new Set<string>();
  sheet.getRow(1).eachCell((cell, col) => {
    const field = headers[normalize(text(cell))];
    if (!field) return;
    if (seen.has(field)) throw new Error(`العمود مكرر: ${cell.text}`);
    seen.add(field);
    columns.set(col, field);
  });
  if (!["code", "parentCode", "type", "nature"].every((key) => seen.has(key)) ||
      !["name", "nameAr", "nameEn"].some((key) => seen.has(key)))
    throw new Error("عناوين الأعمدة غير مكتملة. استخدم قالب Excel المتاح.");

  const rows: ChartImportRow[] = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const values: Record<string, string> = {};
    for (const [col, field] of columns) values[field] = text(row.getCell(col), field === "code" || field === "parentCode");
    if (Object.values(values).every((v) => !v)) return;
    if (rows.length >= MAX_ROWS) throw new Error("الحد الأقصى 2000 حساب لكل ملف. قسّم الملف إلى دفعات.");
    const type = values.type || "";
    const nature = values.nature || "";
    rows.push({
      rowNumber: number, code: values.code || "", parentCode: values.parentCode || "",
      name: values.name, nameAr: values.nameAr, nameEn: values.nameEn, notes: values.notes,
      type: typeAliases[type.toLowerCase()] || type.toUpperCase(),
      nature: ({ "مدين": "DEBIT", "دائن": "CREDIT" } as Record<string, string>)[nature] || nature.toUpperCase(),
    });
  });
  if (!rows.length) throw new Error("الملف لا يحتوي على حسابات.");
  return rows;
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
