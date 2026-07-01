import { useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useListCashBoxes,
  useDeleteCashBox,
  useToggleCashBoxActive,
  getListCashBoxesQueryKey,
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
  Wallet,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
} from "lucide-react";
import { BalanceBadge } from "@/components/banking/BalanceBadge";

export default function CashBoxes() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [toggleTarget, setToggleTarget] = useState<{ id: string; name: string; isActive: boolean } | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
  }, []);

  const queryParams: Record<string, any> = {};
  if (activeFilter !== "ALL") queryParams.isActive = activeFilter === "ACTIVE";
  if (currencyFilter !== "ALL") queryParams.currencyCode = currencyFilter;

  const { data, isLoading, refetch } = useListCashBoxes(queryParams as any);
  const allBoxes: any[] = (data as any)?.data ?? (Array.isArray(data) ? data : []);

  const filtered = search.trim()
    ? allBoxes.filter((b) => {
        const q = search.toLowerCase();
        return (
          b.nameEn?.toLowerCase().includes(q) ||
          b.nameAr?.includes(search) ||
          b.code?.toLowerCase().includes(q)
        );
      })
    : allBoxes;

  const deleteMutation = useDeleteCashBox({
    mutation: {
      onSuccess: () => {
        toast({
          title: lang === "ar" ? "تم الحذف" : "Deleted",
          description: lang === "ar" ? "تم حذف الصندوق النقدي." : "Cash box deleted.",
        });
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: getListCashBoxesQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || (lang === "ar" ? "فشل الحذف" : "Failed to delete");
        toast({ title: lang === "ar" ? "خطأ" : "Error", description: msg, variant: "destructive" });
        setDeleteTarget(null);
      },
    },
  });

  const toggleMutation = useToggleCashBoxActive({
    mutation: {
      onSuccess: () => {
        toast({
          title: lang === "ar" ? "تم التحديث" : "Updated",
          description: lang === "ar" ? "تم تحديث حالة الصندوق." : "Cash box status updated.",
        });
        setToggleTarget(null);
        queryClient.invalidateQueries({ queryKey: getListCashBoxesQueryKey() });
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
            <Wallet className="w-6 h-6 text-primary" />
            {t("banking.cashBoxes.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("banking.cashBoxes.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Link href="/cash-boxes/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              {t("banking.cashBoxes.new")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={lang === "ar" ? "بحث في الصناديق…" : "Search cash boxes…"}
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
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.code")}</th>
                <th className="text-start font-semibold py-3 px-4">{lang === "ar" ? "الاسم" : "Name"}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.currency")}</th>
                <th className="text-end font-semibold py-3 px-4 whitespace-nowrap">{t("banking.balance.current")}</th>
                <th className="text-end font-semibold py-3 px-4 whitespace-nowrap">{t("banking.balance.opening")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{lang === "ar" ? "الحالة" : "Status"}</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{t("banking.cashBoxes.empty")}</p>
                    <p className="text-xs mt-1">{t("banking.cashBoxes.empty.desc")}</p>
                    <Link href="/cash-boxes/new">
                      <Button className="mt-4 gap-2" size="sm">
                        <Plus className="w-4 h-4" />
                        {t("banking.cashBoxes.new")}
                      </Button>
                    </Link>
                  </td>
                </tr>
              ) : (
                filtered.map((box: any) => {
                  const name = lang === "ar"
                    ? (box.nameAr || box.nameEn)
                    : (box.nameEn || box.nameAr);
                  return (
                    <tr
                      key={box.id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/cash-boxes/${box.id}`)}
                    >
                      <td className="py-3 px-4 font-mono font-medium text-primary whitespace-nowrap">
                        {box.code}
                      </td>
                      <td className="py-3 px-4 font-medium max-w-[200px] truncate">{name || "—"}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {box.currency?.code || box.currencyCode || "—"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-end">
                        <BalanceBadge
                          amount={box.currentBalance ?? 0}
                          currencyCode={box.currency?.code || box.currencyCode}
                          currencySymbol={box.currency?.symbol}
                          decimalPlaces={box.currency?.decimalPlaces}
                          variant="current"
                        />
                      </td>
                      <td className="py-3 px-4 text-end">
                        <BalanceBadge
                          amount={box.openingBalance ?? 0}
                          currencyCode={box.currency?.code || box.currencyCode}
                          currencySymbol={box.currency?.symbol}
                          decimalPlaces={box.currency?.decimalPlaces}
                          variant="opening"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className={box.isActive
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"}
                        >
                          {box.isActive
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
                            <DropdownMenuItem onClick={() => navigate(`/cash-boxes/${box.id}`)}>
                              <Eye className="w-4 h-4 me-2" />
                              {lang === "ar" ? "عرض" : "View"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/cash-boxes/${box.id}/edit`)}>
                              <Pencil className="w-4 h-4 me-2" />
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setToggleTarget({ id: box.id, name: name || box.code, isActive: box.isActive })}
                            >
                              {box.isActive
                                ? <><ToggleLeft className="w-4 h-4 me-2" />{t("banking.deactivate")}</>
                                : <><ToggleRight className="w-4 h-4 me-2" />{t("banking.activate")}</>}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteTarget({ id: box.id, name: name || box.code })}
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
                ? `سيتم حذف الصندوق "${deleteTarget?.name}" بشكل دائم.`
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
                ? (lang === "ar" ? `إيقاف الصندوق "${toggleTarget?.name}"؟` : `Deactivate "${toggleTarget?.name}"?`)
                : (lang === "ar" ? `تفعيل الصندوق "${toggleTarget?.name}"؟` : `Activate "${toggleTarget?.name}"?`)}
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
