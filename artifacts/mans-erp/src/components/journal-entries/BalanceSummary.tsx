import { CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";
import { useLanguage } from "@/lib/language-provider";
import { formatAmount, isBalancedTotals, jt } from "@/lib/journal-entry-ui";

interface Props {
  totalDebit: number;
  totalCredit: number;
  currencyCode?: string;
  /** Show the "must match before saving" hint when unbalanced. */
  showBlockingHint?: boolean;
}

/** Prominent debit / credit / difference panel using the server rule abs(diff) < 0.01. */
export function BalanceSummary({ totalDebit, totalCredit, currencyCode, showBlockingHint }: Props) {
  const { lang } = useLanguage();
  const diff = totalDebit - totalCredit;
  const balanced = isBalancedTotals(totalDebit, totalCredit);
  const zero = totalDebit === 0 && totalCredit === 0;

  const tone = !balanced
    ? "border-red-300 bg-red-50 text-red-800"
    : zero
      ? "border-border bg-muted/40 text-muted-foreground"
      : "border-emerald-300 bg-emerald-50 text-emerald-800";
  const Icon = !balanced ? AlertTriangle : zero ? CircleDashed : CheckCircle2;

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="panel-balance">
      <div className="grid grid-cols-3 divide-x rtl:divide-x-reverse">
        {[
          { k: "totalDebit" as const, v: totalDebit, c: "text-foreground" },
          { k: "totalCredit" as const, v: totalCredit, c: "text-foreground" },
          { k: "difference" as const, v: Math.abs(diff), c: balanced ? "text-emerald-700" : "text-red-700" },
        ].map((x) => (
          <div key={x.k} className="px-3 py-3 sm:px-4 min-w-0">
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{jt(lang, x.k)}</p>
            <p
              className={`font-mono tabular-nums font-semibold text-sm sm:text-lg truncate ${x.c}`}
              data-testid={`text-${x.k}`}
            >
              {formatAmount(x.v)}
            </p>
            {currencyCode && <p className="text-[10px] text-muted-foreground">{currencyCode}</p>}
          </div>
        ))}
      </div>
      <div
        role="status"
        aria-live="polite"
        data-testid="status-balance"
        className={`flex items-start gap-2 border-t px-4 py-2.5 text-sm font-medium ${tone}`}
      >
        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          {!balanced
            ? `${jt(lang, "unbalanced")} — ${jt(lang, "difference")} ${formatAmount(Math.abs(diff))}${
                showBlockingHint ? `. ${jt(lang, "blocking")}` : ""
              }`
            : zero
              ? jt(lang, "zeroNote")
              : jt(lang, "balanced")}
        </span>
      </div>
    </div>
  );
}
