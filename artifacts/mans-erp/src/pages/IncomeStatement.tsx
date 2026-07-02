import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import {
  useListFiscalYears,
  useGetIncomeStatement,
} from "@workspace/api-client-react";
import type { IncomeStatementAccount } from "@workspace/api-client-react";
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
import { TrendingUp, RefreshCw, FileDown } from "lucide-react";
import { buildCsv, downloadCsv, generateFilename } from "@/lib/csv";

function formatAmount(n: number): string {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface SectionTableProps {
  title:            string;
  accounts:         IncomeStatementAccount[];
  total:            number;
  totalLabel:       string;
  emptyLabel:       string;
  accountCodeLabel: string;
  accountNameLabel: string;
  balanceLabel:     string;
  lang:             string;
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
              accounts.map((acc: IncomeStatementAccount) => (
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

export default function IncomeStatement() {
  const { t, lang } = useLanguage();

  const [fiscalYearId, setFiscalYearId] = useState("");
  const [from, setFrom]                 = useState("");
  const [to, setTo]                     = useState("");
  const [loadParams, setLoadParams]     = useState<{
    fiscalYearId: string;
    from:         string;
    to:           string;
  } | null>(null);

  const { data: fiscalYears, isLoading: fyLoading } = useListFiscalYears();

  const { data: report, isLoading: reportLoading, refetch } = useGetIncomeStatement(
    loadParams ?? { fiscalYearId: "", from: "", to: "" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!loadParams } as any },
  );

  function handleLoad() {
    if (!fiscalYearId || !from || !to) return;
    setLoadParams({ fiscalYearId, from, to });
  }

  function handleExport() {
    if (!report) return;
    const headers = [
      t("reports.incomeStatement.section"),
      t("reports.incomeStatement.accountCode"),
      t("reports.incomeStatement.accountName"),
      t("reports.incomeStatement.balance"),
    ];
    const toRows = (accounts: IncomeStatementAccount[], sectionLabel: string) =>
      accounts.map((acc) => [
        sectionLabel,
        acc.accountCode,
        lang === "ar" ? acc.accountNameAr : acc.accountNameEn,
        acc.balance,
      ]);
    const rows = [
      ...toRows(report.revenue,  t("reports.incomeStatement.revenue")),
      ...toRows(report.expenses, t("reports.incomeStatement.expenses")),
    ];
    downloadCsv(generateFilename("income-statement"), buildCsv(headers, rows));
  }

  const canLoad = !!fiscalYearId && !!from && !!to && !fyLoading;
  const isLoss  = report && report.netIncome < 0;

  const commonSectionProps = {
    emptyLabel:       t("reports.incomeStatement.empty"),
    accountCodeLabel: t("reports.incomeStatement.accountCode"),
    accountNameLabel: t("reports.incomeStatement.accountName"),
    balanceLabel:     t("reports.incomeStatement.balance"),
    lang,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("reports.incomeStatement.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("reports.incomeStatement.subtitle")}</p>
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
                {t("reports.incomeStatement.fiscalYear")}
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

            <div className="flex-1 min-w-36">
              <Label className="mb-2 block text-sm font-medium">
                {t("reports.incomeStatement.from")}
              </Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>

            <div className="flex-1 min-w-36">
              <Label className="mb-2 block text-sm font-medium">
                {t("reports.incomeStatement.to")}
              </Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <Button onClick={handleLoad} disabled={!canLoad}>
              <TrendingUp className="w-4 h-4 me-2" />
              {t("reports.incomeStatement.loadReport")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report */}
      {!loadParams ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>{t("reports.incomeStatement.selectFilters")}</p>
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
          {/* Revenue */}
          <SectionTable
            {...commonSectionProps}
            title={t("reports.incomeStatement.revenue")}
            accounts={report.revenue}
            total={report.totalRevenue}
            totalLabel={t("reports.incomeStatement.totalRevenue")}
          />

          {/* Expenses */}
          <SectionTable
            {...commonSectionProps}
            title={t("reports.incomeStatement.expenses")}
            accounts={report.expenses}
            total={report.totalExpenses}
            totalLabel={t("reports.incomeStatement.totalExpenses")}
          />

          {/* Net Income card */}
          <Card className={isLoss ? "border-destructive/50" : "border-green-500/50"}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {isLoss
                    ? t("reports.incomeStatement.netLoss")
                    : t("reports.incomeStatement.netIncome")}
                </CardTitle>
                <Badge variant={isLoss ? "destructive" : "default"}>
                  {report.from} → {report.to}
                </Badge>
              </div>
              <CardDescription>
                {t("reports.incomeStatement.totalRevenue")} − {t("reports.incomeStatement.totalExpenses")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t("reports.incomeStatement.totalRevenue")}
                  </p>
                  <p className="text-xl font-bold font-mono tabular-nums text-green-600 dark:text-green-400">
                    {formatAmount(report.totalRevenue)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t("reports.incomeStatement.totalExpenses")}
                  </p>
                  <p className="text-xl font-bold font-mono tabular-nums text-destructive">
                    {formatAmount(report.totalExpenses)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {isLoss
                      ? t("reports.incomeStatement.netLoss")
                      : t("reports.incomeStatement.netIncome")}
                  </p>
                  <p className={`text-xl font-bold font-mono tabular-nums ${isLoss ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                    {formatAmount(Math.abs(report.netIncome))}
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
