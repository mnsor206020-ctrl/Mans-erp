import { useLanguage } from "@/lib/language-provider";
import { useListCurrencies } from "@workspace/api-client-react";
import type { Currency } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface CurrencySelectProps {
  value: string;
  onChange: (code: string, currency: Currency) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Dropdown for selecting an active currency by ISO 4217 code.
 * Supports RTL/LTR. Shows code + symbol in the trigger.
 */
export function CurrencySelect({
  value,
  onChange,
  disabled,
  id,
}: CurrencySelectProps) {
  const { lang, t } = useLanguage();
  const { data, isLoading } = useListCurrencies({ status: "ACTIVE" });
  const currencies: Currency[] = data ?? [];

  const handleChange = (code: string) => {
    const currency = currencies.find((c) => c.code === code);
    if (currency) onChange(code, currency);
  };

  if (isLoading) {
    return (
      <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("banking.currency.loading")}
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger id={id} className="h-9 text-sm">
        <SelectValue placeholder={t("banking.currency.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {currencies.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {t("banking.currency.empty")}
          </div>
        ) : (
          currencies.map((currency) => {
            const label =
              lang === "ar"
                ? `${currency.code} — ${currency.nameAr || currency.nameEn}`
                : `${currency.code} — ${currency.nameEn || currency.nameAr}`;
            return (
              <SelectItem key={currency.code} value={currency.code}>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground w-8">
                    {currency.symbol}
                  </span>
                  <span>{label}</span>
                </span>
              </SelectItem>
            );
          })
        )}
      </SelectContent>
    </Select>
  );
}
