import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import { unwrapPaginatedList } from "@/lib/paginated-list";
import { BankingListError } from "./BankingListError";
import {
  useCreatePayment,
  useUpdatePayment,
  useListBankAccounts,
  useListCashBoxes,
  useListChartOfAccounts,
} from "@workspace/api-client-react";
import type { BankAccount, CashBox, Payment } from "@workspace/api-client-react";
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

const METHOD_OPTIONS = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "CREDIT_CARD",
  "ONLINE",
  "OTHER",
] as const;

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment?: Payment | null;
  onSuccess: () => void;
}

export function PaymentFormDialog({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: PaymentFormDialogProps) {
  const { lang, t } = useLanguage();
  const { toast } = useToast();
  const isEdit = !!payment;

  // ── Form state ──────────────────────────────────────────────────────────────
  const [paymentDate, setPaymentDate]     = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [amount, setAmount]               = useState("");
  const [currencyCode, setCurrencyCode]   = useState("SAR");
  const [exchangeRate, setExchangeRate]   = useState("1");
  const [bankAccountId, setBankAccountId] = useState("");
  const [cashBoxId, setCashBoxId]         = useState("");
  const [glAccountId, setGlAccountId]     = useState("");
  const [payeeName, setPayeeName]         = useState("");
  const [payeeNameAr, setPayeeNameAr]     = useState("");
  const [reference, setReference]         = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [chequeNumber, setChequeNumber]   = useState("");
  const [chequeDate, setChequeDate]       = useState("");
  const [chequeBankName, setChequeBankName] = useState("");
  const [errors, setErrors]               = useState<Record<string, string>>({});

  // ── Reset on open / payment change ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (payment) {
      setPaymentDate(payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : "");
      setPaymentMethod(payment.paymentMethod ?? "BANK_TRANSFER");
      setAmount(String(payment.amount ?? ""));
      setCurrencyCode(payment.currencyCode ?? "SAR");
      setExchangeRate(String(payment.exchangeRate ?? "1"));
      setBankAccountId(payment.bankAccountId ?? "");
      setCashBoxId(payment.cashBoxId ?? "");
      setGlAccountId((payment as any).glAccountId ?? "");
      setPayeeName(payment.payeeName ?? "");
      setPayeeNameAr(payment.payeeNameAr ?? "");
      setReference(payment.reference ?? "");
      setDescriptionEn(payment.descriptionEn ?? "");
      setDescriptionAr(payment.descriptionAr ?? "");
      setChequeNumber(payment.chequeNumber ?? "");
      setChequeDate(payment.chequeDate ? new Date(payment.chequeDate).toISOString().slice(0, 10) : "");
      setChequeBankName(payment.chequeBankName ?? "");
    } else {
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setPaymentMethod("BANK_TRANSFER");
      setAmount("");
      setCurrencyCode("SAR");
      setExchangeRate("1");
      setBankAccountId("");
      setCashBoxId("");
      setGlAccountId("");
      setPayeeName("");
      setPayeeNameAr("");
      setReference("");
      setDescriptionEn("");
      setDescriptionAr("");
      setChequeNumber("");
      setChequeDate("");
      setChequeBankName("");
    }
    setErrors({});
  }, [open, payment]);

  // ── Data hooks ───────────────────────────────────────────────────────────────
  const { data: bankAccountsRaw, isLoading: loadingBanks, isError: bankAccountsError, refetch: refetchBanks } = useListBankAccounts();
  const { data: cashBoxesRaw, isLoading: loadingBoxes, isError: cashBoxesError, refetch: refetchBoxes } = useListCashBoxes();
  const { data: coaRaw,           isLoading: loadingCoa    } = useListChartOfAccounts();

  const activeBankAccounts = unwrapPaginatedList<BankAccount>(bankAccountsRaw).filter((b) => b.isActive && !b.deletedAt);
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

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMutation = useCreatePayment();
  const updateMutation = useUpdatePayment();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const isCash   = paymentMethod === "CASH";
  const isCheque = paymentMethod === "CHEQUE";

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!paymentDate)
      errs.paymentDate = lang === "ar" ? "التاريخ مطلوب" : "Date is required";
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0)
      errs.amount = lang === "ar" ? "مبلغ صحيح مطلوب" : "A valid amount is required";
    if (!isCash && !bankAccountId)
      errs.bankAccountId = lang === "ar" ? "الحساب البنكي مطلوب" : "Bank account is required";
    if (isCash && !cashBoxId)
      errs.cashBoxId = lang === "ar" ? "الصندوق مطلوب" : "Cash box is required";
    if (isCheque && !chequeNumber)
      errs.chequeNumber = lang === "ar" ? "رقم الشيك مطلوب" : "Cheque number is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!validate()) return;

    const base = {
      paymentDate:   new Date(paymentDate) as any,
      paymentMethod: paymentMethod as any,
      amount:        parseFloat(amount),
      currencyCode:  currencyCode || "SAR",
      exchangeRate:  parseFloat(exchangeRate) || 1,
      bankAccountId: !isCash ? (bankAccountId || undefined) : undefined,
      cashBoxId:     isCash  ? (cashBoxId    || undefined) : undefined,
      payeeName:     payeeName    || undefined,
      payeeNameAr:   payeeNameAr  || undefined,
      reference:     reference    || undefined,
      descriptionEn: descriptionEn || undefined,
      descriptionAr: descriptionAr || undefined,
      chequeNumber:  isCheque ? (chequeNumber   || undefined) : undefined,
      chequeDate:    isCheque && chequeDate ? new Date(chequeDate) as any : undefined,
      chequeBankName: isCheque ? (chequeBankName || undefined) : undefined,
    };

    if (isEdit && payment) {
      updateMutation.mutate(
        { id: payment.id, data: base },
        {
          onSuccess: () => {
            toast({ title: lang === "ar" ? "تم تحديث المدفوعة" : "Payment updated" });
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
    } else {
      createMutation.mutate(
        { ...base, glAccountId: glAccountId || undefined } as any,
        {
          onSuccess: () => {
            toast({ title: lang === "ar" ? "تم إنشاء المدفوعة" : "Payment created" });
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
    }
  };

  const lbl = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? lbl("Edit Payment", "تعديل المدفوعة")
              : lbl("New Payment", "مدفوعة جديدة")}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] overflow-y-auto pe-2">
          <div className="space-y-5 py-1 px-1">

            {/* Row 1 — Date + Method */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pmt-date">
                  {t("banking.date")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pmt-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className={errors.paymentDate ? "border-destructive" : ""}
                />
                {errors.paymentDate && (
                  <p className="text-xs text-destructive">{errors.paymentDate}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pmt-method">
                  {t("banking.paymentMethod")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => { setPaymentMethod(v); setBankAccountId(""); setCashBoxId(""); }}
                >
                  <SelectTrigger id="pmt-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>{t(`banking.paymentMethod.${m}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2 — Amount + Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pmt-amount">
                  {t("banking.amount")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pmt-amount"
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
              <div className="space-y-1.5">
                <Label htmlFor="pmt-currency">{lbl("Currency", "العملة")}</Label>
                <Input
                  id="pmt-currency"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="SAR"
                />
              </div>
            </div>

            {/* Exchange rate — only when currency ≠ SAR */}
            {currencyCode && currencyCode !== "SAR" && (
              <div className="space-y-1.5">
                <Label htmlFor="pmt-rate">{lbl("Exchange Rate", "سعر الصرف")}</Label>
                <Input
                  id="pmt-rate"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
              </div>
            )}

            {/* Bank Account or Cash Box */}
            {!isCash ? (
              <div className="space-y-1.5">
                <Label htmlFor="pmt-bank">
                  {lbl("Bank Account", "الحساب البنكي")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                {loadingBanks ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm h-9">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                  </div>
                ) : bankAccountsError ? (
                  <BankingListError
                    message={lbl("Could not load bank accounts.", "تعذر تحميل الحسابات البنكية.")}
                    retryLabel={lbl("Retry", "إعادة المحاولة")}
                    onRetry={() => void refetchBanks()}
                  />
                ) : (
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger
                      id="pmt-bank"
                      className={errors.bankAccountId ? "border-destructive" : ""}
                    >
                      <SelectValue placeholder={lbl("Select bank account…", "اختر حساباً بنكياً…")} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeBankAccounts.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          {lbl("No active bank accounts", "لا توجد حسابات بنكية نشطة")}
                        </SelectItem>
                      ) : (
                        activeBankAccounts.map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>
                            <span className="font-medium">
                              {lang === "ar" ? b.accountNameAr : b.accountNameEn}
                            </span>
                            <span className="text-muted-foreground ms-2 text-xs">{b.accountNumber}</span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                {errors.bankAccountId && (
                  <p className="text-xs text-destructive">{errors.bankAccountId}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="pmt-cashbox">
                  {lbl("Cash Box", "الصندوق النقدي")}{" "}
                  <span className="text-destructive">*</span>
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
                      id="pmt-cashbox"
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
            )}

            {/* GL Account — create mode only */}
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>{t("banking.glAccount")}</Label>
                {loadingCoa ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm h-9">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                  </div>
                ) : (
                  <AccountPicker
                    id="pmt-gl"
                    value={glAccountId}
                    onChange={(id) => setGlAccountId(id)}
                    accounts={glAccounts}
                    placeholder={t("banking.glAccount.placeholder")}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {lbl(
                    "The contra account for the auto-generated journal entry.",
                    "الحساب المقابل في القيد المحاسبي التلقائي."
                  )}
                </p>
              </div>
            )}

            <Separator />

            {/* Payee info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pmt-payee">{t("banking.payee")} (EN)</Label>
                <Input
                  id="pmt-payee"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="Vendor / Organization name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pmt-payee-ar">{t("banking.payee")} (AR)</Label>
                <Input
                  id="pmt-payee-ar"
                  dir="rtl"
                  value={payeeNameAr}
                  onChange={(e) => setPayeeNameAr(e.target.value)}
                  placeholder="اسم المورد / المنظمة"
                />
              </div>
            </div>

            {/* Reference */}
            <div className="space-y-1.5">
              <Label htmlFor="pmt-ref">{lbl("Reference", "المرجع")}</Label>
              <Input
                id="pmt-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. INV-2026-001"
              />
            </div>

            {/* Description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pmt-desc-en">{t("banking.description")} (EN)</Label>
                <Textarea
                  id="pmt-desc-en"
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  rows={2}
                  placeholder="Optional description…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pmt-desc-ar">{t("banking.description")} (AR)</Label>
                <Textarea
                  id="pmt-desc-ar"
                  dir="rtl"
                  value={descriptionAr}
                  onChange={(e) => setDescriptionAr(e.target.value)}
                  rows={2}
                  placeholder="وصف اختياري…"
                />
              </div>
            </div>

            {/* Cheque fields — conditional */}
            {isCheque && (
              <>
                <Separator />
                <p className="text-sm font-medium text-muted-foreground">
                  {lbl("Cheque Details", "تفاصيل الشيك")}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pmt-cheque-num">
                      {lbl("Cheque Number", "رقم الشيك")}{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="pmt-cheque-num"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      className={errors.chequeNumber ? "border-destructive" : ""}
                    />
                    {errors.chequeNumber && (
                      <p className="text-xs text-destructive">{errors.chequeNumber}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pmt-cheque-date">{lbl("Cheque Date", "تاريخ الشيك")}</Label>
                    <Input
                      id="pmt-cheque-date"
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pmt-cheque-bank">
                    {lbl("Bank Name on Cheque", "اسم البنك على الشيك")}
                  </Label>
                  <Input
                    id="pmt-cheque-bank"
                    value={chequeBankName}
                    onChange={(e) => setChequeBankName(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
                {t("banking.saving")}
              </>
            ) : isEdit ? (
              t("common.save")
            ) : (
              lbl("Create Payment", "إنشاء مدفوعة")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
