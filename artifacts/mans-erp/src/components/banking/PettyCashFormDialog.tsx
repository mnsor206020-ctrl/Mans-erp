import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import { unwrapPaginatedList } from "@/lib/paginated-list";
import { BankingListError } from "./BankingListError";
import type { CashBox } from "@workspace/api-client-react";
import {
  useCreatePettyCash,
  useListCashBoxes,
  useListChartOfAccounts,
  useListCostCenters,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AccountPicker } from "@/components/journal-entries/AccountPicker";
import { Loader2 } from "lucide-react";

interface PettyCashFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PettyCashFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: PettyCashFormDialogProps) {
  const { lang, t } = useLanguage();
  const { toast } = useToast();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [transactionDate, setTransactionDate] = useState("");
  const [type, setType]                       = useState<"IN" | "OUT">("IN");
  const [amount, setAmount]                   = useState("");
  const [cashBoxId, setCashBoxId]             = useState("");
  const [glAccountId, setGlAccountId]         = useState("");
  const [costCenterId, setCostCenterId]       = useState("");
  const [reference, setReference]             = useState("");
  const [descriptionEn, setDescriptionEn]     = useState("");
  const [descriptionAr, setDescriptionAr]     = useState("");
  const [errors, setErrors]                   = useState<Record<string, string>>({});

  // ── Reset on open ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setType("IN");
    setAmount("");
    setCashBoxId("");
    setGlAccountId("");
    setCostCenterId("");
    setReference("");
    setDescriptionEn("");
    setDescriptionAr("");
    setErrors({});
  }, [open]);

  // ── Data hooks ───────────────────────────────────────────────────────────────
  const { data: cashBoxesRaw, isLoading: loadingBoxes, isError: cashBoxesError, refetch: refetchBoxes } = useListCashBoxes();
  const { data: coaRaw,          isLoading: loadingCoa   } = useListChartOfAccounts();
  const { data: costCentersRaw,  isLoading: loadingCC    } = useListCostCenters();

  const activeCashBoxes = unwrapPaginatedList<CashBox>(cashBoxesRaw).filter((c) => c.isActive && !c.deletedAt);
  const glAccounts = ((coaRaw as any)?.data ?? (Array.isArray(coaRaw) ? coaRaw : []) as any[])
    .filter((a: any) => a.isActive && !a.isGroup && a.allowDirectEntry && !a.deletedAt)
    .map((a: any) => ({
      id:               a.id,
      code:             a.code,
      nameEn:           a.nameEn,
      nameAr:           a.nameAr,
      isGroup:          a.isGroup,
      isActive:         a.isActive,
      allowDirectEntry: a.allowDirectEntry,
    }));
  const activeCostCenters = (Array.isArray(costCentersRaw) ? costCentersRaw : [])
    .filter((c: any) => c.isActive);

  // ── Mutation ─────────────────────────────────────────────────────────────────
  const createMutation = useCreatePettyCash();

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!transactionDate)
      errs.transactionDate = lang === "ar" ? "التاريخ مطلوب" : "Date is required";
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0)
      errs.amount = lang === "ar" ? "مبلغ صحيح مطلوب" : "A valid amount is required";
    if (!cashBoxId)
      errs.cashBoxId = lang === "ar" ? "الصندوق مطلوب" : "Cash box is required";
    if (!descriptionEn.trim())
      errs.descriptionEn = lang === "ar" ? "الوصف (إنجليزي) مطلوب" : "English description is required";
    if (!descriptionAr.trim())
      errs.descriptionAr = lang === "ar" ? "الوصف (عربي) مطلوب" : "Arabic description is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!validate()) return;
    createMutation.mutate(
      {
        transactionDate: new Date(transactionDate) as any,
        type,
        amount: parseFloat(amount),
        cashBoxId,
        descriptionEn: descriptionEn.trim(),
        descriptionAr: descriptionAr.trim(),
        reference:     reference.trim() || undefined,
        glAccountId:   glAccountId      || undefined,
        costCenterId:  costCenterId     || undefined,
      } as any,
      {
        onSuccess: () => {
          toast({ title: lang === "ar" ? "تم إنشاء القيد" : "Entry created" });
          onOpenChange(false);
          onSuccess();
        },
        onError: (err: any) => {
          toast({
            title: err?.response?.data?.error ?? t("common.error"),
            variant: "destructive",
          });
        },
      }
    );
  };

  const lbl = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{lbl("New Petty Cash Entry", "قيد عهدة نثرية جديد")}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] overflow-y-auto pe-2">
          <div className="space-y-5 py-1 px-1">

            {/* Row 1 — Date + Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pc-date">
                  {t("banking.date")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pc-date"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className={errors.transactionDate ? "border-destructive" : ""}
                />
                {errors.transactionDate && (
                  <p className="text-xs text-destructive">{errors.transactionDate}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-type">
                  {lbl("Type", "النوع")} <span className="text-destructive">*</span>
                </Label>
                <Select value={type} onValueChange={(v) => setType(v as "IN" | "OUT")}>
                  <SelectTrigger id="pc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">{t("banking.type.IN")}</SelectItem>
                    <SelectItem value="OUT">{t("banking.type.OUT")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="pc-amount">
                {t("banking.amount")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pc-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={errors.amount ? "border-destructive" : ""}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount}</p>
              )}
            </div>

            {/* Cash Box */}
            <div className="space-y-1.5">
              <Label htmlFor="pc-cashbox">
                {lbl("Cash Box", "الصندوق النقدي")} <span className="text-destructive">*</span>
              </Label>
              {loadingBoxes ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm h-9">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                </div>
              ) : cashBoxesError ? (
                <BankingListError
                  message={lbl("Could not load cash boxes.", "تعذر تحميل الصناديق النقدية.")}
                  retryLabel={lbl("Retry", "إعادة المحاولة")}
                  onRetry={() => void refetchBoxes()}
                />
              ) : (
                <Select value={cashBoxId} onValueChange={setCashBoxId}>
                  <SelectTrigger
                    id="pc-cashbox"
                    className={errors.cashBoxId ? "border-destructive" : ""}
                  >
                    <SelectValue placeholder={lbl("Select cash box…", "اختر صندوقاً نقدياً…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCashBoxes.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        {lbl("No active cash boxes", "لا توجد صناديق نقدية نشطة")}
                      </SelectItem>
                    ) : (
                      activeCashBoxes.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-medium">
                            {lang === "ar" ? c.nameAr : c.nameEn}
                          </span>
                          <span className="text-muted-foreground ms-2 text-xs">{c.code}</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              {errors.cashBoxId && (
                <p className="text-xs text-destructive">{errors.cashBoxId}</p>
              )}
            </div>

            {/* GL Account */}
            <div className="space-y-1.5">
              <Label>{t("banking.glAccount")}</Label>
              {loadingCoa ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm h-9">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                </div>
              ) : (
                <AccountPicker
                  id="pc-gl"
                  value={glAccountId}
                  onChange={(id) => setGlAccountId(id)}
                  accounts={glAccounts}
                  placeholder={t("banking.glAccount.placeholder")}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {lbl(
                  "Contra account for the auto-generated journal entry.",
                  "الحساب المقابل في القيد المحاسبي التلقائي."
                )}
              </p>
            </div>

            {/* Cost Center */}
            {activeCostCenters.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="pc-cc">{t("je.costCenter")}</Label>
                {loadingCC ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm h-9">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                  </div>
                ) : (
                  <Select value={costCenterId} onValueChange={setCostCenterId}>
                    <SelectTrigger id="pc-cc">
                      <SelectValue placeholder={lbl("Select cost center…", "اختر مركز تكلفة…")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{lbl("None", "بدون")}</SelectItem>
                      {activeCostCenters.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-mono text-xs text-muted-foreground me-1">{c.code}</span>
                          {lang === "ar" ? c.nameAr : c.nameEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <Separator />

            {/* Reference */}
            <div className="space-y-1.5">
              <Label htmlFor="pc-ref">{lbl("Reference", "المرجع")}</Label>
              <Input
                id="pc-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. RCV-001"
              />
            </div>

            {/* Description EN */}
            <div className="space-y-1.5">
              <Label htmlFor="pc-desc-en">
                {t("banking.description")} (EN) <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="pc-desc-en"
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                rows={2}
                placeholder="Description in English…"
                className={errors.descriptionEn ? "border-destructive" : ""}
              />
              {errors.descriptionEn && (
                <p className="text-xs text-destructive">{errors.descriptionEn}</p>
              )}
            </div>

            {/* Description AR */}
            <div className="space-y-1.5">
              <Label htmlFor="pc-desc-ar">
                {t("banking.description")} (AR) <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="pc-desc-ar"
                dir="rtl"
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                rows={2}
                placeholder="الوصف بالعربية…"
                className={errors.descriptionAr ? "border-destructive" : ""}
              />
              {errors.descriptionAr && (
                <p className="text-xs text-destructive">{errors.descriptionAr}</p>
              )}
            </div>

          </div>
        </ScrollArea>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
                {t("banking.saving")}
              </>
            ) : (
              lbl("Create Entry", "إنشاء قيد")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
