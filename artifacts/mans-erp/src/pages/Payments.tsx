import { useState, useCallback } from "react";
import { canChangeBankingJournal, getApiErrorMessage } from "@/lib/journal-entry-ui";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useListPayments,
  useDeletePayment,
  useConfirmPayment,
  useVoidPayment,
  getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import type { Payment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { PaymentFormDialog } from "@/components/banking/PaymentFormDialog";
import {
  Plus,
  Search,
  CreditCard,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Trash2,
  RefreshCw,
  Pencil,
} from "lucide-react";

const STATUS_OPTIONS = ["DRAFT", "CONFIRMED", "RECONCILED", "VOIDED"] as const;
const METHOD_OPTIONS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CREDIT_CARD", "ONLINE", "OTHER"] as const;

function statusBadge(status: string) {
  const variants: Record<string, string> = {
    DRAFT:      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    CONFIRMED:  "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    RECONCILED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    VOIDED:     "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
  };
  return variants[status] ?? "bg-slate-100 text-slate-600";
}

export default function Payments() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState("ALL");

  // ── Dialog state ─────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen]           = useState(false);
  const [editPayment, setEditPayment]     = useState<Payment | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<{ id: string; number: string } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; number: string } | null>(null);
  const [voidTarget, setVoidTarget]       = useState<{ id: string; number: string } | null>(null);
  const [voidReason, setVoidReason]       = useState("");

  const handleSearchChange = useCallback((val: string) => setSearch(val), []);

  // ── Query ─────────────────────────────────────────────────────────────────────
  const queryParams: Record<string, any> = {};
  if (statusFilter !== "ALL") queryParams.status = statusFilter;
  if (methodFilter !== "ALL") queryParams.paymentMethod = methodFilter;

  const { data, isLoading, refetch } = useListPayments(queryParams as any);
  const allPayments: any[] = (data as any)?.data ?? (Array.isArray(data) ? data : []);

  const filtered = search.trim()
    ? allPayments.filter((p) => {
        const q = search.toLowerCase();
        const name = lang === "ar" ? p.payeeNameAr : p.payeeName;
        return (
          p.number?.toLowerCase().includes(q) ||
          (name ?? "").toLowerCase().includes(q) ||
          (p.reference ?? "").toLowerCase().includes(q)
        );
      })
    : allPayments;

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const deleteMutation  = useDeletePayment();
  const confirmMutation = useConfirmPayment();
  const voidMutation    = useVoidPayment();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: lang === "ar" ? "تم الحذف" : "Deleted" });
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

  const handleConfirm = () => {
    if (!confirmTarget) return;
    confirmMutation.mutate(
      { id: confirmTarget.id },
      {
        onSuccess: () => {
          toast({ title: t("banking.confirm") + " ✓" });
          setConfirmTarget(null);
          invalidate();
        },
        onError: (err: any) => {
          toast({ title: getApiErrorMessage(err, t("common.error")), variant: "destructive" });
          setConfirmTarget(null);
        },
      }
    );
  };

  const handleVoid = () => {
    if (!voidTarget || !voidReason.trim()) return;
    voidMutation.mutate(
      { id: voidTarget.id, data: { voidReason: voidReason.trim() } },
      {
        onSuccess: () => {
          toast({ title: t("banking.void") + " ✓" });
          setVoidTarget(null);
          setVoidReason("");
          invalidate();
        },
        onError: (err: any) => {
          toast({ title: getApiErrorMessage(err, t("common.error")), variant: "destructive" });
        },
      }
    );
  };

  const openCreate = () => {
    setEditPayment(null);
    setFormOpen(true);
  };

  const openEdit = (p: any) => {
    setEditPayment(p as Payment);
    setFormOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" />
            {t("banking.payments.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("banking.payments.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 me-2" />
            {t("banking.payments.new")}
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
            placeholder={lang === "ar" ? "بحث برقم المدفوعة، المستفيد، المرجع..." : "Search by number, payee, reference..."}
            className="ps-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("banking.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("coa.filter.all")}</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{t(`banking.status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("banking.paymentMethod")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("coa.filter.all")}</SelectItem>
            {METHOD_OPTIONS.map((m) => (
              <SelectItem key={m} value={m}>{t(`banking.paymentMethod.${m}`)}</SelectItem>
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
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">
                    {lang === "ar" ? "رقم المدفوعة" : "Number"}
                  </th>
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.date")}</th>
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.paymentMethod")}</th>
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.payee")}</th>
                  <th className="text-end font-semibold py-3 px-4 whitespace-nowrap">{t("banking.amount")}</th>
                  <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("banking.status")}</th>
                  <th className="py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <CreditCard className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">{t("banking.payments.empty")}</p>
                      <p className="text-xs mt-1">{t("banking.payments.empty.desc")}</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((p: any) => {
                    const payeeName = lang === "ar" ? p.payeeNameAr : p.payeeName;
                    const acct = p.bankAccount ?? p.cashBox;
                    const acctName = acct
                      ? lang === "ar"
                        ? (acct.accountNameAr ?? acct.nameAr)
                        : (acct.accountNameEn ?? acct.nameEn)
                      : null;
                    return (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-medium">{p.number}</span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                          {new Date(p.paymentDate).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB")}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {t(`banking.paymentMethod.${p.paymentMethod}`)}
                        </td>
                        <td className="py-3 px-4 max-w-[200px] truncate">
                          {payeeName ?? acctName ?? "—"}
                        </td>
                        <td className="py-3 px-4 text-end font-mono font-semibold whitespace-nowrap">
                          {Number(p.amount).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { minimumFractionDigits: 2 })}
                          <span className="text-xs text-muted-foreground ms-1">{p.currencyCode}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(p.status)}`}>
                            {t(`banking.status.${p.status}`)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="w-8 h-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {p.status === "DRAFT" && canChangeBankingJournal(p) && (
                                <>
                                  <DropdownMenuItem onClick={() => openEdit(p)}>
                                    <Pencil className="w-4 h-4 me-2" />
                                    {t("common.edit")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setConfirmTarget({ id: p.id, number: p.number })}>
                                    <CheckCircle className="w-4 h-4 me-2 text-green-600" />
                                    {t("banking.confirm")}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteTarget({ id: p.id, number: p.number })}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 me-2" />
                                    {t("common.delete")}
                                  </DropdownMenuItem>
                                </>
                              )}
                              {p.status === "CONFIRMED" && canChangeBankingJournal(p) && (
                                <DropdownMenuItem onClick={() => { setVoidTarget({ id: p.id, number: p.number }); setVoidReason(""); }}>
                                  <XCircle className="w-4 h-4 me-2 text-red-600" />
                                  {t("banking.void")}
                                </DropdownMenuItem>
                              )}
                              {(p.status === "RECONCILED" || p.status === "VOIDED" || !canChangeBankingJournal(p)) && (
                                <DropdownMenuItem disabled className="text-muted-foreground">
                                  {lang === "ar" ? "لا إجراءات متاحة" : "No actions available"}
                                </DropdownMenuItem>
                              )}
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

      {/* Create / Edit Dialog */}
      <PaymentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        payment={editPayment}
        onSuccess={invalidate}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("banking.delete.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? `سيتم حذف المدفوعة ${deleteTarget?.number} بشكل دائم.`
                : `Payment ${deleteTarget?.number} will be permanently deleted.`}
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

      {/* Confirm Dialog */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("banking.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? `سيتم تأكيد المدفوعة ${confirmTarget?.number} وتحديث الرصيد وإنشاء قيد محاسبي تلقائياً.`
                : `Payment ${confirmTarget?.number} will be confirmed, the account balance updated, and a journal entry created automatically.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-green-600 hover:bg-green-700">
              {confirmMutation.isPending ? t("banking.confirming") : t("banking.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void Dialog */}
      <Dialog
        open={!!voidTarget}
        onOpenChange={(o) => { if (!o) { setVoidTarget(null); setVoidReason(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("banking.void")} — {voidTarget?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">{t("banking.voidReason")}</label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              placeholder={lang === "ar" ? "أدخل سبب الإلغاء..." : "Enter void reason..."}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVoidTarget(null); setVoidReason(""); }}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || voidMutation.isPending}
              onClick={handleVoid}
            >
              {voidMutation.isPending ? t("banking.voiding") : t("banking.void")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
