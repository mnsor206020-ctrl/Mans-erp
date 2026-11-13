export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type AccountNature = "DEBIT" | "CREDIT";

export interface AccountFormData {
  parentId: string | null;
  code: string;
  nameEn: string;
  nameAr: string;
  type: AccountType | "";
  nature: AccountNature | "";
  isGroup: boolean;
  notes: string;
}

type InitialData = AccountFormData & { id?: string };

export interface AccountFormSession {
  open: boolean;
  accountId: string | null;
  values: AccountFormData;
}

export function createAccountFormSession(open: boolean, initialData?: InitialData): AccountFormSession {
  const { id: accountId, ...values } = initialData ?? {
    parentId: null, code: "", nameEn: "", nameAr: "", type: "", nature: "",
    isGroup: false, notes: "",
  };
  return { open, accountId: accountId ?? null, values };
}

/**
 * Reset only for a newly opened session or a different account, never because
 * refreshed props, mutation loading/error state, or a parent render changed.
 * Returning the same object also makes the component's render-time guard stable.
 */
export function syncAccountFormSession(
  current: AccountFormSession,
  open: boolean,
  initialData?: InitialData,
): AccountFormSession {
  const accountId = initialData?.id ?? null;
  if (current.open === open && current.accountId === accountId) return current;
  if (open) return createAccountFormSession(open, initialData);
  return { ...current, open, accountId };
}
