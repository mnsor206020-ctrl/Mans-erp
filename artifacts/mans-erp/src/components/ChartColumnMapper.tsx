import { CHART_IMPORT_FIELDS, assignChartColumn, chartMappingErrors, type ChartWorkbookData, type ChartColumnMapping } from "@/lib/chart-column-mapping";

export function ChartColumnMapper({ data, mapping, onChange, disabled }: {
  data: ChartWorkbookData;
  mapping: ChartColumnMapping;
  onChange: (mapping: ChartColumnMapping) => void;
  disabled: boolean;
}) {
  const errors = chartMappingErrors(data, mapping);
  return (
    <section className="space-y-3 border rounded-md p-3" aria-label="مطابقة أعمدة Excel">
      <h3 className="font-semibold">مطابقة الأعمدة — {data.sheetName}</h3>
      <p className="text-sm text-muted-foreground">
        طابقنا العناوين المعروفة تلقائيًا. عدّل فقط عند الحاجة؛ الأعمدة غير المحددة تُتجاهل.
        اختيار عمود مستخدم ينقله إلى الحقل الجديد بدل تكراره.
        يكفي اسم عام أو أحد الاسمين، وسيُستخدم الاسم المتوفر للغة الناقصة.
        المستوى والتجميع يُحسبان من الأب، ولا يُستنتجان من الأكواد أو أعمدة المستوى والدفع والتحصيل.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CHART_IMPORT_FIELDS.map((field) => {
          const col = mapping[field.key];
          const selected = data.columns.find((c) => c.index === col);
          const special = field.key === "parentCode" ? "لا يوجد أب — جميع الحسابات رئيسية"
            : field.key === "nature" ? "استخدام الطبيعة الافتراضية حسب النوع" : "عدم استخدام هذا الحقل";
          return (
            <label key={field.key} className="text-sm space-y-1 min-w-0">
              <span className="font-medium">{field.label}</span>
              <select aria-label={`عمود ${field.label}`} disabled={disabled}
                className="w-full min-w-0 rounded-md border bg-background p-2"
                value={col === undefined ? "__unset__" : col === null ? "__none__" : String(col)}
                onChange={(event) => onChange(assignChartColumn(mapping, field.key, event.target.value === "__none__" ? null
                  : event.target.value === "__unset__" ? undefined : Number(event.target.value)))}>
                <option value="__unset__">اختر عمودًا</option>
                {!["code", "type"].includes(field.key) && <option value="__none__">{special}</option>}
                {data.columns.map((column) => <option key={column.index} value={column.index}>{column.index} — {column.label}</option>)}
              </select>
              {selected && <span className="block text-xs text-muted-foreground break-words">عينة: {selected.samples.filter(Boolean).join(" / ") || "(فارغ)"}</span>}
            </label>
          );
        })}
      </div>
      {mapping.nature === null && <p className="text-sm bg-muted p-2 rounded">
        الطبيعة التلقائية: الأصول والمصروفات مدين؛ الالتزامات وحقوق الملكية والإيرادات دائن.
        راجع الحسابات العكسية؛ إذا اختلفت طبيعتها أضف عمود الطبيعة في الملف وطابقه بدل هذا الخيار.
      </p>}
      {errors.length > 0 && <ul className="text-sm text-destructive list-disc ps-5" role="alert">
        {errors.map((error, i) => <li key={i}>{error}</li>)}
      </ul>}
    </section>
  );
}
