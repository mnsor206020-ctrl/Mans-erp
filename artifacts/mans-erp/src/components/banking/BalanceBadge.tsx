import { useLanguage } from "@/lib/language-provider";

interface BalanceBadgeProps {
  amount: number | string;
  currencyCode?: string;
  currencySymbol?: string;
  decimalPlaces?: number;
  label?: string;
  variant?: "current" | "opening";
}

/**
 * Read-only badge displaying a monetary balance.
 *
 * Color coding:
 *   positive  → green
 *   negative  → red
 *   zero      → muted
 *
 * Supports RTL/LTR layout via the language context.
 */
export function BalanceBadge({
  amount,
  currencyCode,
  currencySymbol,
  decimalPlaces = 2,
  label,
  variant = "current",
}: BalanceBadgeProps) {
  const { t, dir } = useLanguage();

  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  const isZero     = numeric === 0;
  const isNegative = numeric < 0;

  const colorClass = isZero
    ? "text-muted-foreground"
    : isNegative
    ? "text-destructive"
    : "text-emerald-600 dark:text-emerald-400";

  const formattedAmount = Math.abs(numeric).toLocaleString(
    dir === "rtl" ? "ar-SA" : "en-US",
    {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }
  );

  const displayLabel =
    label ??
    (variant === "opening"
      ? t("banking.balance.opening")
      : t("banking.balance.current"));

  const prefix = isNegative ? "−" : "";
  const suffix = currencySymbol
    ? ` ${currencySymbol}`
    : currencyCode
    ? ` ${currencyCode}`
    : "";

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      {displayLabel && (
        <span className="text-[11px] text-muted-foreground leading-none">
          {displayLabel}
        </span>
      )}
      <span
        className={`text-sm font-semibold tabular-nums leading-none ${colorClass}`}
        dir="ltr"
        aria-label={`${displayLabel}: ${prefix}${formattedAmount}${suffix}`}
      >
        {isZero ? (
          <span className="text-xs font-normal">{t("banking.balance.zero")}</span>
        ) : (
          <>
            {prefix}
            {formattedAmount}
            {suffix && (
              <span className="text-xs font-normal text-muted-foreground ms-1">
                {suffix.trim()}
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}
