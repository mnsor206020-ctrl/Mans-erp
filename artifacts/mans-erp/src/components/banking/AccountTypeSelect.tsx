import { useLanguage } from "@/lib/language-provider";
import { BankAccountType } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACCOUNT_TYPES = [
  BankAccountType.CURRENT,
  BankAccountType.SAVINGS,
  BankAccountType.FIXED_DEPOSIT,
  BankAccountType.PETTY_CASH,
] as const;

interface AccountTypeSelectProps {
  value: string;
  onChange: (type: string) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Dropdown for selecting a BankAccountType.
 * Labels are fully translated via the banking.accountType.* keys.
 */
export function AccountTypeSelect({
  value,
  onChange,
  disabled,
  id,
}: AccountTypeSelectProps) {
  const { t } = useLanguage();

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="h-9 text-sm">
        <SelectValue placeholder={t("banking.accountType.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {ACCOUNT_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {t(`banking.accountType.${type}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
