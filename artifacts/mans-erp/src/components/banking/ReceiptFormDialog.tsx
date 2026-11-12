import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import { unwrapPaginatedList } from "@/lib/paginated-list";
import { BankingListError } from "./BankingListError";
import {
  useCreateReceipt,
  useUpdateReceipt,
  useListBankAccounts,
  useListCashBoxes,
  useListChartOfAccounts,
} from "@workspace/api-client-react";
import type { BankAccount, CashBox, Receipt, ReceiptCreate } from "@workspace/api-client-react";
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

interface ReceiptFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt?: Receipt | null;
  onSuccess: () => void;
}

export function ReceiptFormDialog({
  open,
  onOpenChange,
  receipt,
  onSuccess,
}: ReceiptFormDialogProps) {
  const { lang, t } = useLanguage();
  const { toast } = useToast();
  const isEdit = !!receipt;

  // ── Form state ──────────────────────────────────────────────────────────────
  const [receiptDate, setReceiptDate]     = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [amount, setAmount]               = useState("");
  const [currencyCode, setCurrencyCode]   = useState("SAR");
  const [exchangeRate, setExchangeRate]   = useState("1");
  const [bankAccountId, setBankAccountId] = useState("");
  const [cashBoxId, setCashBoxId]         = useState("");
  const [glAccountId, setGlAccountId]     = useState("");
  const [payerName, setPayerName]         = useState("");
  const [payerNameAr, setPayerNameAr]     = useState("");
  const [reference, setReference]         = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [chequeNumber, setChequeNumber]   = useState("");
  const [chequeDate, setChequeDate]       = useState("");
  const [chequeBankName, setChequeBankName] = useState("");
  const [errors, setErrors]               = useState<Record<string, string>>({});

  // ── Reset form on open / receipt change ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (receipt) {
      setReceiptDate(receipt.receiptDate ? new Date(receipt.receiptDate).toISOString().slice(0, 10) : "");
      setPaymentMethod(receipt.paymentMethod ?? "BANK_TRANSFER");
      setAmount(String(receipt.amount ?? ""));
      setCurrencyCode(receipt.currencyCode ?? "SAR");
      setExchangeRate(String(receipt.exchangeRate ?? "1"));
      setBankAccountId(receipt.bankAccountId ?? "");
      setCashBoxId(receipt.cashBoxId ?? "");
      setGlAccountId((receipt as any).glAccountId ?? "");
      setPayerName(receipt.payerName ?? "");
      setPayerNameAr(receipt.payerNameAr ?? "");
      setReference(receipt.reference ?? "");
      setDescriptionEn(receipt.descriptionEn ?? "");
      setDescriptionAr(receipt.descriptionAr ?? "");
      setChequeNumber(receipt.chequeNumber ?? "");
      setChequeDate(receipt.chequeDate ? new Date(receipt.chequeDate).toISOString().slice(0, 10) : "");
      setChequeBankName(receipt.chequeBankName ?? "");
    } else {
      setReceiptDate(new Date().toISOString().slice(0, 10));
      setPaymentMethod("BANK_TRANSFER");
      setAmount("");
      setCurrencyCode("SAR");
      setExchangeRate("1");
      setBankAccountId("");
      setCashBoxId("");
      setGlAccountId("");
      setPayerName("");
      setPayerNameAr("");
      setReference("");
      setDescriptionEn("");
      setDescriptionAr("");
      setChequeNumber("");
      setChequeDate("");
      setChequeBankName("");
    }
    setErrors({});
  }, [open, receipt]);

  // ── Data hooks ───────────────────────────────────────────────────────────────
  const { data: bankAccountsRaw, isLoading: loadingBanks, isError: bankAccountsError, refetch: refetchBanks } = useListBankAccounts();
  const { data: cashBoxesRaw, isLoading: loadingBoxes, isError: cashBoxesError, refetch: refetchBoxes } = useListCashBoxes();
  const { data: coaRaw,           isLoading: loadingCoa    } = useListChartOfAccounts();

  const activeBankAccounts = unwrapPaginatedList<BankAccount>(bankAccountsRaw).filter((b) => b.isActive && !b.deletedAt);
  const activeCashBoxes = unwrapPaginatedList<CashBox>(cashBoxesRaw).filter((c) => c.isActive && !c.deletedAt);
  const glAccounts = ((coaRaw as any)?.data ?? (Array.isArray(coaRaw) ? coaRaw : []) as any[])
    .filter((a: any) => a.isActive && !a.isGroup && a.allowDirectEntry && !a.deletedAt)
    .map((a: any) => ({
      id:              a.id,
      code:            a.code,
      nameEn:          a.nameEn,
      nameAr:          a.nameAr,
      isGroup:         a.isGroup,
      isActive:        a.isActive,
      allowDirectEntry: a.allowDirectEntry,
    }));

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMutation = useCreateReceipt();
  const updateMutation = useUpdateReceipt();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const isCash   = paymentMethod === "CASH";
  const isCheque = paymentMethod === "CHEQUE";

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!receiptDate) errs.receiptDate = lang === "ar" ? "التاريخ مطلوب" : "Date is required";
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

    const base: ReceiptCreate = {
      receiptDate:   new Date(receiptDate).toISOString(),
      paymentMethod: paymentMethod as ReceiptCreate["paymentMethod"],
      amount:        parseFloat(amount),
      currencyCode:  currencyCode || "SAR",
      exchangeRate:  parseFloat(exchangeRate) || 1,
      bankAccountId: !isCash ? (bankAccountId || undefined) : undefined,
      cashBoxId:     isCash  ? (cashBoxId    || undefined) : undefined,
      payerName:     payerName    || undefined,
      payerNameAr:   payerNameAr  || undefined,
      reference:     reference    || undefined,
      descriptionEn: descriptionEn || undefined,
      descriptionAr: descriptionAr || undefined,
      chequeNumber:  isCheque ? (chequeNumber  || undefined) : undefined,
      chequeDate:    isCheque && chequeDate ? new Date(chequeDate).toISOString() : undefined,
      chequeBankName: isCheque ? (chequeBankName || undefined) : undefined,
    };

    if (isEdit && receipt) {
      updateMutation.mutate(
        { id: receipt.id, data: base },
        {
          onSuccess: () => {
            toast({ title: lang === "ar" ? "تم تحديث المقبوضة" : "Receipt updated" });
            onOpenChange(false);
            onSuccess();
          },
          onError: (err) => {
            toast({
              title: err.message || t("common.error"),
              variant: "destructive",
            });
          },
        }
      );
    } else {
      createMutation.mutate(
        { data: { ...base, glAccountId: glAccountId || undefined } },
        {
          onSuccess: () => {
            toast({ title: lang === "ar" ? "تم إنشاء المقبوضة" : "Receipt created" });
            onOpenChange(false);
            onSuccess();
          },
          onError: (err) => {
            toast({
              title: err.message || t("common.error"),
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  // ── Label helpers ─────────────────────────────────────────────────────────────
  const lbl = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? lbl("Edit Receipt", "تعديل المقبوضة")
              : lbl("New Receipt", "مقبوضة جديدة")}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] overflow-y-auto pe-2">
          <div className="space-y-5 py-1 px-1">

            {/* Row 1 — Date + Method */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rcpt-date">
                  {t("banking.date")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rcpt-date"
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className={errors.receiptDate ? "border-destructive" : ""}
                />
                {errors.receiptDate && (
                  <p className="text-xs text-destructive">{errors.receiptDate}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rcpt-method">
                  {t("banking.paymentMethod")} <span className="text-destructive">*</span>
                </Label>
                <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); setBankAccountId(""); setCashBoxId(""); }}>
                  <SelectTrigger id="rcpt-method">
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
                <Label htmlFor="rcpt-amount">
                  {t("banking.amount")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rcpt-amount"
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
                <Label htmlFor="rcpt-currency">{lbl("Currency", "العملة")}</Label>
                <Input
                  id="rcpt-currency"
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
                <Label htmlFor="rcpt-rate">{lbl("Exchange Rate", "سعر الصرف")}</Label>
                <Input
                  id="rcpt-rate"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
              </div>
            )}

            {/* Bank Account or Cash Box — based on method */}
            {!isCash ? (
              <div className="space-y-1.5">
                <Label htmlFor="rcpt-bank">
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
                    <SelectTrigger id="rcpt-bank" className={errors.bankAccountId ? "border-destructive" : ""}>
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
                <Label htmlFor="rcpt-cashbox">
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
                    <SelectTrigger id="rcpt-cashbox" className={errors.cashBoxId ? "border-destructive" : ""}>
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

            {/* GL Account — create mode only (can't change after creation) */}
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>{t("banking.glAccount")}</Label>
                {loadingCoa ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm h-9">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                  </div>
                ) : (
                  <AccountPicker
                    id="rcpt-gl"
                    value={glAccountId}
                    onChange={(id) => setGlAccountId(id)}
                    accounts={glAccounts}
                    placeholder={t("banking.glAccount.placeholder")}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {lbl("The contra account for the auto-generated journal entry.", "الحساب المقابل في القيد المحاسبي التلقائي.")}
                </p>
              </div>
            )}

            <Separator />

            {/* Payer info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rcpt-payer">{t("banking.payer")} (EN)</Label>
                <Input
                  id="rcpt-payer"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Donor / Organization name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rcpt-payer-ar">{t("banking.payer")} (AR)</Label>
                <Input
                  id="rcpt-payer-ar"
                  dir="rtl"
                  value={payerNameAr}
                  onChange={(e) => setPayerNameAr(e.target.value)}
                  placeholder="اسم المانح / المنظمة"
                />
              </div>
            </div>

            {/* Reference */}
            <div className="space-y-1.5">
              <Label htmlFor="rcpt-ref">{lbl("Reference", "المرجع")}</Label>
              <Input
                id="rcpt-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. DON-2026-001"
              />
            </div>

            {/* Description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rcpt-desc-en">{t("banking.description")} (EN)</Label>
                <Textarea
                  id="rcpt-desc-en"
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  rows={2}
                  placeholder="Optional description…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rcpt-desc-ar">{t("banking.description")} (AR)</Label>
                <Textarea
                  id="rcpt-desc-ar"
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
                    <Label htmlFor="rcpt-cheque-num">
                      {lbl("Cheque Number", "رقم الشيك")}{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="rcpt-cheque-num"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      className={errors.chequeNumber ? "border-destructive" : ""}
                    />
                    {errors.chequeNumber && (
                      <p className="text-xs text-destructive">{errors.chequeNumber}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rcpt-cheque-date">{lbl("Cheque Date", "تاريخ الشيك")}</Label>
                    <Input
                      id="rcpt-cheque-date"
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rcpt-cheque-bank">{lbl("Bank Name on Cheque", "اسم البنك على الشيك")}</Label>
                  <Input
                    id="rcpt-cheque-bank"
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
              lbl("Create Receipt", "إنشاء مقبوضة")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
