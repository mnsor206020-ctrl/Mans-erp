import { useState, useEffect, useMemo, useId } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronLeft,
  Plus,
  Trash2,
  ChevronsUpDown,
  Check,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface LineState {
  _key: string;
  accountId: string;
  accountLabel: string;
  costCenterId: string;
  lineNumber: number;
  descriptionEn: string;
  descriptionAr: string;
  debit: string;
  credit: string;
  reference: string;
}

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

// Account picker combobox
function AccountPicker({
  value,
  onChange,
  accounts,
  placeholder,
}: {
  value: string;
  onChange: (id: string, label: string) => void;
  accounts: any[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const { lang } = useLanguage();
  const selected = accounts.find((a) => a.id === value);
  const selectedLabel = selected
    ? `${selected.code} — ${lang === "ar" ? (selected.nameAr || selected.nameEn) : (selected.nameEn || selected.nameAr)}`
    : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 font-normal text-start truncate"
        >
          {selectedLabel ? (
            <span className="truncate text-xs">{selectedLabel}</span>
          ) : (
            <span className="text-muted-foreground text-xs">{placeholder}</span>
          )}
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by code or name..." />
          <CommandList>
            <CommandEmpty>No accounts found</CommandEmpty>
            <CommandGroup>
              {accounts.map((account) => {
                const label = `${account.code} — ${lang === "ar" ? (account.nameAr || account.nameEn) : (account.nameEn || account.nameAr)}`;
                return (
                  <CommandItem
                    key={account.id}
                    value={`${account.code} ${account.nameEn} ${account.nameAr}`}
                    onSelect={() => {
                      onChange(account.id, label);
                      setOpen(false);
                    }}
                  >
                    <Check className={`me-2 h-4 w-4 ${value === account.id ? "opacity-100" : "opacity-0"}`} />
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-muted-foreground me-1">{account.code}</span>
                      <span className="text-sm">{lang === "ar" ? (account.nameAr || account.nameEn) : (account.nameEn || account.nameAr)}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  params?: { id: string };
}

export default function JournalEntryForm({ params }: Props) {
  const isEdit = !!params?.id;
  const { t, lang } = useLanguage();
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

  // Lines state
  const [lines, setLines] = useState<LineState[]>([newLine(1), newLine(2)]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch supporting data
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

  // Load existing entry for edit mode
  const { data: existingEntry } = useGetJournalEntry(
    params?.id ?? "",
    { query: { enabled: isEdit } } as any
  );

  useEffect(() => {
    if (!isEdit || !existingEntry) return;
    const e = existingEntry as any;
    if (!["DRAFT", "UNDER_REVIEW"].includes(e.status)) {
      toast({ title: "Not editable", description: `A ${e.status} entry cannot be edited.`, variant: "destructive" });
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
    if (e.lines?.length > 0) {
      setLines(e.lines.map((l: any) => ({
        _key: l.id,
        accountId: l.accountId,
        accountLabel: l.account ? `${l.account.code} — ${l.account.nameEn}` : l.accountId,
        costCenterId: l.costCenterId || "",
        lineNumber: l.lineNumber,
        descriptionEn: l.descriptionEn || "",
        descriptionAr: l.descriptionAr || "",
        debit: l.debit > 0 ? String(l.debit) : "",
        credit: l.credit > 0 ? String(l.credit) : "",
        reference: l.reference || "",
      })));
    }
  }, [existingEntry, isEdit]);

  // Auto-select first open fiscal year
  useEffect(() => {
    if (!fiscalYearId && fiscalYears.length > 0) {
      const def = fiscalYears.find((f: any) => f.isDefault) || fiscalYears[0];
      if (def) setFiscalYearId(def.id);
    }
  }, [fiscalYears, fiscalYearId]);

  // Balance calculation
  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.01 && (totalDebit > 0 || totalCredit > 0);

  const addLine = () => {
    setLines((prev) => [...prev, newLine(prev.length + 1)]);
  };

  const removeLine = (key: string) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l._key !== key).map((l, i) => ({ ...l, lineNumber: i + 1 })));
  };

  const updateLine = (key: string, field: keyof LineState, value: string) => {
    setLines((prev) => prev.map((l) => l._key === key ? { ...l, [field]: value } : l));
  };

  const setLineAccount = (key: string, accountId: string, accountLabel: string) => {
    setLines((prev) => prev.map((l) => l._key === key ? { ...l, accountId, accountLabel } : l));
  };

  const buildPayload = () => ({
    fiscalYearId,
    entryDate,
    type: type as any,
    currencyCode,
    exchangeRate: parseFloat(exchangeRate) || 1,
    descriptionEn: descriptionEn || undefined,
    descriptionAr: descriptionAr || undefined,
    reference: reference || undefined,
    lines: lines.map((l, i) => ({
      accountId:    l.accountId,
      costCenterId: l.costCenterId || null,
      lineNumber:   i + 1,
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
        toast({ title: "Error", description: err?.response?.data?.error || "Failed to save", variant: "destructive" });
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
        toast({ title: "Error", description: err?.response?.data?.error || "Failed to update", variant: "destructive" });
      },
    },
  });

  const handleSubmit = () => {
    if (!fiscalYearId) { toast({ title: "Validation", description: "Please select a fiscal year.", variant: "destructive" }); return; }
    if (!entryDate)    { toast({ title: "Validation", description: "Please enter a date.", variant: "destructive" }); return; }
    const emptyAccounts = lines.filter((l) => !l.accountId);
    if (emptyAccounts.length > 0) { toast({ title: "Validation", description: "All lines must have an account.", variant: "destructive" }); return; }
    const payload = buildPayload();
    if (isEdit) {
      updateMutation.mutate({ id: params!.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const formatNum = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
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
          {isEdit && existingEntry && <p className="text-sm text-muted-foreground font-mono">{(existingEntry as any).number}</p>}
        </div>
      </div>

      {/* Header Form */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Entry Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="entryDate">{t("je.date")} *</Label>
              <Input id="entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
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
              <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>

            <div className="col-span-2 md:col-span-2 space-y-1.5">
              <Label htmlFor="descEn">{t("je.descriptionEn")}</Label>
              <Input id="descEn" value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} placeholder="Description in English" />
            </div>

            <div className="col-span-2 md:col-span-2 space-y-1.5">
              <Label htmlFor="descAr">{t("je.descriptionAr")}</Label>
              <Input id="descAr" value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)} placeholder="الوصف بالعربية" dir="rtl" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{t("je.lines")}</CardTitle>
            <Button variant="outline" size="sm" className="gap-2" onClick={addLine}>
              <Plus className="w-4 h-4" />
              {t("je.addLine")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-start font-semibold py-2.5 px-3 w-8">#</th>
                  <th className="text-start font-semibold py-2.5 px-3 min-w-[220px]">{t("je.account")} *</th>
                  <th className="text-start font-semibold py-2.5 px-3 min-w-[160px]">{t("je.description")}</th>
                  <th className="text-start font-semibold py-2.5 px-3 min-w-[140px]">{t("je.costCenter")}</th>
                  <th className="text-end font-semibold py-2.5 px-3 min-w-[120px]">{t("je.debit")}</th>
                  <th className="text-end font-semibold py-2.5 px-3 min-w-[120px]">{t("je.credit")}</th>
                  <th className="py-2.5 px-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line._key} className="border-b">
                    <td className="py-2 px-3 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="py-2 px-3">
                      <AccountPicker
                        value={line.accountId}
                        onChange={(id, label) => setLineAccount(line._key, id, label)}
                        accounts={leafAccounts}
                        placeholder={t("je.selectAccount")}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        value={line.descriptionEn}
                        onChange={(e) => updateLine(line._key, "descriptionEn", e.target.value)}
                        placeholder="Description"
                        className="h-9 text-xs"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <Select
                        value={line.costCenterId || "_none"}
                        onValueChange={(v) => updateLine(line._key, "costCenterId", v === "_none" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          {costCenters.map((cc: any) => (
                            <SelectItem key={cc.id} value={cc.id}>
                              {cc.code} — {lang === "ar" ? (cc.nameAr || cc.nameEn) : (cc.nameEn || cc.nameAr)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.debit}
                        onChange={(e) => {
                          updateLine(line._key, "debit", e.target.value);
                          if (e.target.value) updateLine(line._key, "credit", "");
                        }}
                        placeholder="0.00"
                        className="h-9 text-end font-mono text-xs text-emerald-700"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.credit}
                        onChange={(e) => {
                          updateLine(line._key, "credit", e.target.value);
                          if (e.target.value) updateLine(line._key, "debit", "");
                        }}
                        placeholder="0.00"
                        className="h-9 text-end font-mono text-xs text-blue-700"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLine(line._key)}
                        disabled={lines.length <= 2}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totals + Balance */}
              <tfoot>
                <tr className="border-t-2 bg-muted/20">
                  <td colSpan={4} className="py-3 px-3"></td>
                  <td className="py-3 px-3 text-end font-mono font-semibold text-emerald-700">
                    {formatNum(totalDebit)}
                  </td>
                  <td className="py-3 px-3 text-end font-mono font-semibold text-blue-700">
                    {formatNum(totalCredit)}
                  </td>
                  <td className="py-3 px-3"></td>
                </tr>
                <tr>
                  <td colSpan={7} className="px-3 py-2">
                    <div className={`flex items-center gap-2 text-sm font-medium rounded-md px-3 py-2 ${
                      isBalanced
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : totalDebit === 0 && totalCredit === 0
                          ? "bg-muted text-muted-foreground border border-border"
                          : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {isBalanced ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      )}
                      {isBalanced ? t("je.balanced") : (
                        totalDebit === 0 && totalCredit === 0
                          ? "Enter amounts to begin"
                          : `${t("je.unbalanced")} — difference: ${formatNum(diff)}`
                      )}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

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
