import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
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
import { ChevronsUpDown, Check } from "lucide-react";

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
}

/**
 * Combobox for selecting a chart-of-accounts entry.
 * Searches by code or name in both Arabic and English.
 * Accessibility: role="combobox", aria-expanded, aria-controls, aria-haspopup.
 */
export function AccountPicker({
  value,
  onChange,
  accounts,
  placeholder,
  id,
}: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const { lang } = useLanguage();
  const selected = accounts.find((a) => a.id === value);
  const selectedLabel = selected
    ? `${selected.code} — ${lang === "ar" ? (selected.nameAr || selected.nameEn) : (selected.nameEn || selected.nameAr)}`
    : "";

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
          className="w-full justify-between h-9 font-normal text-start truncate"
        >
          {selectedLabel ? (
            <span className="truncate text-xs">{selectedLabel}</span>
          ) : (
            <span className="text-muted-foreground text-xs">{placeholder}</span>
          )}
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command id={id ? `${id}-listbox` : undefined}>
          <CommandInput placeholder="Search by code or name..." />
          <CommandList>
            <CommandEmpty>No accounts found</CommandEmpty>
            <CommandGroup>
              {accounts.map((account) => {
                const label = `${account.code} — ${
                  lang === "ar"
                    ? (account.nameAr || account.nameEn)
                    : (account.nameEn || account.nameAr)
                }`;
                return (
                  <CommandItem
                    key={account.id}
                    value={`${account.code} ${account.nameEn} ${account.nameAr ?? ""}`}
                    onSelect={() => {
                      onChange(account.id, label);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={`me-2 h-4 w-4 ${value === account.id ? "opacity-100" : "opacity-0"}`}
                    />
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-muted-foreground me-1">
                        {account.code}
                      </span>
                      <span className="text-sm">
                        {lang === "ar"
                          ? (account.nameAr || account.nameEn)
                          : (account.nameEn || account.nameAr)}
                      </span>
                    </div>
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
