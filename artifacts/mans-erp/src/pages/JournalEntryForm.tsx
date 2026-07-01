import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateJournalEntry,
  useGetJournalEntry,
  useUpdateJournalEntry,
  useListFiscalYears,
  useListCostCenters,
  useListChartOfAccounts,
  getListJournalEntriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";
import {
  JournalLinesTable,
  type LineState,
} from "@/components/journal-entries/JournalLinesTable";
import { AttachmentsPanel } from "@/components/journal-entries/AttachmentsPanel";
import {
  SourceTrackingFields,
  type SourceTrackingValues,
} from "@/components/journal-entries/SourceTrackingFields";

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
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Header state
  const [fiscalYearId, setFiscalYearId] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [type, setType] = useState("MANUAL");
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [reference, setReference] = useState("");

  // Source tracking
  const [sourceTracking, setSourceTracking] = useState<SourceTrackingValues>({
    sourceType: "",
    sourceReference: "",
    sourceModuleUrl: "",
  });

  // Lines state — initialised with 2 blank lines to satisfy the min-2 rule
  const [lines, setLines] = useState<LineState[]>([newLine(1), newLine(2)]);
  const [submitting, setSubmitting] = useState(false);

  // Supporting data
  const { data: fiscalYearsRaw } = useListFiscalYears({ status: "OPEN" });
  const fiscalYears = (fiscalYearsRaw as any) ?? [];

  const { data: costCentersRaw } = useListCostCenters({ isActive: "true" });
  const costCenters = (costCentersRaw as any) ?? [];

  const { data: accountsRaw } = useListChartOfAccounts({ pageSize: "500" } as any);
  const allAccounts = (accountsRaw as any)?.data ?? [];
  const leafAccounts = useMemo(
    () => allAccounts.filter((a: any) => !a.isGroup && a.isActive && a.allowDirectEntry),
    [allAccounts]
  );

  // Edit mode — load existing entry
  const { data: existingEntry } = useGetJournalEntry(
    params?.id ?? "",
    { query: { enabled: isEdit } } as any
  );

  useEffect(() => {
    if (!isEdit || !existingEntry) return;
    const e = existingEntry as any;
    if (!["DRAFT", "UNDER_REVIEW"].includes(e.status)) {
      toast({
        title: "Not editable",
        description: `A ${e.status} entry cannot be edited.`,
        variant: "destructive",
      });
      navigate(`/journal-entries/${e.id}`);
      return;
    }
    setFiscalYearId(e.fiscalYearId || "");
    setEntryDate(e.entryDate ? e.entryDate.split("T")[0] : new Date().toISOString().split("T")[0]);
    setType(e.type || "MANUAL");
    setCurrencyCode(e.currencyCode || "SAR");
    setExchangeRate(String(e.exchangeRate || 1));
    setDescriptionEn(e.descriptionEn || "");
    setDescriptionAr(e.descriptionAr || "");
    setReference(e.reference || "");
    setSourceTracking({
      sourceType:      e.sourceType      || "",
      sourceReference: e.sourceReference || "",
      sourceModuleUrl: e.sourceModuleUrl || "",
    });
    if (e.lines?.length > 0) {
      setLines(
        e.lines.map((l: any) => ({
          _key: l.id,
          accountId: l.accountId,
          accountLabel: l.account ? `${l.account.code} — ${l.account.nameEn}` : l.accountId,
          costCenterId: l.costCenterId || "",
          lineNumber: l.lineNumber,
          descriptionEn: l.descriptionEn || "",
          descriptionAr: l.descriptionAr || "",
          debit:  l.debit  > 0 ? String(l.debit)  : "",
          credit: l.credit > 0 ? String(l.credit) : "",
          reference: l.reference || "",
        }))
      );
    }
  }, [existingEntry, isEdit]);

  // Auto-select first open fiscal year on mount
  useEffect(() => {
    if (!fiscalYearId && fiscalYears.length > 0) {
      const def = fiscalYears.find((f: any) => f.isDefault) || fiscalYears[0];
      if (def) setFiscalYearId(def.id);
    }
  }, [fiscalYears, fiscalYearId]);

  // Balance calculations (passed as props to JournalLinesTable)
  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01 && (totalDebit > 0 || totalCredit > 0);

  // Line mutations
  const addLine = () => {
    setLines((prev) => [...prev, newLine(prev.length + 1)]);
  };

  const removeLine = (key: string) => {
    if (lines.length <= 2) return;
    setLines((prev) =>
      prev.filter((l) => l._key !== key).map((l, i) => ({ ...l, lineNumber: i + 1 }))
    );
  };

  const updateLine = (key: string, field: keyof LineState, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l._key === key ? { ...l, [field]: value } : l))
    );
  };

  const setLineAccount = (key: string, accountId: string, accountLabel: string) => {
    setLines((prev) =>
      prev.map((l) => (l._key === key ? { ...l, accountId, accountLabel } : l))
    );
  };

  const buildPayload = () => ({
    fiscalYearId,
    entryDate,
    type: type as any,
    currencyCode,
    exchangeRate: parseFloat(exchangeRate) || 1,
    descriptionEn: descriptionEn || undefined,
    descriptionAr: descriptionAr || undefined,
    reference:        reference                           || undefined,
    sourceType:       sourceTracking.sourceType           || undefined,
    sourceReference:  sourceTracking.sourceReference      || undefined,
    sourceModuleUrl:  sourceTracking.sourceModuleUrl      || undefined,
    lines: lines.map((l, i) => ({
      accountId:     l.accountId,
      costCenterId:  l.costCenterId || null,
      lineNumber:    i + 1,
      descriptionEn: l.descriptionEn || undefined,
      descriptionAr: l.descriptionAr || undefined,
      debit:         parseFloat(l.debit)  || 0,
      credit:        parseFloat(l.credit) || 0,
      reference:     l.reference || undefined,
    })),
  });

  const createMutation = useCreateJournalEntry({
    mutation: {
      onSuccess: (entry: any) => {
        toast({ title: "Draft saved", description: `${entry.number} created.` });
        queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
        navigate(`/journal-entries/${entry.id}`);
      },
      onError: (err: any) => {
        toast({
          title: "Error",
          description: err?.response?.data?.error || "Failed to save",
          variant: "destructive",
        });
      },
    },
  });

  const updateMutation = useUpdateJournalEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Saved" });
        queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
        navigate(`/journal-entries/${params!.id}`);
      },
      onError: (err: any) => {
        toast({
          title: "Error",
          description: err?.response?.data?.error || "Failed to update",
          variant: "destructive",
        });
      },
    },
  });

  const handleSubmit = () => {
    if (!fiscalYearId) {
      toast({ title: "Validation", description: "Please select a fiscal year.", variant: "destructive" });
      return;
    }
    if (!entryDate) {
      toast({ title: "Validation", description: "Please enter a date.", variant: "destructive" });
      return;
    }
    const emptyAccounts = lines.filter((l) => !l.accountId);
    if (emptyAccounts.length > 0) {
      toast({ title: "Validation", description: "All lines must have an account.", variant: "destructive" });
      return;
    }
    const payload = buildPayload();
    if (isEdit) {
      updateMutation.mutate({ id: params!.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending || submitting;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link href={isEdit ? `/journal-entries/${params?.id}` : "/journal-entries"}>
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">
            {isEdit ? t("je.edit") : t("je.new")}
          </h1>
          {isEdit && existingEntry && (
            <p className="text-sm text-muted-foreground font-mono">
              {(existingEntry as any).number}
            </p>
          )}
        </div>
      </div>

      {/* Header fields */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Entry Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="entryDate">{t("je.date")} *</Label>
              <Input
                id="entryDate"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("je.fiscalYear")} *</Label>
              <Select value={fiscalYearId} onValueChange={setFiscalYearId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("je.selectFiscalYear")} />
                </SelectTrigger>
                <SelectContent>
                  {fiscalYears.length === 0 ? (
                    <SelectItem value="_none" disabled>No open fiscal years</SelectItem>
                  ) : (
                    fiscalYears.map((fy: any) => (
                      <SelectItem key={fy.id} value={fy.id}>
                        {fy.nameEn} {fy.isDefault ? "★" : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("je.type")}</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">{t("je.type.MANUAL")}</SelectItem>
                  <SelectItem value="ADJUSTMENT">{t("je.type.ADJUSTMENT")}</SelectItem>
                  <SelectItem value="OPENING">{t("je.type.OPENING")}</SelectItem>
                  <SelectItem value="CLOSING">{t("je.type.CLOSING")}</SelectItem>
                  <SelectItem value="AUTOMATIC">{t("je.type.AUTOMATIC")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("je.currency")}</Label>
              <Select value={currencyCode} onValueChange={setCurrencyCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAR">SAR — Saudi Riyal</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                  <SelectItem value="KWD">KWD — Kuwaiti Dinar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currencyCode !== "SAR" && (
              <div className="space-y-1.5">
                <Label htmlFor="exchangeRate">{t("je.exchangeRate")}</Label>
                <Input
                  id="exchangeRate"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reference">{t("je.reference")}</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="col-span-2 md:col-span-2 space-y-1.5">
              <Label htmlFor="descEn">{t("je.descriptionEn")}</Label>
              <Input
                id="descEn"
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                placeholder="Description in English"
              />
            </div>

            <div className="col-span-2 md:col-span-2 space-y-1.5">
              <Label htmlFor="descAr">{t("je.descriptionAr")}</Label>
              <Input
                id="descAr"
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                placeholder="الوصف بالعربية"
                dir="rtl"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Source Tracking (optional, collapsible) */}
      <SourceTrackingFields
        value={sourceTracking}
        onChange={setSourceTracking}
        disabled={isBusy}
      />

      {/* Lines table — extracted reusable component */}
      <JournalLinesTable
        lines={lines}
        accounts={leafAccounts}
        costCenters={costCenters}
        totalDebit={totalDebit}
        totalCredit={totalCredit}
        isBalanced={isBalanced}
        onAddLine={addLine}
        onRemoveLine={removeLine}
        onUpdateLine={updateLine}
        onSetLineAccount={setLineAccount}
      />

      {/* Attachments — only available on an existing (saved) entry */}
      {isEdit && params?.id && (
        <AttachmentsPanel journalEntryId={params.id} mode="upload" />
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Link href={isEdit ? `/journal-entries/${params?.id}` : "/journal-entries"}>
          <Button variant="outline" className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            {t("common.cancel")}
          </Button>
        </Link>
        <Button
          onClick={handleSubmit}
          disabled={isBusy || !fiscalYearId || !entryDate}
          className="gap-2 min-w-[140px]"
        >
          {isBusy ? "Saving..." : t("je.saveDraft")}
        </Button>
      </div>
    </div>
  );
}
