import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateJournalEntry,
  useGetCurrentUser,
  useGetJournalEntry,
  useUpdateJournalEntry,
  useListFiscalYears,
  useListCostCenters,
  useListChartOfAccounts,
  getListJournalEntriesQueryKey,
  getGetJournalEntryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, AlertTriangle, RefreshCw, Save } from "lucide-react";
import { JournalLinesTable, type LineState } from "@/components/journal-entries/JournalLinesTable";
import { BalanceSummary } from "@/components/journal-entries/BalanceSummary";
import { AttachmentsPanel } from "@/components/journal-entries/AttachmentsPanel";
import {
  SourceTrackingFields,
  type SourceTrackingValues,
} from "@/components/journal-entries/SourceTrackingFields";
import {
  buildDescriptionPayload,
  computeTotals,
  getApiErrorMessage,
  initDescriptionState,
  jt,
  newDescriptionState,
  STATUS_STYLES,
  hasJournalPermission,
  type DescriptionEditorState,
} from "@/lib/journal-entry-ui";

function newLine(lineNumber: number): LineState {
  return {
    _key: `${Date.now()}_${Math.random()}`,
    accountId: "",
    accountLabel: "",
    costCenterId: "",
    lineNumber,
    descriptionEn: "",
    descriptionAr: "",
    debit: "",
    credit: "",
    reference: "",
  };
}

interface Props {
  params?: { id: string };
}

export default function JournalEntryForm({ params }: Props) {
  const isEdit = !!params?.id;
  const entryId = params?.id ?? "";
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const canSave = hasJournalPermission(currentUser, isEdit ? "update" : "create");

  const [fiscalYearId, setFiscalYearId] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [type, setType] = useState("MANUAL");
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [description, setDescription] = useState<DescriptionEditorState>(newDescriptionState);
  const [reference, setReference] = useState("");
  const [sourceTracking, setSourceTracking] = useState<SourceTrackingValues>({
    sourceType: "",
    sourceReference: "",
    sourceModuleUrl: "",
  });
  const [lines, setLines] = useState<LineState[]>([newLine(1), newLine(2)]);
  const [showErrors, setShowErrors] = useState(false);
  const initializedFor = useRef<string | null>(null);

  const { data: fiscalYearsRaw } = useListFiscalYears({ status: "OPEN" });
  const fiscalYears = (fiscalYearsRaw as any) ?? [];
  const { data: costCentersRaw } = useListCostCenters({ isActive: "true" });
  const costCenters = (costCentersRaw as any) ?? [];
  const { data: accountsRaw } = useListChartOfAccounts({ pageSize: "500" } as any);
  const leafAccounts = useMemo(
    () => ((accountsRaw as any)?.data ?? []).filter((a: any) => !a.isGroup && a.isActive && a.allowDirectEntry),
    [accountsRaw]
  );

  const entryQuery = useGetJournalEntry(entryId, {
    query: { enabled: isEdit, queryKey: getGetJournalEntryQueryKey(entryId) },
  } as any);
  const existingEntry = entryQuery.data as any;
  const loaded = !isEdit || initializedFor.current === entryId;

  useEffect(() => {
    if (!isEdit || !existingEntry || initializedFor.current === entryId) return;
    const e = existingEntry;
    if (!["DRAFT", "UNDER_REVIEW"].includes(e.status)) {
      toast({ title: jt(lang, "notEditable"), description: jt(lang, "notEditableDesc"), variant: "destructive" });
      navigate(`/journal-entries/${e.id}`);
      return;
    }
    initializedFor.current = entryId;
    setFiscalYearId(e.fiscalYearId || "");
    setEntryDate(e.entryDate ? e.entryDate.split("T")[0] : new Date().toISOString().split("T")[0]);
    setType(e.type || "MANUAL");
    setCurrencyCode(e.currencyCode || "SAR");
    setExchangeRate(String(e.exchangeRate || 1));
    setDescription(initDescriptionState(e, lang));
    setReference(e.reference || "");
    setSourceTracking({
      sourceType: e.sourceType || "",
      sourceReference: e.sourceReference || "",
      sourceModuleUrl: e.sourceModuleUrl || "",
    });
    if (e.lines?.length > 0) {
      setLines(
        e.lines.map((l: any) => ({
          _key: l.id,
          accountId: l.accountId,
          accountLabel: l.account ? `${l.account.code} — ${lang === "ar" ? l.account.nameAr || l.account.nameEn : l.account.nameEn}` : l.accountId,
          costCenterId: l.costCenterId || "",
          lineNumber: l.lineNumber,
          descriptionEn: l.descriptionEn || "",
          descriptionAr: l.descriptionAr || "",
          debit: l.debit > 0 ? String(l.debit) : "",
          credit: l.credit > 0 ? String(l.credit) : "",
          reference: l.reference || "",
        }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingEntry, isEdit, entryId]);

  useEffect(() => {
    if (!isEdit && !fiscalYearId && fiscalYears.length > 0) {
      const def = fiscalYears.find((f: any) => f.isDefault) || fiscalYears[0];
      if (def) setFiscalYearId(def.id);
    }
  }, [fiscalYears, fiscalYearId, isEdit]);

  const totals = computeTotals(lines);

  const addLine = () => setLines((prev) => [...prev, newLine(prev.length + 1)]);
  const removeLine = (key: string) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l._key !== key).map((l, i) => ({ ...l, lineNumber: i + 1 })));
  };
  const updateLine = (key: string, field: keyof LineState, value: string) =>
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, [field]: value } : l)));
  const setLineAccount = (key: string, accountId: string, accountLabel: string) =>
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, accountId, accountLabel } : l)));

  const buildPayload = () => ({
    fiscalYearId,
    entryDate,
    type: type as any,
    currencyCode,
    exchangeRate: parseFloat(exchangeRate) || 1,
    ...buildDescriptionPayload(description),
    reference: reference || undefined,
    sourceType: sourceTracking.sourceType || undefined,
    sourceReference: sourceTracking.sourceReference || undefined,
    sourceModuleUrl: sourceTracking.sourceModuleUrl || undefined,
    lines: lines.map((l, i) => ({
      accountId: l.accountId,
      costCenterId: l.costCenterId || null,
      lineNumber: i + 1,
      descriptionEn: l.descriptionEn || undefined,
      descriptionAr: l.descriptionAr || undefined,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      reference: l.reference || undefined,
    })),
  });

  const onError = (err: unknown) =>
    toast({ title: jt(lang, "error"), description: getApiErrorMessage(err, jt(lang, "saveFailed")), variant: "destructive" });

  const createMutation = useCreateJournalEntry({
    mutation: {
      onSuccess: (entry: any) => {
        toast({ title: jt(lang, "draftSaved"), description: `${entry.number}` });
        queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
        navigate(`/journal-entries/${entry.id}`);
      },
      onError,
    },
  });

  const updateMutation = useUpdateJournalEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: jt(lang, "saved") });
        queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetJournalEntryQueryKey(entryId) });
        navigate(`/journal-entries/${entryId}`);
      },
      onError,
    },
  });

  const handleSubmit = () => {
    if (!loaded || !canSave || createMutation.isPending || updateMutation.isPending) return undefined;
    setShowErrors(true);
    const fail = (d: string) => void toast({ title: jt(lang, "validation"), description: d, variant: "destructive" });
    if (!fiscalYearId) return fail(jt(lang, "needFiscalYear"));
    if (!entryDate) return fail(jt(lang, "needDate"));
    if (lines.some((l) => !l.accountId)) return fail(jt(lang, "needAccounts"));
    if (!totals.isBalanced) return fail(jt(lang, "blocking"));
    const payload = buildPayload();
    if (isEdit) updateMutation.mutate({ id: entryId, data: payload });
    else createMutation.mutate({ data: payload });
    return undefined;
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const backHref = isEdit ? `/journal-entries/${entryId}` : "/journal-entries";

  // ---- Edit-mode load states ----
  if (isEdit && entryQuery.isError) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <p className="font-semibold">{jt(lang, "loadFailed")}</p>
          <p className="text-sm text-muted-foreground">{getApiErrorMessage(entryQuery.error, "")}</p>
          <div className="flex justify-center gap-2 flex-wrap">
            <Button variant="outline" className="gap-2" onClick={() => entryQuery.refetch()} data-testid="button-retry">
              <RefreshCw className="h-4 w-4" /> {jt(lang, "retry")}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/journal-entries")}>{jt(lang, "back")}</Button>
          </div>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4" aria-busy="true" aria-label={jt(lang, "loading")}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const status = existingEntry?.status;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 pb-28 md:pb-6 overflow-x-hidden">
      {/* Title bar */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 mt-0.5" onClick={() => navigate(backHref)} aria-label={t("common.cancel")} data-testid="button-back">
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-primary">{t("je.title")}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{isEdit ? t("je.edit") : t("je.new")}</h1>
            {isEdit && existingEntry && (
              <>
                <span className="font-mono text-sm text-muted-foreground" data-testid="text-entry-number">{existingEntry.number}</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || ""}`}>
                  {t(`je.status.${status}`)}
                </span>
              </>
            )}
          </div>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={isBusy || !canSave || !fiscalYearId || !entryDate || !totals.isBalanced}
          className="hidden md:inline-flex gap-2 shrink-0"
          data-testid="button-save-header"
        >
          <Save className="h-4 w-4" />
          {isBusy ? jt(lang, "saving") : t("je.saveDraft")}
        </Button>
      </div>

      {/* Entry details */}
      <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
        <h2 className="font-semibold">{jt(lang, "entryInfo")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="entryDate">{t("je.date")} *</Label>
            <Input id="entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} data-testid="input-entry-date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">{t("je.reference")}</Label>
            <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={jt(lang, "optional")} data-testid="input-reference" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("je.fiscalYear")} *</Label>
            <Select value={fiscalYearId} onValueChange={setFiscalYearId}>
              <SelectTrigger data-testid="select-fiscal-year" className={showErrors && !fiscalYearId ? "border-destructive/60" : ""}>
                <SelectValue placeholder={t("je.selectFiscalYear")} />
              </SelectTrigger>
              <SelectContent>
                {fiscalYears.length === 0 ? (
                  <SelectItem value="_none" disabled>{jt(lang, "noFiscalYears")}</SelectItem>
                ) : (
                  fiscalYears.map((fy: any) => (
                    <SelectItem key={fy.id} value={fy.id}>
                      {lang === "ar" ? fy.nameAr || fy.nameEn : fy.nameEn}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("je.type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["MANUAL", "ADJUSTMENT", "OPENING", "CLOSING", "AUTOMATIC"].map((k) => (
                  <SelectItem key={k} value={k}>{t(`je.type.${k}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="description">{jt(lang, "description")}</Label>
              <span className="text-[11px] text-muted-foreground">{jt(lang, "descriptionHint")}</span>
            </div>
            <Textarea
              id="description"
              dir="auto"
              rows={2}
              value={description.value}
              onChange={(e) => setDescription((d) => ({ ...d, value: e.target.value }))}
              placeholder={jt(lang, "descriptionPlaceholder")}
              data-testid="input-description"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("je.currency")}</Label>
            <Select value={currencyCode} onValueChange={setCurrencyCode}>
              <SelectTrigger data-testid="select-currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAR">SAR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="AED">AED</SelectItem>
                <SelectItem value="KWD">KWD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {currencyCode !== "SAR" && (
            <div className="space-y-1.5">
              <Label htmlFor="exchangeRate">{t("je.exchangeRate")}</Label>
              <Input id="exchangeRate" type="number" step="0.0001" min="0.0001" dir="ltr" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} data-testid="input-exchange-rate" />
            </div>
          )}
        </div>
      </section>

      <SourceTrackingFields value={sourceTracking} onChange={setSourceTracking} disabled={isBusy} />

      <JournalLinesTable
        lines={lines}
        accounts={leafAccounts}
        costCenters={costCenters}
        onAddLine={addLine}
        onRemoveLine={removeLine}
        onUpdateLine={updateLine}
        onSetLineAccount={setLineAccount}
        showErrors={showErrors}
        disabled={isBusy}
      />

      <BalanceSummary
        totalDebit={totals.totalDebit}
        totalCredit={totals.totalCredit}
        currencyCode={currencyCode}
        showBlockingHint
      />

      {isEdit && <AttachmentsPanel journalEntryId={entryId} mode="upload" />}

      {/* Actions — sticky on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground px-2" data-testid="link-cancel">
            {t("common.cancel")}
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={isBusy || !canSave || !fiscalYearId || !entryDate || !totals.isBalanced}
            className="gap-2 min-w-[150px]"
            data-testid="button-save"
          >
            <Save className="h-4 w-4" />
            {isBusy ? jt(lang, "saving") : t("je.saveDraft")}
          </Button>
        </div>
      </div>
    </div>
  );
}
