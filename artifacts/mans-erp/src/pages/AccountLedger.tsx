import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import {
  useListChartOfAccounts,
  useGetAccountLedger,
} from "@workspace/api-client-react";
import type { AccountLedger, AccountLedgerLine } from "@workspace/api-client-react";

// Backend returns additional computed fields not yet in the generated type
type AccountLedgerFull = AccountLedger & {
  beginningBalance: number;
  totalDebit:       number;
  totalCredit:      number;
  endingBalance:    number;
};
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookText, RefreshCw, FileDown } from "lucide-react";
import { buildCsv, downloadCsv, generateFilename } from "@/lib/csv";

function formatAmount(n: number): string {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function balanceClass(n: number): string {
  if (n > 0) return "text-foreground";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export default function AccountLedger() {
  const { t, lang } = useLanguage();

  const [accountId, setAccountId] = useState("");
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");
  const [loadParams, setLoadParams] = useState<{
    accountId: string;
    from:      string;
    to:        string;
  } | null>(null);

  const { data: accountsPage, isLoading: accsLoading } = useListChartOfAccounts({
    pageSize:        500,
    isGroup:         false,
    isActive:        true,
  });
  const accounts = accountsPage?.data ?? [];

  const { data: ledgerRaw, isLoading: ledgerLoading, error: ledgerError, refetch } = useGetAccountLedger(
    loadParams ?? { accountId: "", from: "", to: "" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!loadParams } as any },
  );
  const ledger = ledgerRaw as AccountLedgerFull | undefined;

  function handleLoad() {
    if (!accountId || !from || !to) return;
    setLoadParams({ accountId, from, to });
  }

  function handleExport() {
    if (!ledger) return;
    const headers = [
      t("reports.accountLedger.date"),
      t("reports.accountLedger.journalNumber"),
      t("reports.accountLedger.reference"),
      t("reports.accountLedger.description"),
      t("reports.accountLedger.debit"),
      t("reports.accountLedger.credit"),
      t("reports.accountLedger.balance"),
    ];
    const rows = ledger.lines.map((line: AccountLedgerLine) => [
      line.entryDate,
      line.journalNumber,
      line.reference ?? "",
      lang === "ar"
        ? (line.descriptionAr ?? line.descriptionEn ?? "")
        : (line.descriptionEn ?? line.descriptionAr ?? ""),
      line.debit > 0 ? line.debit : "",
      line.credit > 0 ? line.credit : "",
      line.runningBalance,
    ]);
    downloadCsv(generateFilename("account-ledger"), buildCsv(headers, rows));
  }

  const canLoad = !!accountId && !!from && !!to && !accsLoading;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("reports.accountLedger.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("reports.accountLedger.subtitle")}</p>
        </div>
        {loadParams && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 me-2" />
              {t("common.refresh")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!ledger}>
              <FileDown className="w-4 h-4 me-2" />
              {t("common.exportCsv")}
            </Button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Account picker */}
            <div className="flex-1 min-w-64">
              <Label className="mb-2 block text-sm font-medium">
                {t("reports.accountLedger.account")}
              </Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("reports.accountLedger.selectAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.code} – {lang === "ar" ? acc.nameAr : acc.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* From date */}
            <div className="flex-1 min-w-40">
              <Label className="mb-2 block text-sm font-medium">
                {t("reports.accountLedger.from")}
              </Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>

            {/* To date */}
            <div className="flex-1 min-w-40">
              <Label className="mb-2 block text-sm font-medium">
                {t("reports.accountLedger.to")}
              </Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <Button onClick={handleLoad} disabled={!canLoad}>
              <BookText className="w-4 h-4 me-2" />
              {t("reports.accountLedger.loadReport")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ledger table */}
      {!loadParams ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BookText className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>{t("reports.accountLedger.selectFilters")}</p>
          </CardContent>
        </Card>
      ) : ledgerLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : ledgerError ? (
        <Card>
          <CardContent role="alert" className="py-8 text-destructive">
            {ledgerError.message || t("common.error")}
          </CardContent>
        </Card>
      ) : ledger ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {ledger.accountCode} – {lang === "ar" ? ledger.accountNameAr : ledger.accountNameEn}
            </CardTitle>
            <CardDescription>
              {ledger.from} → {ledger.to}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-y">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground w-32">
                      {t("reports.accountLedger.journalNumber")}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground w-28">
                      {t("reports.accountLedger.date")}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                      {t("reports.accountLedger.description")}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground w-32">
                      {t("reports.accountLedger.reference")}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground w-36">
                      {t("reports.accountLedger.debit")}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground w-36">
                      {t("reports.accountLedger.credit")}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground w-36">
                      {t("reports.accountLedger.balance")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {/* Beginning balance row */}
                  <tr className="bg-muted/30 font-medium">
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">—</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{ledger.from}</td>
                    <td className="px-4 py-3 text-muted-foreground italic" colSpan={2}>
                      {t("reports.accountLedger.beginningBalance")}
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className={`px-4 py-3 text-end font-mono tabular-nums ${balanceClass(ledger.beginningBalance)}`}>
                      {formatAmount(ledger.beginningBalance)}
                    </td>
                  </tr>
                  {ledger.lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        {t("reports.accountLedger.empty")}
                      </td>
                    </tr>
                  ) : (
                    ledger.lines.map((line: AccountLedgerLine, idx: number) => (
                      <tr key={`${line.journalEntryId}-${idx}`} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {line.journalNumber}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {line.entryDate}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {lang === "ar"
                            ? (line.descriptionAr ?? line.descriptionEn ?? "—")
                            : (line.descriptionEn ?? line.descriptionAr ?? "—")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {line.reference ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums">
                          {line.debit > 0 ? formatAmount(line.debit) : ""}
                        </td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums">
                          {line.credit > 0 ? formatAmount(line.credit) : ""}
                        </td>
                        <td className={`px-4 py-3 text-end font-mono tabular-nums font-medium ${balanceClass(line.runningBalance)}`}>
                          {formatAmount(line.runningBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t-2 bg-muted/50">
                  <tr className="font-semibold">
                    <td className="px-4 py-3" colSpan={4}>{t("reports.accountLedger.totals")}</td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums">{formatAmount(ledger.totalDebit)}</td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums">{formatAmount(ledger.totalCredit)}</td>
                    <td className={`px-4 py-3 text-end font-mono tabular-nums ${balanceClass(ledger.endingBalance)}`}>
                      {formatAmount(ledger.endingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
