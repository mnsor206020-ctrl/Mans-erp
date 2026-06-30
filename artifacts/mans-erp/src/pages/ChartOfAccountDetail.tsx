import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useGetChartOfAccount,
  useUpdateChartOfAccount,
  useDeleteChartOfAccount,
  useToggleChartOfAccountActive,
  getGetChartOfAccountsTreeQueryKey,
  getGetChartOfAccountQueryKey,
} from "@workspace/api-client-react";
import type { UpdateChartOfAccountInput } from "@workspace/api-client-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight,
  Pencil,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
  Hash,
  FileText,
  GitBranch,
  ReceiptText,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
type AccountNature = "DEBIT" | "CREDIT";

const TYPE_CONFIG: Record<AccountType, { label: string; labelAr: string; color: string; dot: string }> = {
  ASSET:     { label: "Asset",     labelAr: "أصول",        color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",    dot: "bg-blue-500" },
  LIABILITY: { label: "Liability", labelAr: "التزامات",     color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",       dot: "bg-red-500" },
  EQUITY:    { label: "Equity",    labelAr: "حقوق الملكية", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500" },
  REVENUE:   { label: "Revenue",   labelAr: "إيرادات",      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  EXPENSE:   { label: "Expense",   labelAr: "مصروفات",      color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",  dot: "bg-orange-500" },
};

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0 min-w-[140px]">{label}</span>
      <span className={cn("text-sm font-medium text-end", mono && "font-mono")}>{value}</span>
    </div>
  );
}

export default function ChartOfAccountDetail({ params }: { params: { id: string } }) {
  const { lang, dir, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Data
  const detailQuery = useGetChartOfAccount(params.id);
  const account = detailQuery.data as any;

  // Mutations
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetChartOfAccountsTreeQueryKey({}) });
    queryClient.invalidateQueries({ queryKey: getGetChartOfAccountQueryKey(params.id) });
  };

  const updateMutation = useUpdateChartOfAccount();
  const deleteMutation = useDeleteChartOfAccount();
  const toggleMutation = useToggleChartOfAccountActive();

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<UpdateChartOfAccountInput>>({});

  const openEdit = () => {
    if (!account) return;
    setEditForm({
      code: account.code,
      nameEn: account.nameEn,
      nameAr: account.nameAr,
      type: account.type,
      nature: account.nature,
      isGroup: account.isGroup,
      notes: account.notes || "",
    });
    setEditOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(
      { id: params.id, data: editForm },
      {
        onSuccess: () => {
          toast({ title: lang === "ar" ? "تم تحديث الحساب" : "Account updated" });
          setEditOpen(false);
          invalidate();
        },
        onError: (err: any) => {
          toast({
            title: err?.response?.data?.error || (lang === "ar" ? "حدث خطأ" : "Error"),
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { id: params.id },
      {
        onSuccess: () => {
          toast({ title: lang === "ar" ? "تم حذف الحساب" : "Account deleted" });
          setLocation("/chart-of-accounts");
        },
        onError: (err: any) => {
          toast({
            title: err?.response?.data?.error || (lang === "ar" ? "حدث خطأ" : "Error"),
            variant: "destructive",
          });
          setDeleteOpen(false);
        },
      }
    );
  };

  const handleToggleActive = () => {
    toggleMutation.mutate(
      { id: params.id },
      {
        onSuccess: () => {
          toast({ title: lang === "ar" ? "تم تغيير حالة الحساب" : "Account status updated" });
          invalidate();
        },
        onError: (err: any) => {
          toast({
            title: err?.response?.data?.error || (lang === "ar" ? "حدث خطأ" : "Error"),
            variant: "destructive",
          });
        },
      }
    );
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500" dir={dir}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !account) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500" dir={dir}>
        <Link href="/chart-of-accounts" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          {dir === "rtl" ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          {t("coa.detail.back")}
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="font-medium">{t("common.error")}</p>
        </div>
      </div>
    );
  }

  const typeCfg = TYPE_CONFIG[account.type as AccountType];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir={dir}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">{t("nav.dashboard")}</Link>
        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
        <Link href="/chart-of-accounts" className="hover:text-foreground transition-colors">{t("coa.title")}</Link>
        {account.parent && (
          <>
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            <Link href={`/chart-of-accounts/${account.parent.id}`} className="hover:text-foreground transition-colors font-mono">
              {account.parent.code}
            </Link>
          </>
        )}
        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
        <span className="font-mono font-medium text-foreground">{account.code}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", typeCfg?.color)}>
            <Hash className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{lang === "ar" ? account.nameAr : account.nameEn}</h1>
              {!account.isActive && (
                <Badge variant="secondary" className="text-xs">{t("coa.badge.inactive")}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-muted-foreground text-sm">{account.code}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", typeCfg?.color)}>
                {lang === "ar" ? typeCfg?.labelAr : typeCfg?.label}
              </span>
              <Badge variant="outline" className="text-xs">
                {account.nature === "DEBIT" ? t("coa.nature.DEBIT") : t("coa.nature.CREDIT")}
              </Badge>
              {account.isGroup ? (
                <Badge variant="secondary" className="text-xs">{t("coa.badge.group")}</Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-dashed">{t("coa.badge.leaf")}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleActive}
            disabled={toggleMutation.isPending}
            data-testid="button-toggle-active"
          >
            {account.isActive ? (
              <><ToggleRight className="w-4 h-4 ltr:mr-2 rtl:ml-2 text-emerald-600" />{t("coa.deactivate")}</>
            ) : (
              <><ToggleLeft className="w-4 h-4 ltr:mr-2 rtl:ml-2" />{t("coa.activate")}</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openEdit}
            data-testid="button-edit"
          >
            <Pencil className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
            {t("common.edit")}
          </Button>
          {account.transactionCount === 0 && (!account.children || account.children.length === 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              data-testid="button-delete"
            >
              <Trash2 className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Account Information */}
        <Card className="lg:col-span-2 shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              {t("coa.detail.info")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t("coa.code")} value={account.code} mono />
            <InfoRow label={t("coa.nameEn")} value={account.nameEn} />
            <InfoRow label={t("coa.nameAr")} value={<span dir="rtl">{account.nameAr}</span>} />
            <InfoRow
              label={t("coa.type")}
              value={
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", typeCfg?.color)}>
                  {lang === "ar" ? typeCfg?.labelAr : typeCfg?.label}
                </span>
              }
            />
            <InfoRow
              label={t("coa.nature")}
              value={account.nature === "DEBIT" ? t("coa.nature.DEBIT") : t("coa.nature.CREDIT")}
            />
            <InfoRow label={t("coa.level")} value={`${t("coa.level")} ${account.level}`} />
            <InfoRow
              label={t("coa.isGroup")}
              value={account.isGroup ? t("common.yes") : t("common.no")}
            />
            <InfoRow
              label={t("coa.allowDirectEntry")}
              value={account.allowDirectEntry ? t("common.yes") : t("common.no")}
            />
            <InfoRow
              label={t("coa.isActive")}
              value={
                <Badge
                  variant={account.isActive ? "default" : "secondary"}
                  className={account.isActive ? "bg-emerald-500/10 text-emerald-600" : ""}
                >
                  {account.isActive ? t("coa.badge.active") : t("coa.badge.inactive")}
                </Badge>
              }
            />
            {account.parent && (
              <InfoRow
                label={t("coa.parent")}
                value={
                  <Link
                    href={`/chart-of-accounts/${account.parent.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {account.parent.code} — {lang === "ar" ? account.parent.nameAr : account.parent.nameEn}
                  </Link>
                }
              />
            )}
            {account.notes && (
              <InfoRow label={t("coa.notes")} value={account.notes} />
            )}
          </CardContent>
        </Card>

        {/* Stats sidebar */}
        <div className="space-y-4">
          {/* Transactions */}
          <Card className="shadow-sm border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ReceiptText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{account.transactionCount}</p>
                  <p className="text-xs text-muted-foreground">{t("coa.transactionCount")}</p>
                </div>
              </div>
              {account.transactionCount > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded px-2 py-1 mt-2">
                  {lang === "ar"
                    ? "لا يمكن حذف هذا الحساب لوجود قيود مرتبطة به"
                    : "This account cannot be deleted because it has linked transactions"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Sub-accounts count */}
          <Card className="shadow-sm border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <GitBranch className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{account.children?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("coa.children")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {account.notes && (
            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  {t("coa.notes")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{account.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Sub-accounts */}
      {account.children && account.children.length > 0 && (
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              {t("coa.detail.subAccounts")}
              <Badge variant="secondary" className="ml-auto text-xs">{account.children.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/30">
              {account.children.map((child: any) => {
                const childTypeCfg = TYPE_CONFIG[child.type as AccountType];
                return (
                  <Link
                    key={child.id}
                    href={`/chart-of-accounts/${child.id}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-muted/30 rounded-md px-2 transition-colors"
                    data-testid={`child-account-${child.id}`}
                  >
                    <span className={cn("w-2 h-2 rounded-full shrink-0", childTypeCfg?.dot)} />
                    <span className="font-mono text-sm text-muted-foreground w-16 shrink-0">{child.code}</span>
                    <span className="font-medium text-sm flex-1">{lang === "ar" ? child.nameAr : child.nameEn}</span>
                    {child.isGroup ? (
                      <Badge variant="secondary" className="text-xs">{t("coa.badge.group")}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-dashed">{t("coa.badge.leaf")}</Badge>
                    )}
                    {!child.isActive && (
                      <Badge variant="secondary" className="text-xs">{t("coa.badge.inactive")}</Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir={dir}>
          <DialogHeader>
            <DialogTitle>{t("coa.edit")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-code">{t("coa.code")}</Label>
              <Input
                id="edit-code"
                data-testid="edit-input-code"
                value={editForm.code || ""}
                onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))}
                className="font-mono"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("coa.nameEn")}</Label>
                <Input
                  data-testid="edit-input-name-en"
                  value={editForm.nameEn || ""}
                  onChange={(e) => setEditForm((p) => ({ ...p, nameEn: e.target.value }))}
                  dir="ltr"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("coa.nameAr")}</Label>
                <Input
                  data-testid="edit-input-name-ar"
                  value={editForm.nameAr || ""}
                  onChange={(e) => setEditForm((p) => ({ ...p, nameAr: e.target.value }))}
                  dir="rtl"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("coa.type")}</Label>
                <Select
                  value={editForm.type || ""}
                  onValueChange={(v) => setEditForm((p) => ({ ...p, type: v as AccountType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_CONFIG) as AccountType[]).map((t_) => (
                      <SelectItem key={t_} value={t_}>
                        {lang === "ar" ? TYPE_CONFIG[t_].labelAr : TYPE_CONFIG[t_].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("coa.nature")}</Label>
                <Select
                  value={editForm.nature || ""}
                  onValueChange={(v) => setEditForm((p) => ({ ...p, nature: v as AccountNature }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">{t("coa.nature.DEBIT")}</SelectItem>
                    <SelectItem value="CREDIT">{t("coa.nature.CREDIT")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
              <Switch
                id="edit-isGroup"
                checked={!!editForm.isGroup}
                onCheckedChange={(v) => setEditForm((p) => ({ ...p, isGroup: v }))}
              />
              <Label htmlFor="edit-isGroup" className="cursor-pointer">{t("coa.isGroup")}</Label>
            </div>
            <div className="space-y-1.5">
              <Label>{t("coa.notes")}</Label>
              <Textarea
                value={(editForm.notes as string) || ""}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("coa.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("coa.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("coa.confirmDelete.desc")}
              <span className="block mt-2 font-mono font-medium text-foreground">
                {account.code} — {lang === "ar" ? account.nameAr : account.nameEn}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t("coa.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
