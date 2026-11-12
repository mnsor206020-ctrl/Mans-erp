import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { createChartTemplate, parseChartWorkbook } from "@/lib/chart-excel";

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
