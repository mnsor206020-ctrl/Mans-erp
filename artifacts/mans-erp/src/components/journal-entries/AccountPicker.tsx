import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import { jt } from "@/lib/journal-entry-ui";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check, SearchX } from "lucide-react";

export interface AccountOption {
  id: string;
  code: string;
  nameEn: string;
  nameAr?: string | null;
  isGroup?: boolean;
  isActive?: boolean;
  allowDirectEntry?: boolean;
}

interface AccountPickerProps {
  value: string;
  onChange: (id: string, label: string) => void;
  accounts: AccountOption[];
  placeholder: string;
  id?: string;
  /** Label to show when the selected account is not in the options list (e.g. edit mode). */
  fallbackLabel?: string;
  invalid?: boolean;
}

/**
 * Combobox for selecting a chart-of-accounts entry.
 * Searches by code and both Arabic and English names.
 */
export function AccountPicker({
  value,
  onChange,
  accounts,
  placeholder,
  id,
  fallbackLabel,
  invalid,
}: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const { lang } = useLanguage();
  const name = (a: AccountOption) =>
    lang === "ar" ? a.nameAr || a.nameEn : a.nameEn || a.nameAr || "";
  const selected = accounts.find((a) => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          data-testid={id ? `button-${id}` : undefined}
          className={`w-full min-w-0 justify-between h-10 font-normal text-start px-3 ${
            invalid ? "border-destructive/60" : ""
          }`}
        >
          {selected ? (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono text-xs text-primary shrink-0">{selected.code}</span>
              <span className="truncate text-sm">{name(selected)}</span>
            </span>
          ) : value && fallbackLabel ? (
            <span className="truncate text-sm">{fallbackLabel}</span>
          ) : (
            <span className="text-muted-foreground text-sm">{placeholder}</span>
          )}
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(420px,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={jt(lang, "searchAccount")} />
          <CommandList className="max-h-72">
            <CommandEmpty>
              <div className="flex flex-col items-center gap-1 py-4 text-center">
                <SearchX className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">{jt(lang, "noAccounts")}</p>
                <p className="text-xs text-muted-foreground">{jt(lang, "noAccountsHint")}</p>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.code} ${account.nameEn} ${account.nameAr ?? ""}`}
                  onSelect={() => {
                    onChange(account.id, `${account.code} — ${name(account)}`);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <Check
                    className={`h-4 w-4 shrink-0 ${value === account.id ? "opacity-100 text-primary" : "opacity-0"}`}
                  />
                  <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">
                    {account.code}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{name(account)}</span>
                    {account.nameAr && account.nameEn && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {lang === "ar" ? account.nameEn : account.nameAr}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
