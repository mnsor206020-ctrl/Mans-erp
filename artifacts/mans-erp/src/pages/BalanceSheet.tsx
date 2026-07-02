import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import {
  useListFiscalYears,
  useGetBalanceSheet,
} from "@workspace/api-client-react";
import type { BalanceSheetAccount } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Scale, RefreshCw, FileDown } from "lucide-react";
import { buildCsv, downloadCsv, generateFilename } from "@/lib/csv";

function formatAmount(n: number): string {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface SectionTableProps {
  title:    string;
  accounts: BalanceSheetAccount[];
  total:    number;
  totalLabel: string;
  emptyLabel: string;
  accountCodeLabel: string;
  accountNameLabel: string;
  balanceLabel: string;
  lang: string;
}

function SectionTable({
  title, accounts, total, totalLabel, emptyLabel,
  accountCodeLabel, accountNameLabel, balanceLabel, lang,
}: SectionTableProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold px-1">{title}</h3>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-4 py-2.5 text-start font-medium text-muted-foreground w-28">
                {accountCodeLabel}
              </th>
              <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                {accountNameLabel}
              </th>
              <th className="px-4 py-2.5 text-end font-medium text-muted-foreground w-40">
                {balanceLabel}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground text-xs">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              accounts.map((acc: BalanceSheetAccount) => (
                <tr key={acc.accountId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {acc.accountCode}
                  </td>
                  <td className="px-4 py-2.5">
                    {lang === "ar" ? acc.accountNameAr : acc.accountNameEn}
                  </td>
                  <td className="px-4 py-2.5 text-end font-mono tabular-nums">
                    {formatAmount(acc.balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t bg-muted/30">
            <tr>
              <td colSpan={2} className="px-4 py-2.5 font-semibold text-sm">
                {totalLabel}
              </td>
              <td className="px-4 py-2.5 text-end font-mono tabular-nums font-semibold">
                {formatAmount(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function BalanceSheet() {
  const { t, lang } = useLanguage();

  const [fiscalYearId, setFiscalYearId] = useState("");
  const [asOf, setAsOf]                 = useState("");
  const [loadParams, setLoadParams]     = useState<{
    fiscalYearId: string;
    asOf:         string;
  } | null>(null);

  const { data: fiscalYears, isLoading: fyLoading } = useListFiscalYears();

  const { data: report, isLoading: reportLoading, refetch } = useGetBalanceSheet(
    loadParams ?? { fiscalYearId: "", asOf: "" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!loadParams } as any },
  );

  function handleLoad() {
    if (!fiscalYearId || !asOf) return;
    setLoadParams({ fiscalYearId, asOf });
  }

  function handleExport() {
    if (!report) return;
    const headers = [
      t("reports.balanceSheet.section"),
      t("reports.balanceSheet.accountCode"),
      t("reports.balanceSheet.accountName"),
      t("reports.balanceSheet.balance"),
    ];
    const toRows = (accounts: BalanceSheetAccount[], sectionLabel: string) =>
      accounts.map((acc) => [
        sectionLabel,
        acc.accountCode,
        lang === "ar" ? acc.accountNameAr : acc.accountNameEn,
        acc.balance,
      ]);
    const rows = [
      ...toRows(report.assets,      t("reports.balanceSheet.assets")),
      ...toRows(report.liabilities, t("reports.balanceSheet.liabilities")),
      ...toRows(report.equity,      t("reports.balanceSheet.equity")),
    ];
    downloadCsv(generateFilename("balance-sheet"), buildCsv(headers, rows));
  }

  const canLoad = !!fiscalYearId && !!asOf && !fyLoading;

  const commonSectionProps = {
    emptyLabel:       t("reports.balanceSheet.empty"),
    accountCodeLabel: t("reports.balanceSheet.accountCode"),
    accountNameLabel: t("reports.balanceSheet.accountName"),
    balanceLabel:     t("reports.balanceSheet.balance"),
    lang,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("reports.balanceSheet.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("reports.balanceSheet.subtitle")}</p>
        </div>
        {loadParams && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 me-2" />
              {t("common.refresh")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!report}>
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
            <div className="flex-1 min-w-48">
              <Label className="mb-2 block text-sm font-medium">
                {t("reports.balanceSheet.fiscalYear")}
              </Label>
              <Select value={fiscalYearId} onValueChange={setFiscalYearId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("je.selectFiscalYear")} />
                </SelectTrigger>
                <SelectContent>
                  {(fiscalYears ?? []).map((fy) => (
                    <SelectItem key={fy.id} value={fy.id}>
                      {lang === "ar" ? fy.nameAr : fy.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-40">
              <Label className="mb-2 block text-sm font-medium">
                {t("reports.balanceSheet.asOf")}
              </Label>
              <Input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>

            <Button onClick={handleLoad} disabled={!canLoad}>
              <Scale className="w-4 h-4 me-2" />
              {t("reports.balanceSheet.loadReport")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report */}
      {!loadParams ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Scale className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>{t("reports.balanceSheet.selectFilters")}</p>
          </CardContent>
        </Card>
      ) : reportLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(12)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : report ? (
        <div className="space-y-6">
          {/* Assets */}
          <SectionTable
            {...commonSectionProps}
            title={t("reports.balanceSheet.assets")}
            accounts={report.assets}
            total={report.totalAssets}
            totalLabel={t("reports.balanceSheet.totalAssets")}
          />

          {/* Liabilities */}
          <SectionTable
            {...commonSectionProps}
            title={t("reports.balanceSheet.liabilities")}
            accounts={report.liabilities}
            total={report.totalLiabilities}
            totalLabel={t("reports.balanceSheet.totalLiabilities")}
          />

          {/* Equity */}
          <SectionTable
            {...commonSectionProps}
            title={t("reports.balanceSheet.equity")}
            accounts={report.equity}
            total={report.totalEquity}
            totalLabel={t("reports.balanceSheet.totalEquity")}
          />

          {/* Accounting equation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {t("reports.balanceSheet.equation")}
                </CardTitle>
                <Badge variant={report.isBalanced ? "default" : "destructive"}>
                  {report.isBalanced
                    ? t("reports.balanceSheet.balanced")
                    : t("reports.balanceSheet.unbalanced")}
                </Badge>
              </div>
              <CardDescription>{report.asOf}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t("reports.balanceSheet.totalAssets")}
                  </p>
                  <p className="text-xl font-bold font-mono tabular-nums">
                    {formatAmount(report.totalAssets)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t("reports.balanceSheet.totalLiabilities")}
                  </p>
                  <p className="text-xl font-bold font-mono tabular-nums">
                    {formatAmount(report.totalLiabilities)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t("reports.balanceSheet.totalEquity")}
                  </p>
                  <p className="text-xl font-bold font-mono tabular-nums">
                    {formatAmount(report.totalEquity)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
