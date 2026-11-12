import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import {
  useImportChartOfAccounts, getGetChartOfAccountsTreeQueryKey, getListChartOfAccountsQueryKey,
  type ChartImportResult, type ChartImportRow,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createChartTemplate, parseChartWorkbook } from "@/lib/chart-excel";

export function ChartImportDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ChartImportRow[]>([]);
  const [preview, setPreview] = useState<ChartImportResult>();
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [working, setWorking] = useState(false);
  const busyRef = useRef(false);
  const mutation = useImportChartOfAccounts();
  const queryClient = useQueryClient();

  async function validate(data: ChartImportRow[], confirm = false) {
    if (new Blob([JSON.stringify({ rows: data, confirm })]).size > 2 * 1024 * 1024)
      throw new Error("بيانات الطلب تتجاوز 2 ميجابايت؛ قسّم الحسابات إلى دفعات أصغر.");
    const result = await mutation.mutateAsync({ data: { rows: data, confirm } });
    setPreview(result);
    if (result.imported > 0) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetChartOfAccountsTreeQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListChartOfAccountsQueryKey() }),
      ]);
    }
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setWorking(true);
    setError("");
    try { await action(); }
    catch (e) {
      const status = (e as { status?: number })?.status;
      setError(status === 403 ? "لا تملك صلاحية إنشاء الحسابات في هذه المنظمة."
        : status === 401 ? "انتهت جلسة الدخول. سجّل الدخول وأعد المحاولة."
        : `تعذر إكمال العملية: ${e instanceof Error ? e.message : "أعد المحاولة."}`);
    }
    finally { busyRef.current = false; setWorking(false); }
  }
  async function select(file?: File) {
    setFileName(file?.name || "");
    setRows([]);
    setPreview(undefined);
    if (!file) return;
    await run(async () => {
      if (!file.name.toLowerCase().endsWith(".xlsx"))
        throw new Error("الامتداد المدعوم هو .xlsx. احفظ ملف .xls القديم بصيغة .xlsx أولًا.");
      if (file.size > 5 * 1024 * 1024) throw new Error("حجم الملف يتجاوز 5 ميجابايت.");
      const parsed = await parseChartWorkbook(await file.arrayBuffer());
      setRows(parsed);
      await validate(parsed);
    });
  }
  async function download() {
    await run(async () => {
      const buffer = await createChartTemplate();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "chart-of-accounts-template.xlsx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return (
    <>
      <Button variant="outline" onClick={() => {
        setRows([]); setPreview(undefined); setError(""); setFileName(""); setOpen(true);
      }} data-testid="button-import-accounts"><Upload className="h-4 w-4 me-2" />استيراد من Excel</Button>
      <Dialog open={open} onOpenChange={(value) => { if (!working) setOpen(value); }}>
        <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>استيراد دليل الحسابات من Excel</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            ملفات .xlsx فقط، حتى 5 ميجابايت و2000 حساب، من الورقة الأولى. راجع البيانات قبل التأكيد.
            لن يتم حذف أو استبدال حساب موجود. الاسم الواحد يُستخدم للعربية والإنجليزية، ويمكن تخصيصهما في القالب.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" onClick={() => void download()} disabled={working}><Download className="w-4 h-4 me-2" />تنزيل القالب</Button>
            <label className="flex-1 min-w-48 text-sm">
              اختر ملف Excel
              <Input aria-label="ملف دليل الحسابات" type="file" accept=".xlsx" disabled={working}
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void select(file); }} />
            </label>
          </div>
          {fileName && <p className="text-sm break-all">الملف المحدد: <span dir="auto">{fileName}</span></p>}
          {working && <p role="status">جارٍ قراءة الملف أو التحقق والحفظ…</p>}
          {error && <p role="alert" className="text-destructive break-words">{error}</p>}
          {preview && (
            <>
              <div className="grid grid-cols-3 gap-2 text-sm bg-muted p-3 rounded-md">
                <span>الإجمالي: {preview.total}</span><span>رئيسية: {preview.mainAccounts}</span><span>فرعية: {preview.subaccounts}</span>
              </div>
              {preview.imported > 0 ? (
                <p role="status" className="font-semibold text-green-700">اكتمل الاستيراد: أُضيف {preview.imported} حسابًا. لم يُعدّل أي حساب موجود.</p>
              ) : preview.errors.length > 0 ? (
                <div role="alert" className="border border-destructive rounded-md p-3 text-sm max-h-44 overflow-auto">
                  <p className="font-semibold">لم يُحفظ أي حساب. أصلح الأخطاء التالية وأعد رفع الملف:</p>
                  <ul className="list-disc ps-5">
                    {preview.errors.map((item, i) => <li key={i}>الصف {item.rowNumber} — {item.code || "(كود فارغ)"}: {item.message}</li>)}
                  </ul>
                </div>
              ) : <p role="status" className="text-sm">جميع الصفوف صالحة. سيُعاد فحصها داخل معاملة الحفظ عند التأكيد.</p>}
              <div className="overflow-auto max-h-80 border rounded-md">
                <table className="w-full text-sm text-start">
                  <thead className="bg-muted sticky top-0"><tr>
                    {["الصف", "الكود", "اسم الحساب وتسلسله", "الاسم الإنجليزي", "الأب", "النوع", "الطبيعة", "المستوى", "الوصف"].map((label) => <th className="p-2 text-start whitespace-nowrap" key={label}>{label}</th>)}
                  </tr></thead>
                  <tbody>{preview.rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{row.rowNumber}</td><td className="p-2 font-mono" dir="ltr">{row.code}</td>
                      <td className="p-2 min-w-48" style={{ paddingInlineStart: `${Math.min(row.level - 1, 12) * 12 + 8}px` }}>
                        {row.parentCode && "↳ "}{row.nameAr}{row.isGroup && " (تجميعي)"}
                      </td>
                      <td className="p-2" dir="ltr">{row.nameEn}</td><td className="p-2">{row.parentCode || "—"}</td>
                      <td className="p-2">{row.type}</td><td className="p-2">{row.nature === "DEBIT" ? "مدين" : row.nature === "CREDIT" ? "دائن" : row.nature}</td>
                      <td className="p-2">{row.level}</td><td className="p-2 min-w-32">{row.notes}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={working} onClick={() => setOpen(false)}>إغلاق</Button>
            {!!rows.length && !preview?.imported && <Button variant="outline" disabled={working} onClick={() => void run(() => validate(rows))}>إعادة الفحص</Button>}
            <Button disabled={working || !preview?.valid || !!preview.imported} onClick={() => void run(() => validate(rows, true))}>
              تأكيد استيراد {preview?.total || 0} حساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
