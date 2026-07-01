import { useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useListBankAccounts,
  useDeleteBankAccount,
  useToggleBankAccountActive,
  getListBankAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Landmark,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
} from "lucide-react";
import { BalanceBadge } from "@/components/banking/BalanceBadge";

const ACCOUNT_TYPE_KEYS = ["CURRENT", "SAVINGS", "FIXED_DEPOSIT", "PETTY_CASH"] as const;

export default function BankAccounts() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [toggleTarget, setToggleTarget] = useState<{ id: string; name: string; isActive: boolean } | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((window as any)._baSearchTimer);
    (window as any)._baSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
    }, 400);
  }, []);

  const queryParams: Record<string, any> = {};
  if (activeFilter !== "ALL") queryParams.isActive = activeFilter === "ACTIVE";
  if (typeFilter !== "ALL") queryParams.type = typeFilter;
  if (currencyFilter !== "ALL") queryParams.currencyCode = currencyFilter;
  if (debouncedSearch) queryParams.search = debouncedSearch;

  const { data, isLoading, refetch } = useListBankAccounts(queryParams as any);
  const accounts = (data as any)?.data ?? [];

  const deleteMutation = useDeleteBankAccount({
    mutation: {
      onSuccess: () => {
        toast({ title: lang === "ar" ? "تم الحذف" : "Deleted", description: lang === "ar" ? "تم حذف الحساب." : "Bank account deleted." });
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || (lang === "ar" ? "فشل الحذف" : "Failed to delete");
        toast({ title: lang === "ar" ? "خطأ" : "Error", description: msg, variant: "destructive" });
        setDeleteTarget(null);
      },
    },
  });

  const toggleMutation = useToggleBankAccountActive({
    mutation: {
      onSuccess: () => {
        toast({ title: lang === "ar" ? "تم التحديث" : "Updated", description: lang === "ar" ? "تم تحديث حالة الحساب." : "Account status updated." });
        setToggleTarget(null);
        queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || (lang === "ar" ? "فشل التحديث" : "Failed to update");
        toast({ title: lang === "ar" ? "خطأ" : "Error", description: msg, variant: "destructive" });
        setToggleTarget(null);
      },
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            {t("banking.bankAccounts.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("banking.bankAccounts.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Link href="/bank-accounts/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              {t("banking.bankAccounts.new")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={lang === "ar" ? "بحث في الحسابات…" : "Search accounts…"}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{lang === "ar" ? "الكل" : "All Status"}</SelectItem>
            <SelectItem value="ACTIVE">{lang === "ar" ? "نشط" : "Active"}</SelectItem>
            <SelectItem value="INACTIVE">{lang === "ar" ? "غير نشط" : "Inactive"}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("banking.accountType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{lang === "ar" ? "جميع الأنواع" : "All Types"}</SelectItem>
            {ACCOUNT_TYPE_KEYS.map((k) => (
              <SelectItem key={k} value={k}>{t(`banking.accountType.${k}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{lang === "ar" ? "اسم الحساب" : "Account Name"}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.bank")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.accountType")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.accountNumber")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.currency")}</th>
                <th className="text-end font-semibold py-3 px-4 whitespace-nowrap">{t("banking.balance.current")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{lang === "ar" ? "الحالة" : "Status"}</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <Landmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{t("banking.bankAccounts.empty")}</p>
                    <p className="text-xs mt-1">{t("banking.bankAccounts.empty.desc")}</p>
                    <Link href="/bank-accounts/new">
                      <Button className="mt-4 gap-2" size="sm">
                        <Plus className="w-4 h-4" />
                        {t("banking.bankAccounts.new")}
                      </Button>
                    </Link>
                  </td>
                </tr>
              ) : (
                accounts.map((account: any) => {
                  const name = lang === "ar"
                    ? (account.accountNameAr || account.accountNameEn)
                    : (account.accountNameEn || account.accountNameAr);
                  const bankName = lang === "ar"
                    ? (account.bank?.nameAr || account.bank?.nameEn)
                    : (account.bank?.nameEn || account.bank?.nameAr);
                  return (
                    <tr
                      key={account.id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/bank-accounts/${account.id}`)}
                    >
                      <td className="py-3 px-4 font-medium">{name || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground">{bankName || "—"}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-muted-foreground">
                          {t(`banking.accountType.${account.accountType}`)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-muted-foreground text-xs">
                        {account.accountNumber || "—"}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {account.currency?.code || account.currencyCode || "—"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-end">
                        <BalanceBadge
                          amount={account.currentBalance ?? 0}
                          currencyCode={account.currency?.code || account.currencyCode}
                          currencySymbol={account.currency?.symbol}
                          decimalPlaces={account.currency?.decimalPlaces}
                          variant="current"
                        />
                      </td>
                      <td className="py-3 px-4">
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
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-8 h-8 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/bank-accounts/${account.id}`)}>
                              <Eye className="w-4 h-4 me-2" />
                              {lang === "ar" ? "عرض" : "View"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/bank-accounts/${account.id}/edit`)}>
                              <Pencil className="w-4 h-4 me-2" />
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setToggleTarget({ id: account.id, name: name || account.id, isActive: account.isActive })}
                            >
                              {account.isActive
                                ? <><ToggleLeft className="w-4 h-4 me-2" />{t("banking.deactivate")}</>
                                : <><ToggleRight className="w-4 h-4 me-2" />{t("banking.activate")}</>
                              }
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteTarget({ id: account.id, name: name || account.id })}
                            >
                              <Trash2 className="w-4 h-4 me-2" />
                              {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("banking.delete.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? `سيتم حذف الحساب "${deleteTarget?.name}" بشكل دائم.`
                : `"${deleteTarget?.name}" will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
            >
              {deleteMutation.isPending ? t("banking.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toggle Active Confirm */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(o) => !o && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.isActive ? t("banking.deactivate") : t("banking.activate")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.isActive
                ? (lang === "ar" ? `إيقاف الحساب "${toggleTarget?.name}"؟` : `Deactivate "${toggleTarget?.name}"?`)
                : (lang === "ar" ? `تفعيل الحساب "${toggleTarget?.name}"؟` : `Activate "${toggleTarget?.name}"?`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toggleTarget && toggleMutation.mutate({ id: toggleTarget.id })}
            >
              {toggleMutation.isPending ? t("banking.saving") : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
