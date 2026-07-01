import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateBankAccount,
  useGetBankAccount,
  useUpdateBankAccount,
  getListBankAccountsQueryKey,
  getGetBankAccountQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Landmark } from "lucide-react";
import { BankSelect } from "@/components/banking/BankSelect";
import { CurrencySelect } from "@/components/banking/CurrencySelect";
import { AccountTypeSelect } from "@/components/banking/AccountTypeSelect";

interface Props {
  params?: { id: string };
}

export default function BankAccountForm({ params }: Props) {
  const isEdit = !!params?.id;
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [bankId, setBankId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [accountType, setAccountType] = useState("CURRENT");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [accountNameEn, setAccountNameEn] = useState("");
  const [accountNameAr, setAccountNameAr] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [branchId, setBranchId] = useState("");
  const [glAccountId, setGlAccountId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const accountId = params?.id ?? "";
  const { data: existing, isLoading: loadingExisting } = useGetBankAccount(
    accountId,
    { query: { enabled: isEdit, queryKey: getGetBankAccountQueryKey(accountId) } }
  );

  useEffect(() => {
    if (!existing) return;
    const rec = (existing as any)?.data ?? existing as any;
    if (!rec) return;
    setBankId(rec.bankId ?? "");
    setCurrencyCode(rec.currencyCode ?? "");
    setAccountType(rec.accountType ?? "CURRENT");
    setAccountNumber(rec.accountNumber ?? "");
    setIban(rec.iban ?? "");
    setAccountNameEn(rec.accountNameEn ?? "");
    setAccountNameAr(rec.accountNameAr ?? "");
    setOpeningBalance(String(rec.openingBalance ?? "0"));
    setBranchId(rec.branchId ?? "");
    setGlAccountId(rec.glAccountId ?? "");
    setIsActive(rec.isActive ?? true);
  }, [existing]);

  const createMutation = useCreateBankAccount({
    mutation: {
      onSuccess: (res: any) => {
        toast({ title: lang === "ar" ? "تم الإنشاء" : "Created", description: lang === "ar" ? "تم إنشاء الحساب البنكي." : "Bank account created." });
        queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
        const id = res?.data?.id ?? res?.id;
        navigate(id ? `/bank-accounts/${id}` : "/bank-accounts");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || (lang === "ar" ? "فشل الحفظ" : "Failed to save");
        toast({ title: lang === "ar" ? "خطأ" : "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateBankAccount({
    mutation: {
      onSuccess: () => {
        toast({ title: lang === "ar" ? "تم التحديث" : "Updated", description: lang === "ar" ? "تم تحديث الحساب البنكي." : "Bank account updated." });
        queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
        navigate(`/bank-accounts/${params!.id}`);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || (lang === "ar" ? "فشل الحفظ" : "Failed to save");
        toast({ title: lang === "ar" ? "خطأ" : "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, any> = {
      bankId: bankId || undefined,
      currencyCode: currencyCode || undefined,
      accountType,
      accountNumber: accountNumber || undefined,
      iban: iban || undefined,
      accountNameEn: accountNameEn || undefined,
      accountNameAr: accountNameAr || undefined,
      openingBalance: parseFloat(openingBalance) || 0,
      isActive,
    };
    if (branchId) payload.branchId = branchId;
    if (glAccountId) payload.glAccountId = glAccountId;

    if (isEdit) {
      updateMutation.mutate({ id: params!.id, data: payload } as any);
    } else {
      createMutation.mutate({ data: payload } as any);
    }
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card><CardContent className="p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/bank-accounts">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            {isEdit
              ? (lang === "ar" ? "تعديل الحساب البنكي" : "Edit Bank Account")
              : t("banking.bankAccounts.new")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("banking.bankAccounts.subtitle")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {lang === "ar" ? "معلومات الحساب" : "Account Information"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bank */}
            <div className="space-y-1.5">
              <Label htmlFor="bank">{t("banking.bank")}</Label>
              <BankSelect
                id="bank"
                value={bankId}
                onChange={(id) => setBankId(id)}
                disabled={isPending}
              />
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label htmlFor="currency">{t("banking.currency")}</Label>
              <CurrencySelect
                id="currency"
                value={currencyCode}
                onChange={(code) => setCurrencyCode(code)}
                disabled={isPending}
              />
            </div>

            {/* Account Type */}
            <div className="space-y-1.5">
              <Label htmlFor="accountType">{t("banking.accountType")}</Label>
              <AccountTypeSelect
                id="accountType"
                value={accountType}
                onChange={(v) => setAccountType(v)}
                disabled={isPending}
              />
            </div>

            {/* Account Number */}
            <div className="space-y-1.5">
              <Label htmlFor="accountNumber">{t("banking.accountNumber")}</Label>
              <Input
                id="accountNumber"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={lang === "ar" ? "أدخل رقم الحساب" : "Enter account number"}
                disabled={isPending}
                dir="ltr"
              />
            </div>

            {/* IBAN */}
            <div className="space-y-1.5">
              <Label htmlFor="iban">{t("banking.iban")}</Label>
              <Input
                id="iban"
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                placeholder="SA00 0000 0000 0000 0000 0000"
                disabled={isPending}
                dir="ltr"
                className="font-mono tracking-wider"
              />
            </div>
          </CardContent>
        </Card>

        {/* Names & Balance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {lang === "ar" ? "الاسم والرصيد" : "Name & Balance"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nameEn">{t("banking.accountNameEn")}</Label>
                <Input
                  id="nameEn"
                  value={accountNameEn}
                  onChange={(e) => setAccountNameEn(e.target.value)}
                  placeholder="e.g. Operating Account"
                  disabled={isPending}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nameAr">{t("banking.accountNameAr")}</Label>
                <Input
                  id="nameAr"
                  value={accountNameAr}
                  onChange={(e) => setAccountNameAr(e.target.value)}
                  placeholder="مثال: الحساب التشغيلي"
                  disabled={isPending}
                  dir="rtl"
                />
              </div>
            </div>

            {/* Opening Balance — read-only in edit mode */}
            <div className="space-y-1.5">
              <Label htmlFor="openingBalance">{t("banking.openingBalance")}</Label>
              <Input
                id="openingBalance"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                disabled={isPending || isEdit}
                dir="ltr"
                className="font-mono"
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "لا يمكن تعديل الرصيد الافتتاحي بعد الإنشاء."
                    : "Opening balance cannot be changed after creation."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Optional Fields */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {lang === "ar" ? "حقول اختيارية" : "Optional Fields"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="glAccountId">{t("banking.glAccount")}</Label>
              <Input
                id="glAccountId"
                value={glAccountId}
                onChange={(e) => setGlAccountId(e.target.value)}
                placeholder={lang === "ar" ? "معرّف حساب الأستاذ (UUID)" : "GL Account UUID"}
                disabled={isPending}
                dir="ltr"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branchId">{t("banking.branch")}</Label>
              <Input
                id="branchId"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder={lang === "ar" ? "معرّف الفرع (UUID)" : "Branch UUID"}
                disabled={isPending}
                dir="ltr"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isPending}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                {t("banking.isActive")}
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href={isEdit ? `/bank-accounts/${params!.id}` : "/bank-accounts"}>
            <Button type="button" variant="outline" disabled={isPending}>
              {t("common.cancel")}
            </Button>
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? t("banking.saving") : t("common.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
