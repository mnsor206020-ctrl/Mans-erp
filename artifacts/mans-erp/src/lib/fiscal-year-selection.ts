export interface DatedFiscalYear {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  nameAr?: string;
  nameEn: string;
}

/** Creation resolves by date; edits validate the explicitly linked year without moving it. */
export function journalFiscalYearState<T extends DatedFiscalYear>(
  years: T[], date: string, linkedId?: string,
): { year?: T; error: string } {
  const parsed = new Date(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date) return { error: "أدخل تاريخ قيد صالحًا." };
  const covers = (y: T) => date >= y.startDate.slice(0, 10) && date <= y.endDate.slice(0, 10);
  const matches = linkedId === undefined ? years.filter(covers) : years.filter(y => y.id === linkedId);
  if (!matches.length) return { error: linkedId === undefined
    ? "لا توجد سنة مالية تغطي تاريخ القيد؛ لا يمكن الحفظ." : "السنة المالية المرتبطة بالقيد غير متاحة." };
  if (matches.length > 1) return { error: "توجد أكثر من سنة مالية تطابق تاريخ القيد؛ راجع إعدادات السنوات المالية." };
  const year = matches[0]!;
  if (year.status !== "OPEN") return { year, error: "السنة المالية التي تغطي تاريخ القيد مقفلة؛ لا يمكن الحفظ." };
  if (!covers(year)) return { year, error: "تاريخ القيد خارج السنة المالية المرتبطة به؛ لن يُنقل القيد تلقائيًا." };
  return { year, error: "" };
}
