import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useGetBankAccount,
  useDeleteBankAccount,
  useToggleBankAccountActive,
  getListBankAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  ChevronLeft,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Landmark,
  Building2,
  DollarSign,
  Hash,
  CreditCard,
  BookOpen,
  Calendar,
  User,
} from "lucide-react";
import { BalanceBadge } from "@/components/banking/BalanceBadge";

interface Props {
  params: { id: string };
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b last:border-0">
      <dt className="w-full sm:w-48 text-sm text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function formatDateTime(d: string | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BankAccountDetail({ params }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [deleteDialog, setDeleteDialog] = useState(false);
  const [toggleDialog, setToggleDialog] = useState(false);

  const { data, isLoading } = useGetBankAccount(params.id);
  const account = (data as any)?.data ?? (data as any);

  const deleteMutation = useDeleteBankAccount({
    mutation: {
      onSuccess: () => {
        toast({ title: lang === "ar" ? "تم الحذف" : "Deleted", description: lang === "ar" ? "تم حذف الحساب البنكي." : "Bank account deleted." });
        queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
        navigate("/bank-accounts");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || (lang === "ar" ? "فشل الحذف" : "Failed to delete");
        toast({ title: lang === "ar" ? "خطأ" : "Error", description: msg, variant: "destructive" });
        setDeleteDialog(false);
      },
    },
  });

  const toggleMutation = useToggleBankAccountActive({
    mutation: {
      onSuccess: () => {
        toast({ title: lang === "ar" ? "تم التحديث" : "Updated", description: lang === "ar" ? "تم تحديث حالة الحساب." : "Account status updated." });
        queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
        setToggleDialog(false);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || (lang === "ar" ? "فشل التحديث" : "Failed to update");
        toast({ title: lang === "ar" ? "خطأ" : "Error", description: msg, variant: "destructive" });
        setToggleDialog(false);
      },
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Card><CardContent className="p-6 space-y-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent></Card>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-16 text-muted-foreground">
          <Landmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{lang === "ar" ? "لم يتم العثور على الحساب" : "Account not found"}</p>
          <Link href="/bank-accounts">
            <Button className="mt-4" variant="outline">{lang === "ar" ? "العودة" : "Go Back"}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const name = lang === "ar"
    ? (account.accountNameAr || account.accountNameEn)
    : (account.accountNameEn || account.accountNameAr);
  const bankName = lang === "ar"
    ? (account.bank?.nameAr || account.bank?.nameEn)
    : (account.bank?.nameEn || account.bank?.nameAr);
  const branchName = lang === "ar"
    ? (account.branch?.nameAr || account.branch?.nameEn)
    : (account.branch?.nameEn || account.branch?.nameAr);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/bank-accounts">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Landmark className="w-6 h-6 text-primary" />
              {name || "—"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t(`banking.accountType.${account.accountType}`)}
              {" · "}
              {account.currency?.code || account.currencyCode || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setToggleDialog(true)}
          >
            {account.isActive
              ? <><ToggleLeft className="w-4 h-4" />{t("banking.deactivate")}</>
              : <><ToggleRight className="w-4 h-4" />{t("banking.activate")}</>}
          </Button>
          <Link href={`/bank-accounts/${params.id}/edit`}>
            <Button variant="outline" size="sm" className="gap-2">
              <Pencil className="w-4 h-4" />
              {t("common.edit")}
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
            onClick={() => setDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4" />
            {t("common.delete")}
          </Button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center gap-2 py-8">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("banking.balance.current")}</p>
            <BalanceBadge
              amount={account.currentBalance ?? 0}
              currencyCode={account.currency?.code || account.currencyCode}
              currencySymbol={account.currency?.symbol}
              decimalPlaces={account.currency?.decimalPlaces}
              variant="current"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center gap-2 py-8">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("banking.balance.opening")}</p>
            <BalanceBadge
              amount={account.openingBalance ?? 0}
              currencyCode={account.currency?.code || account.currencyCode}
              currencySymbol={account.currency?.symbol}
              decimalPlaces={account.currency?.decimalPlaces}
              variant="opening"
            />
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang === "ar" ? "تفاصيل الحساب" : "Account Details"}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <DetailRow label={t("banking.bank")}>
              <span className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-muted-foreground" />
                {bankName || "—"}
              </span>
            </DetailRow>
            <DetailRow label={t("banking.currency")}>
              <span className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                {account.currency?.code || account.currencyCode || "—"}
                {account.currency?.symbol && (
                  <span className="text-muted-foreground">({account.currency.symbol})</span>
                )}
              </span>
            </DetailRow>
            <DetailRow label={t("banking.accountType")}>
              <Badge variant="outline" className="text-xs">
                {t(`banking.accountType.${account.accountType}`)}
              </Badge>
            </DetailRow>
            <DetailRow label={t("banking.accountNumber")}>
              <span className="font-mono" dir="ltr">{account.accountNumber || "—"}</span>
            </DetailRow>
            <DetailRow label={t("banking.iban")}>
              <span className="font-mono tracking-wider text-xs" dir="ltr">
                {account.iban || "—"}
              </span>
            </DetailRow>
            {account.branch && (
              <DetailRow label={t("banking.branch")}>
                <span className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  {branchName || account.branch?.code || "—"}
                </span>
              </DetailRow>
            )}
            {account.glAccountId && (
              <DetailRow label={t("banking.glAccount")}>
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono text-xs" dir="ltr">{account.glAccountId}</span>
                </span>
              </DetailRow>
            )}
            <DetailRow label={lang === "ar" ? "الحالة" : "Status"}>
              <Badge
                variant="outline"
                className={account.isActive
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-slate-100 text-slate-500 border-slate-200"}
              >
                {account.isActive
                  ? (lang === "ar" ? "نشط" : "Active")
                  : (lang === "ar" ? "غير نشط" : "Inactive")}
              </Badge>
            </DetailRow>
          </dl>
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang === "ar" ? "معلومات النظام" : "Metadata"}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <DetailRow label={lang === "ar" ? "تاريخ الإنشاء" : "Created At"}>
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                {formatDateTime(account.createdAt)}
              </span>
            </DetailRow>
            <DetailRow label={lang === "ar" ? "آخر تحديث" : "Last Updated"}>
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                {formatDateTime(account.updatedAt)}
              </span>
            </DetailRow>
            {account.createdBy && (
              <DetailRow label={lang === "ar" ? "أُنشئ بواسطة" : "Created By"}>
                <span className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  {`${account.createdBy.firstNameEn || ""} ${account.createdBy.lastNameEn || ""}`.trim()
                    || account.createdBy.email
                    || "—"}
                </span>
              </DetailRow>
            )}
            <DetailRow label="ID">
              <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                <Hash className="w-3 h-3 inline me-1" />
                {account.id}
              </span>
            </DetailRow>
          </dl>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("banking.delete.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? `سيتم حذف الحساب "${name}" بشكل دائم. لا يمكن التراجع عن هذا الإجراء.`
                : `"${name}" will be permanently deleted. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: params.id })}
            >
              {deleteMutation.isPending ? t("banking.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toggle Active Dialog */}
      <AlertDialog open={toggleDialog} onOpenChange={setToggleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {account.isActive ? t("banking.deactivate") : t("banking.activate")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {account.isActive
                ? (lang === "ar" ? `إيقاف الحساب "${name}"؟` : `Deactivate "${name}"?`)
                : (lang === "ar" ? `تفعيل الحساب "${name}"؟` : `Activate "${name}"?`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toggleMutation.mutate({ id: params.id })}
            >
              {toggleMutation.isPending ? t("banking.saving") : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
