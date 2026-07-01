import { useState } from "react";
import { Shield, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language-provider";

interface VerifyResult {
  entryId: string;
  number: string;
  storedHash: string;
  computedHash: string;
  isValid: boolean;
  verifiedAt: string;
}

interface Props {
  entryId: string;
  integrityHash: string;
  hashAlgorithm?: string | null;
  hashedAt?: string | null;
}

export default function IntegrityBadge({ entryId, integrityHash, hashAlgorithm, hashedAt }: Props) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"idle" | "loading" | "valid" | "invalid" | "error">("idle");
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);

  const verify = async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/journal-entries/${entryId}/verify-hash`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Network response not ok");
      const data: VerifyResult = await res.json();
      setStatus(data.isValid ? "valid" : "invalid");
      setVerifiedAt(data.verifiedAt);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="font-medium text-foreground">{t("je.hash.algorithm")}:</span>
          <span className="font-mono">{hashAlgorithm ?? "SHA-256"}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="font-medium text-foreground">{t("je.hash.value")}:</span>
          <code className="font-mono bg-muted rounded px-1 py-0.5 text-[11px]">
            {integrityHash.slice(0, 16)}…
          </code>
        </span>
        {hashedAt && (
          <span className="flex items-center gap-1">
            <span className="font-medium text-foreground">{t("je.hash.hashedAt")}:</span>
            {new Date(hashedAt).toLocaleString()}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={verify}
          disabled={status === "loading"}
          className="h-7 text-xs gap-1"
        >
          {status === "loading"
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Shield className="w-3 h-3" />}
          {status === "loading" ? t("je.hash.checking") : t("je.hash.verify")}
        </Button>

        {status === "valid" && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t("je.hash.valid")}
            {verifiedAt && (
              <span className="text-muted-foreground font-normal ms-1">
                · {new Date(verifiedAt).toLocaleTimeString()}
              </span>
            )}
          </span>
        )}

        {status === "invalid" && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-600">
            <ShieldAlert className="w-3.5 h-3.5" />
            {t("je.hash.tampered")}
          </span>
        )}

        {status === "error" && (
          <span className="text-xs text-amber-600">{t("je.hash.error")}</span>
        )}
      </div>
    </div>
  );
}
