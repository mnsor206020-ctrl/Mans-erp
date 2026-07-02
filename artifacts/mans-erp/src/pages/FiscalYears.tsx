import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import {
  useListFiscalYears,
  useListChartOfAccounts,
  useCloseFiscalYear,
} from "@workspace/api-client-react";
import type { FiscalYear } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarRange, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-SA", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const variant =
    status === "OPEN"   ? "default" :
    status === "CLOSED" ? "secondary" :
    "outline";
  const label =
    status === "OPEN"   ? t("fiscalYears.status.open") :
    status === "CLOSED" ? t("fiscalYears.status.closed") :
    t("fiscalYears.status.locked");
  return <Badge variant={variant}>{label}</Badge>;
}

export default function FiscalYears() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [closingFY, setClosingFY]               = useState<FiscalYear | null>(null);
  const [retainedEarningsId, setRetainedEarningsId] = useState("");
  const [isSubmitting, setIsSubmitting]          = useState(false);

  const { data: fiscalYears, isLoading } = useListFiscalYears();

  const { data: accountsPage, isLoading: accsLoading } = useListChartOfAccounts({
    pageSize: 500,
    isActive: true,
    isGroup:  false,
  });
  const equityAccounts = (accountsPage?.data ?? []).filter((a) => a.type === "EQUITY");

  const closeMutation = useCloseFiscalYear();

  function openCloseDialog(fy: FiscalYear) {
    setRetainedEarningsId("");
    setClosingFY(fy);
  }

  function cancelClose() {
    setClosingFY(null);
    setRetainedEarningsId("");
  }

  async function confirmClose() {
    if (!closingFY || !retainedEarningsId) return;
    setIsSubmitting(true);
    try {
      const result = await closeMutation.mutateAsync({
        id: closingFY.id,
        data: { retainedEarningsAccountId: retainedEarningsId },
      });
      const netLabel = result.netIncome >= 0
        ? t("fiscalYears.netIncome")
        : t("fiscalYears.netLoss");
      const amount = Math.abs(result.netIncome).toLocaleString("en-SA", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });
      toast({
        title:       t("fiscalYears.closeSuccess"),
        description: `${netLabel}: ${amount}`,
      });
      await queryClient.invalidateQueries();
      setClosingFY(null);
      setRetainedEarningsId("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message :
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("fiscalYears.closeError");
      toast({ title: t("fiscalYears.closeError"), description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("fiscalYears.title")}</h2>
        <p className="text-muted-foreground mt-1">{t("fiscalYears.subtitle")}</p>
      </div>

      {/* Fiscal years table */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : !fiscalYears || fiscalYears.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <CalendarRange className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>{t("fiscalYears.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-y">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                      {t("fiscalYears.name")}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground w-36">
                      {t("fiscalYears.startDate")}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground w-36">
                      {t("fiscalYears.endDate")}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground w-28">
                      {t("fiscalYears.status")}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground w-44">
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fiscalYears.map((fy: FiscalYear) => (
                    <tr key={fy.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {lang === "ar" ? fy.nameAr : fy.nameEn}
                        {fy.isDefault && (
                          <Badge variant="outline" className="ms-2 text-xs">
                            {t("fiscalYears.default")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(fy.startDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(fy.endDate)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={fy.status} t={t} />
                      </td>
                      <td className="px-4 py-3 text-end">
                        {fy.status === "OPEN" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCloseDialog(fy)}
                          >
                            <Lock className="w-4 h-4 me-2" />
                            {t("fiscalYears.close")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Close Fiscal Year confirmation dialog */}
      <AlertDialog open={!!closingFY} onOpenChange={(open) => { if (!open) cancelClose(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fiscalYears.closeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("fiscalYears.closeConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Retained earnings account selector */}
          <div className="py-2">
            <Label className="mb-2 block text-sm font-medium">
              {t("fiscalYears.retainedEarningsAccount")}
            </Label>
            {accsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : equityAccounts.length === 0 ? (
              <p className="text-sm text-destructive">{t("fiscalYears.noEquityAccounts")}</p>
            ) : (
              <Select value={retainedEarningsId} onValueChange={setRetainedEarningsId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("fiscalYears.selectAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {equityAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.code} – {lang === "ar" ? acc.nameAr : acc.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelClose} disabled={isSubmitting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClose}
              disabled={!retainedEarningsId || isSubmitting || equityAccounts.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? "…" : t("fiscalYears.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
