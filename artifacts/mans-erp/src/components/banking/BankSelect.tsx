import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import { useListBanks } from "@workspace/api-client-react";
import type { Bank } from "@workspace/api-client-react";
import { unwrapPaginatedList } from "@/lib/paginated-list";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronsUpDown, Check, Loader2 } from "lucide-react";
import { BankingListError } from "./BankingListError";

interface BankSelectProps {
  value: string;
  onChange: (id: string, bank: Bank) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Combobox for selecting a bank from the seeded reference list.
 * Searches by nameEn or nameAr. Supports RTL/LTR.
 */
export function BankSelect({ value, onChange, disabled, id }: BankSelectProps) {
  const [open, setOpen] = useState(false);
  const { lang, t } = useLanguage();
  const { data, isLoading, isError, refetch } = useListBanks();
  const banks = unwrapPaginatedList<Bank>(data);

  const selected = banks.find((b) => b.id === value);
  const selectedLabel = selected
    ? lang === "ar"
      ? selected.nameAr || selected.nameEn
      : selected.nameEn || selected.nameAr
    : "";

  if (isError) {
    return (
      <BankingListError
        message={lang === "ar" ? "تعذر تحميل البنوك." : "Could not load banks."}
        retryLabel={lang === "ar" ? "إعادة المحاولة" : "Retry"}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-haspopup="listbox"
          disabled={disabled || isLoading}
          className="w-full justify-between h-9 font-normal text-start truncate"
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("banking.bank.loading")}
            </span>
          ) : selectedLabel ? (
            <span className="truncate text-sm">{selectedLabel}</span>
          ) : (
            <span className="text-muted-foreground text-sm">
              {t("banking.bank.placeholder")}
            </span>
          )}
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command id={id ? `${id}-listbox` : undefined}>
          <CommandInput placeholder={t("banking.bank.search")} />
          <CommandList>
            <CommandEmpty>{t("banking.bank.empty")}</CommandEmpty>
            <CommandGroup>
              {banks.map((bank) => {
                const label =
                  lang === "ar"
                    ? bank.nameAr || bank.nameEn
                    : bank.nameEn || bank.nameAr;
                return (
                  <CommandItem
                    key={bank.id}
                    value={`${bank.nameEn} ${bank.nameAr}`}
                    onSelect={() => {
                      onChange(bank.id, bank);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={`me-2 h-4 w-4 shrink-0 ${
                        value === bank.id ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span className="text-sm truncate">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
