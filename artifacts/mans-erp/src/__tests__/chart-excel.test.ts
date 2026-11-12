import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { createChartTemplate, parseChartWorkbook, inspectChartWorkbook, suggestChartMapping, automaticChartMapping, chartImportNotices } from "@/lib/chart-excel";
import { assignChartColumn, chartMappingErrors, mapChartWorkbook } from "@/lib/chart-column-mapping";

async function buffer(workbook: ExcelJS.Workbook) {
  return new Uint8Array(await workbook.xlsx.writeBuffer()).slice().buffer;
}
function workbook(headers: string[], rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Accounts");
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return book;
}
describe("Chart Excel parser and template", () => {
  it("round-trips the downloadable template with mixed names and leading zeros", async () => {
    const rows = await parseChartWorkbook(await createChartTemplate());
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ code: "001", name: "الصندوق", nameEn: "Cash Box", parentCode: "A-10", notes: "حساب تجريبي في القالب" });
  });
  it("supports Arabic headers and type/nature labels", async () => {
    const book = workbook(
      ["كود الحساب", "اسم الحساب", "كود الحساب الأب", "نوع الحساب", "طبيعة الحساب"],
      [["A-1", "النقدية", "", "أصول", "مدين"]],
    );
    expect((await parseChartWorkbook(await buffer(book)))[0]).toMatchObject({ code: "A-1", type: "ASSET", nature: "DEBIT" });
  });
  it("retains zero-padded numeric account codes", async () => {
    const book = workbook(["Account Code", "Account Name", "Parent Account Code", "Account Type", "Account Nature"], [[12, "Cash", "", "ASSET", "DEBIT"]]);
    book.worksheets[0].getCell("A2").numFmt = "0000";
    expect((await parseChartWorkbook(await buffer(book)))[0].code).toBe("0012");
  });
  it("rejects formulas instead of trusting cached results", async () => {
    const book = workbook(["Account Code", "Account Name", "Parent Account Code", "Account Type", "Account Nature"],
      [[{ formula: "1+1", result: 2 }, "Cash", "", "ASSET", "DEBIT"]]);
    await expect(parseChartWorkbook(await buffer(book))).rejects.toThrow("الصيغ غير مسموحة");
  });
  it("rejects missing or duplicate mapped headers", async () => {
    await expect(parseChartWorkbook(await buffer(workbook(["Account Code"], [["a"]])))).rejects.toThrow("غير مكتملة");
    await expect(parseChartWorkbook(await buffer(workbook(["Account Code", "كود الحساب"], [["a", "b"]])))).rejects.toThrow("مكرر");
  });
  it("rejects corrupt files with a clear Arabic error", async () => {
    await expect(parseChartWorkbook(new ArrayBuffer(10))).rejects.toThrow("تعذر قراءة الملف");
  });
});

describe("Flexible chart column mapping", () => {
  it("maps reordered arbitrary headers without requiring fixed column names", async () => {
    const book = workbook(["label custom", "debit flag", "ref", "family", "bucket", "memo"],
      [["النقدية", "مدين", "001", "root", "أصول", "وصف واحد"]]);
    const data = await inspectChartWorkbook(await buffer(book));
    expect(suggestChartMapping(data)).toEqual({});
    expect(mapChartWorkbook(data, { nameAr: 1, nature: 2, code: 3, parentCode: 4, type: 5, notes: 6 })[0])
      .toMatchObject({ nameAr: "النقدية", code: "001", parentCode: "root", type: "ASSET", nature: "DEBIT", notes: "وصف واحد", rowNumber: 2 });
  });
  it("suggests the supplied Qoyod-style layout without treating level/payment flags as nature", async () => {
    const book = workbook(
      ["الرمز", "الاسم بالعربية", "الاسم بالإنجليزية", "المستوى", "رمز الحساب الرئيسي", "نوع الحساب", "الوصف", "يقبل الدفع والتحصيل"],
      [[1, "الأصول", "Assets", 99, "", "أصول", "رئيسي", "لا"],
        [11, "النقدية", "Cash", 99, 1, "أصول", "فرعي", "نعم"]],
    );
    const data = await inspectChartWorkbook(await buffer(book));
    const mapping = suggestChartMapping(data);
    expect(mapping).toEqual({ code: 1, nameAr: 2, nameEn: 3, parentCode: 5, type: 6, notes: 7 });
    expect(chartMappingErrors(data, mapping)).toContain("اختر عمود الطبيعة أو وافق على الطبيعة الافتراضية حسب النوع.");
    expect(() => mapChartWorkbook(data, mapping)).toThrow("مطابقة الأعمدة غير مكتملة");
    const rows = mapChartWorkbook(data, { ...mapping, nature: null });
    expect(rows[1]).toMatchObject({ code: "11", nameAr: "النقدية", nameEn: "Cash", parentCode: "1", type: "ASSET", nature: "DEBIT" });
    expect(rows[1]).not.toHaveProperty("level");
  });
  it("does not infer parents from account prefixes or silently choose default nature", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(["id", "title", "kind"], [["001", "Cash", "ASSET"]])));
    const mapping = { code: 1, name: 2, type: 3 };
    expect(chartMappingErrors(data, mapping)).toHaveLength(2);
    expect(mapChartWorkbook(data, { ...mapping, parentCode: null, nature: null })[0])
      .toMatchObject({ code: "001", parentCode: "", nature: "DEBIT" });
  });
  it("requires distinct available columns and at least one name", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(["id", "title", "kind"], [["a", "Cash", "ASSET"]])));
    expect(chartMappingErrors(data, { code: 1, name: 1, type: 3, parentCode: null, nature: null }).join(" ")).toContain("العمود نفسه");
    expect(chartMappingErrors(data, { code: 1, name: 99, type: 3, parentCode: null, nature: null }).join(" ")).toContain("غير موجود");
    expect(chartMappingErrors(data, { code: 1, type: 3, parentCode: null, nature: null }).join(" ")).toContain("لاسم الحساب");
  });
  it("allows duplicate header names only after explicit disambiguation by column index", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["Account Code", "Account Code", "Account Name", "Account Type", "Account Nature", "Parent Account Code"],
      [["wrong", "001", "Cash", "ASSET", "DEBIT", ""]],
    )));
    const mapping = suggestChartMapping(data);
    expect(mapping.code).toBeUndefined();
    expect(mapChartWorkbook(data, { ...mapping, code: 2 })[0].code).toBe("001");
  });
  it("ignores formula/date cells in unmapped columns but rejects them if mapped", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["id", "title", "kind", "extra"],
      [["001", "Cash", "ASSET", { formula: "1+1", result: 2 }]],
    )));
    const mapping = { code: 1, name: 2, type: 3, parentCode: null, nature: null };
    expect(mapChartWorkbook(data, mapping)).toHaveLength(1);
    expect(() => mapChartWorkbook(data, { ...mapping, notes: 4 })).toThrow("الصيغ غير مسموحة");
  });
  it("preserves row numbers after ignoring rows with only unmapped data", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["id", "title", "kind", "extra"],
      [["", "", "", "ignored"], ["001", "Cash", "ASSET", ""]],
    )));
    expect(mapChartWorkbook(data, { code: 1, name: 2, type: 3, parentCode: null, nature: null })[0].rowNumber).toBe(3);
  });
  it("uses credit defaults only by explicit choice and preserves invalid/blank mapped natures", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["id", "title", "kind", "nature"],
      [["R", "Revenue", "إيرادات", ""], ["X", "Unknown", "bad-type", "invalid"]],
    )));
    const mapping = { code: 1, name: 2, type: 3, parentCode: null };
    expect(mapChartWorkbook(data, { ...mapping, nature: null }).map((r) => r.nature)).toEqual(["CREDIT", ""]);
    expect(mapChartWorkbook(data, { ...mapping, nature: 4 }).map((r) => r.nature)).toEqual(["", "INVALID"]);
  });
});

describe("Automatic chart import", () => {
  it("prepares the Qoyod layout for preview without any manual selection", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["الرمز", "الاسم بالعربية", "الاسم بالإنجليزية", "المستوى", "رمز الحساب الرئيسي", "نوع الحساب", "الوصف", "يقبل الدفع والتحصيل"],
      [["1", "الأصول", "Assets", 1, "", "أصول", "", "لا"],
        ["0010", "النقدية", "Cash", 3, "1", "أصول", "", "نعم"]],
    )));
    const mapping = automaticChartMapping(data);
    expect(mapping).toEqual({ code: 1, nameAr: 2, nameEn: 3, parentCode: 5, type: 6, notes: 7, nature: null });
    expect(chartMappingErrors(data, mapping)).toEqual([]);
    expect(mapChartWorkbook(data, mapping)[1]).toMatchObject({ code: "0010", parentCode: "1", nature: "DEBIT" });
    expect(new Set(Object.values(mapping).filter((value) => typeof value === "number")).size).toBe(6);
  });
  it("uses visible type defaults for all five types in a clearly flat file", async () => {
    const types = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["Account Code", "Account Name", "Account Type"], types.map((type) => [type, type, type]),
    )));
    const mapping = automaticChartMapping(data);
    expect(chartMappingErrors(data, mapping)).toEqual([]);
    expect(mapping.parentCode).toBeNull();
    expect(mapChartWorkbook(data, mapping).map((row) => row.nature)).toEqual(["DEBIT", "CREDIT", "CREDIT", "CREDIT", "DEBIT"]);
    expect(chartImportNotices(data, mapping, []).join(" ")).toContain("راجع الحسابات العكسية");
  });
  it("normalizes Arabic variants, diacritics and invisible direction markers", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["\u200fالرَّمز", "الإسْم بالعربيّة", "الاسم الإنْجليزي", "كود الحساب الرئيسي", "نوع الحساب"],
      [["a", "الأصول", "Assets", "", "أصول"]],
    )));
    const mapping = automaticChartMapping(data);
    expect(chartMappingErrors(data, mapping)).toEqual([]);
    expect(mapping).toMatchObject({ code: 1, nameAr: 2, nameEn: 3, parentCode: 4, type: 5 });
  });
  it("does not replace an ambiguous nature or parent heading with defaults", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["Account Code", "Account Name", "Account Type", "Parent Account Code", "parentCode", "Account Nature", "nature"],
      [["a", "Cash", "ASSET", "", "", "DEBIT", "CREDIT"]],
    )));
    const mapping = automaticChartMapping(data);
    expect(mapping.parentCode).toBeUndefined();
    expect(mapping.nature).toBeUndefined();
    expect(chartMappingErrors(data, mapping)).toHaveLength(2);
  });
  it("does not invent or flatten parents when an unidentified column may contain them", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["Account Code", "Account Name", "Account Type", "custom hierarchy"],
      [["0010", "Cash", "ASSET", "001"]],
    )));
    const mapping = automaticChartMapping(data);
    expect(mapping.parentCode).toBeUndefined();
    expect(() => mapChartWorkbook(data, mapping)).toThrow("اختر عمود الأب");
  });
  it("does not flatten a declared multi-level file with no identifiable parent column", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["Account Code", "Account Name", "Account Type", "المستوى"],
      [["0010", "Cash", "ASSET", 3]],
    )));
    expect(automaticChartMapping(data).parentCode).toBeUndefined();
  });
  it("moves a selected name column rather than allowing duplicate assignments", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["Account Code", "Account Name", "Account Type"],
      [["a", "Cash", "ASSET"]],
    )));
    const mapping = assignChartColumn(automaticChartMapping(data), "nameAr", 2);
    expect(mapping.name).toBeUndefined();
    expect(mapping.nameAr).toBe(2);
    expect(chartMappingErrors(data, mapping)).toEqual([]);
    expect(mapChartWorkbook(data, mapping)[0]).toMatchObject({ nameAr: "Cash" });
    expect(assignChartColumn(mapping, "nameAr", null)).toMatchObject({ nameAr: null, code: 1 });
  });
  it("keeps explicit blank and invalid natures for server validation rather than guessing", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["Account Code", "Account Name", "Account Type", "Account Nature"],
      [["a", "Cash", "ASSET", ""], ["b", "Other", "ASSET", "invalid"]],
    )));
    const mapping = automaticChartMapping(data);
    expect(mapping.nature).toBe(4);
    expect(mapChartWorkbook(data, mapping).map((row) => row.nature)).toEqual(["", "INVALID"]);
  });
  it("warns about inconsistent source levels without rewriting the parent relationship", async () => {
    const data = await inspectChartWorkbook(await buffer(workbook(
      ["Account Code", "Account Name", "Account Type", "Parent Account Code", "المستوى"],
      [["1", "Assets", "ASSET", "", 1], ["1000", "Cash", "ASSET", "1", 3]],
    )));
    const mapping = automaticChartMapping(data);
    const notices = chartImportNotices(data, mapping, [{ rowNumber: 2, level: 1 }, { rowNumber: 3, level: 2 }]);
    expect(notices.join(" ")).toContain("يوجد 1 حسابًا");
    expect(mapChartWorkbook(data, mapping)[1].parentCode).toBe("1");
    expect(chartImportNotices(data, mapping, []).join(" ")).not.toContain("يختلف مستوى");
  });
});
