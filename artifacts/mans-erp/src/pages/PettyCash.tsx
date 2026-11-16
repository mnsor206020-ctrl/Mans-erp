import { useState, useCallback } from "react";
import { canChangeBankingJournal, getApiErrorMessage } from "@/lib/journal-entry-ui";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useListPettyCash,
  useDeletePettyCash,
  getListPettyCashQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { PettyCashFormDialog } from "@/components/banking/PettyCashFormDialog";
import {
  Plus,
  Search,
  Wallet2,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";

const TYPE_OPTIONS = ["IN", "OUT"] as const;

function typeBadge(type: string) {
  return type === "IN"
    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
    : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300";
}

export default function PettyCash() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const [formOpen, setFormOpen]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; descriptionEn: string } | null>(null);

  const handleSearchChange = useCallback((val: string) => setSearch(val), []);

  const queryParams: Record<string, any> = {};
  if (typeFilter !== "ALL") queryParams.type = typeFilter;

  const { data, isLoading, refetch } = useListPettyCash(queryParams as any);
  const allEntries: any[] = (data as any)?.data ?? (Array.isArray(data) ? data : []);

  const filtered = search.trim()
    ? allEntries.filter((e) => {
        const q = search.toLowerCase();
        const desc = lang === "ar" ? e.descriptionAr : e.descriptionEn;
        return (
          (desc ?? "").toLowerCase().includes(q) ||
          (e.reference ?? "").toLowerCase().includes(q) ||
          (e.receiptNumber ?? "").toLowerCase().includes(q)
        );
      })
    : allEntries;

  const deleteMutation = useDeletePettyCash();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListPettyCashQueryKey() });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: t("common.deleted") });
          setDeleteTarget(null);
          invalidate();
        },
        onError: (err: any) => {
          toast({ title: getApiErrorMessage(err, t("common.error")), variant: "destructive" });
          setDeleteTarget(null);
        },
      }
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet2 className="w-6 h-6 text-primary" />
            {t("banking.pettyCash.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("banking.pettyCash.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="w-4 h-4 me-2" />
            {t("banking.pettyCash.new")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={lang === "ar" ? "بحث في الوصف أو المرجع..." : "Search by description or reference..."}
            className="ps-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={lang === "ar" ? "النوع" : "Type"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("coa.filter.all")}</SelectItem>
            {TYPE_OPTIONS.map((tp) => (
              <SelectItem key={tp} value={tp}>{t(`banking.type.${tp}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{lang === "ar" ? "التاريخ" : "Date"}</th>
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{lang === "ar" ? "النوع" : "Type"}</th>
                  <th className="text-start font-semibold py-3 px-4">{lang === "ar" ? "الوصف" : "Description"}</th>
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{lang === "ar" ? "الصندوق" : "Cash Box"}</th>
                  <th className="text-end font-semibold py-3 px-4 whitespace-nowrap">{t("banking.amount")}</th>
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{lang === "ar" ? "المرجع" : "Reference"}</th>
                  <th className="py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Wallet2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">{t("banking.pettyCash.empty")}</p>
                      <p className="text-xs mt-1">{t("banking.pettyCash.empty.desc")}</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((e: any) => {
                    const desc = lang === "ar" ? e.descriptionAr : e.descriptionEn;
                    const cashBoxName = e.cashBox
                      ? lang === "ar" ? e.cashBox.nameAr : e.cashBox.nameEn
                      : "—";
                    return (
                      <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                          {new Date(e.transactionDate).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB")}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge(e.type)}`}>
                            {e.type === "IN"
                              ? <ArrowUpCircle className="w-3 h-3" />
                              : <ArrowDownCircle className="w-3 h-3" />}
                            {t(`banking.type.${e.type}`)}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-[200px] truncate">{desc}</td>
                        <td className="py-3 px-4 whitespace-nowrap">{cashBoxName}</td>
                        <td className="py-3 px-4 text-end font-mono font-semibold whitespace-nowrap">
                          {Number(e.amount).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { minimumFractionDigits: 2 })}
                          <span className="text-xs text-muted-foreground ms-1">{e.cashBox?.currencyCode ?? ""}</span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{e.reference ?? "—"}</td>
                        <td className="py-3 px-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="w-8 h-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={!canChangeBankingJournal(e)}
                                onClick={() => setDeleteTarget({ id: e.id, descriptionEn: e.descriptionEn })}
                                className="text-destructive"
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
        )}
      </Card>

      {/* Create Dialog */}
      <PettyCashFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={invalidate}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("banking.delete.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "سيتم حذف هذا القيد وعكس تأثيره على رصيد الصندوق."
                : `Entry "${deleteTarget?.descriptionEn}" will be deleted and its balance effect reversed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {deleteMutation.isPending ? t("banking.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
