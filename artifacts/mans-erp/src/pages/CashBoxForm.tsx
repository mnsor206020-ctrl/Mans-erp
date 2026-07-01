import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateCashBox,
  useGetCashBox,
  useUpdateCashBox,
  getListCashBoxesQueryKey,
  getGetCashBoxQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Wallet } from "lucide-react";
import { CurrencySelect } from "@/components/banking/CurrencySelect";

interface Props {
  params?: { id: string };
}

export default function CashBoxForm({ params }: Props) {
  const isEdit = !!params?.id;
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [currencyCode, setCurrencyCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [code, setCode] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [glAccountId, setGlAccountId] = useState("");
  const [branchId, setBranchId] = useState("");

  const cashBoxId = params?.id ?? "";
  const { data: existing, isLoading: loadingExisting } = useGetCashBox(
    cashBoxId,
    { query: { enabled: isEdit, queryKey: getGetCashBoxQueryKey(cashBoxId) } }
  );

  useEffect(() => {
    if (!existing) return;
    const rec = (existing as any)?.data ?? (existing as any);
    if (!rec) return;
    setCurrencyCode(rec.currencyCode ?? "");
    setNameEn(rec.nameEn ?? "");
    setNameAr(rec.nameAr ?? "");
    setCode(rec.code ?? "");
    setOpeningBalance(String(rec.openingBalance ?? "0"));
    setGlAccountId(rec.glAccountId ?? "");
    setBranchId(rec.branchId ?? "");
  }, [existing]);

  const createMutation = useCreateCashBox({
    mutation: {
      onSuccess: (res: any) => {
        toast({
          title: lang === "ar" ? "تم الإنشاء" : "Created",
          description: lang === "ar" ? "تم إنشاء الصندوق النقدي." : "Cash box created.",
        });
        queryClient.invalidateQueries({ queryKey: getListCashBoxesQueryKey() });
        const id = res?.data?.id ?? res?.id;
        navigate(id ? `/cash-boxes/${id}` : "/cash-boxes");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || (lang === "ar" ? "فشل الحفظ" : "Failed to save");
        toast({ title: lang === "ar" ? "خطأ" : "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateCashBox({
    mutation: {
      onSuccess: () => {
        toast({
          title: lang === "ar" ? "تم التحديث" : "Updated",
          description: lang === "ar" ? "تم تحديث الصندوق النقدي." : "Cash box updated.",
        });
        queryClient.invalidateQueries({ queryKey: getListCashBoxesQueryKey() });
        navigate(`/cash-boxes/${params!.id}`);
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
    if (isEdit) {
      const payload: Record<string, any> = {
        nameEn: nameEn || undefined,
        nameAr: nameAr || undefined,
        glAccountId: glAccountId || null,
        branchId: branchId || null,
      };
      updateMutation.mutate({ id: params!.id, data: payload } as any);
    } else {
      const payload: Record<string, any> = {
        currencyCode,
        nameEn,
        nameAr,
        code,
        openingBalance: parseFloat(openingBalance) || 0,
      };
      if (glAccountId) payload.glAccountId = glAccountId;
      if (branchId) payload.branchId = branchId;
      createMutation.mutate({ data: payload } as any);
    }
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/cash-boxes">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            {isEdit
              ? (lang === "ar" ? "تعديل الصندوق النقدي" : "Edit Cash Box")
              : t("banking.cashBoxes.new")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("banking.cashBoxes.subtitle")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {lang === "ar" ? "معلومات الصندوق" : "Cash Box Information"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Code — immutable after creation */}
            <div className="space-y-1.5">
              <Label htmlFor="code">{t("banking.code")}</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CB-001"
                disabled={isPending || isEdit}
                dir="ltr"
                className="font-mono"
                required={!isEdit}
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  {lang === "ar" ? "لا يمكن تعديل الرمز بعد الإنشاء." : "Code cannot be changed after creation."}
                </p>
              )}
            </div>

            {/* Currency — immutable after creation */}
            <div className="space-y-1.5">
              <Label htmlFor="currency">{t("banking.currency")}</Label>
              {isEdit ? (
                <Input
                  value={currencyCode}
                  disabled
                  dir="ltr"
                  className="font-mono"
                />
              ) : (
                <CurrencySelect
                  id="currency"
                  value={currencyCode}
                  onChange={(code) => setCurrencyCode(code)}
                  disabled={isPending}
                />
              )}
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  {lang === "ar" ? "لا يمكن تعديل العملة بعد الإنشاء." : "Currency cannot be changed after creation."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Names */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {lang === "ar" ? "الاسم والرصيد" : "Name & Balance"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nameEn">{t("banking.nameEn")}</Label>
                <Input
                  id="nameEn"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. Main Cash Box"
                  disabled={isPending}
                  dir="ltr"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nameAr">{t("banking.nameAr")}</Label>
                <Input
                  id="nameAr"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مثال: الصندوق الرئيسي"
                  disabled={isPending}
                  dir="rtl"
                  required
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
                min="0"
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
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href={isEdit ? `/cash-boxes/${params!.id}` : "/cash-boxes"}>
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
