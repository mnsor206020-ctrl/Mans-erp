import type { ReactNode } from "react";
import { getGetCurrentUserQueryKey, useGetCurrentUser } from "@workspace/api-client-react";
import { useLanguage } from "@/lib/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Initialize the local account before mounting organization-scoped queries. */
export function OrganizationPageGate({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  const ar = lang === "ar";

  if (user.isPending) {
    return <div role="status">{ar ? "جارٍ تهيئة الحساب…" : "Initializing your account…"}</div>;
  }

  if (user.isError || !user.data?.organizationId) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p role={user.isError ? "alert" : "status"}>
            {user.isError
              ? ar
                ? "تعذّرت تهيئة حسابك. أعد المحاولة أو سجّل الدخول مجددًا."
                : "Your account could not be initialized. Retry or sign in again."
              : ar
                ? "حسابك غير مرتبط بمنظمة. اطلب من مسؤول النظام ربط حسابك بمنظمة لعرض هذه الصفحة."
                : "Your account is not assigned to an organization. Ask an administrator to assign your account to view this page."}
          </p>
          <Button type="button" variant="outline" disabled={user.isFetching} onClick={() => void user.refetch()}>
            {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return children;
}
