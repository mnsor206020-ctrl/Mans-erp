import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useAcceptInvitation } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

/**
 * Handles /accept-invitation?token=<uuid>
 * User must already be signed in (Clerk). The page auto-accepts on mount.
 */
export default function AcceptInvitation() {
  const { t, lang, dir } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const acceptedRef = useRef(false);

  const {
    mutate: accept,
    isPending,
    isSuccess,
    isError,
    error,
  } = useAcceptInvitation({
    mutation: {
      onSuccess: () => {
        toast({ title: t("invitations.accept.success") });
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message;
        toast({ title: msg ?? t("invitations.accept.error"), variant: "destructive" });
      },
    },
  });

  // Auto-accept once on mount (only if token present)
  useEffect(() => {
    if (token && !acceptedRef.current) {
      acceptedRef.current = true;
      accept({ token });
    }
  }, [token, accept]);

  return (
    <div
      dir={dir}
      className="min-h-screen flex items-center justify-center bg-background p-4"
    >
      <Card className="w-full max-w-md shadow-lg border-border/50">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl">{t("invitations.accept.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 py-8">
          {!token ? (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-muted-foreground text-center">
                {lang === "ar" ? "رابط الدعوة غير صالح" : "Invalid invitation link — no token found."}
              </p>
            </>
          ) : isPending ? (
            <>
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-muted-foreground">
                {lang === "ar" ? "جارٍ قبول الدعوة…" : "Accepting invitation…"}
              </p>
            </>
          ) : isSuccess ? (
            <>
              <CheckCircle2 className="h-16 w-16 text-emerald-500" />
              <p className="text-center font-medium">{t("invitations.accept.success")}</p>
              <Button onClick={() => setLocation("/dashboard")} className="w-full">
                {lang === "ar" ? "الذهاب إلى لوحة القيادة" : "Go to Dashboard"}
              </Button>
            </>
          ) : isError ? (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-center text-muted-foreground">
                {(error as { message?: string })?.message ?? t("invitations.accept.error")}
              </p>
              <Button variant="outline" onClick={() => setLocation("/dashboard")} className="w-full">
                {lang === "ar" ? "العودة للرئيسية" : "Return to Dashboard"}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
