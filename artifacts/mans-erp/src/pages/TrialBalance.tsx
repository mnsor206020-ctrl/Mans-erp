import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import {
  useListFiscalYears,
  useGetTrialBalance,
} from "@workspace/api-client-react";
import type { TrialBalanceLine } from "@workspace/api-client-react";
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
import { BarChart3, RefreshCw, FileDown } from "lucide-react";
import { buildCsv, downloadCsv, generateFilename } from "@/lib/csv";

function formatAmount(n: number): string {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrialBalance() {
  const { t, lang } = useLanguage();

  const [fiscalYearId, setFiscalYearId]   = useState("");
  const [asOf, setAsOf]                   = useState("");
  const [loadParams, setLoadParams]       = useState<{ fiscalYearId: string; asOf?: string } | null>(null);

  const { data: fiscalYears, isLoading: fyLoading } = useListFiscalYears();

  const { data: report, isLoading: reportLoading, refetch } = useGetTrialBalance(
    loadParams ?? { fiscalYearId: "" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!loadParams } as any },
  );

  function handleLoad() {
    if (!fiscalYearId) return;
    const params: { fiscalYearId: string; asOf?: string } = { fiscalYearId };
    if (asOf) params.asOf = asOf;
    setLoadParams(params);
  }

  function handleExport() {
    if (!report) return;
    const headers = [
      t("reports.trialBalance.accountCode"),
      t("reports.trialBalance.accountName"),
      t("reports.trialBalance.debit"),
      t("reports.trialBalance.credit"),
      t("reports.trialBalance.balance"),
    ];
    const rows = report.lines.map((line: TrialBalanceLine) => [
      line.accountCode,
      lang === "ar" ? line.accountNameAr : line.accountNameEn,
      line.totalDebit,
      line.totalCredit,
      line.balance,
    ]);
    downloadCsv(generateFilename("trial-balance"), buildCsv(headers, rows));
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("reports.trialBalance.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("reports.trialBalance.subtitle")}</p>
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
                {t("reports.trialBalance.fiscalYear")}
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
                {t("reports.trialBalance.asOf")}
              </Label>
              <Input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>

            <Button onClick={handleLoad} disabled={!fiscalYearId || fyLoading}>
              <BarChart3 className="w-4 h-4 me-2" />
              {t("reports.trialBalance.loadReport")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report table */}
      {!loadParams ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>{t("reports.trialBalance.selectFiscalYear")}</p>
          </CardContent>
        </Card>
      ) : reportLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : report ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("reports.trialBalance.title")}</CardTitle>
            <CardDescription>
              {report.asOf
                ? `${t("reports.trialBalance.asOf")}: ${report.asOf}`
                : t("reports.trialBalance.allPosted")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-y">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground w-32">
                      {t("reports.trialBalance.accountCode")}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                      {t("reports.trialBalance.accountName")}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground w-40">
                      {t("reports.trialBalance.debit")}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground w-40">
                      {t("reports.trialBalance.credit")}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground w-40">
                      {t("reports.trialBalance.balance")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        {t("reports.trialBalance.empty")}
                      </td>
                    </tr>
                  ) : (
                    report.lines.map((line: TrialBalanceLine) => (
                      <tr key={line.accountId} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {line.accountCode}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">
                            {lang === "ar" ? line.accountNameAr : line.accountNameEn}
                          </span>
                          <span className="text-muted-foreground text-xs ms-2">
                            {lang === "ar" ? line.accountNameEn : line.accountNameAr}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {line.totalDebit > 0 ? formatAmount(line.totalDebit) : "—"}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {line.totalCredit > 0 ? formatAmount(line.totalCredit) : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-end tabular-nums font-medium ${
                            line.balance > 0
                              ? "text-green-600 dark:text-green-400"
                              : line.balance < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {formatAmount(Math.abs(line.balance))}
                          {line.balance < 0 && (
                            <span className="text-xs ms-1 font-normal">Cr</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {report.lines.length > 0 && (
                  <tfoot className="border-t-2 bg-muted/50">
                    <tr className="font-semibold">
                      <td className="px-4 py-3" colSpan={2}>
                        {t("reports.trialBalance.totals")}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {formatAmount(report.totalDebit)}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {formatAmount(report.totalCredit)}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {formatAmount(Math.abs(report.totalDebit - report.totalCredit))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
