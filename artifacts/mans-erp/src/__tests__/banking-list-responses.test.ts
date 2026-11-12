import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BankSelect } from "../components/banking/BankSelect";
import { CurrencySelect } from "../components/banking/CurrencySelect";
import { ReceiptFormDialog } from "../components/banking/ReceiptFormDialog";
import { PaymentFormDialog } from "../components/banking/PaymentFormDialog";
import { PettyCashFormDialog } from "../components/banking/PettyCashFormDialog";

const queries = vi.hoisted(() => ({
  banks: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  currencies: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  accounts: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  boxes: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
}));
const childrenOnly = vi.hoisted(() => ({ children }: { children?: ReactNode }) => children);

vi.mock("@workspace/api-client-react", () => ({
  useListBanks: () => queries.banks,
  useListCurrencies: () => queries.currencies,
  useListBankAccounts: () => queries.accounts,
  useListCashBoxes: () => queries.boxes,
  useListChartOfAccounts: () => ({ data: [], isLoading: false }),
  useListCostCenters: () => ({ data: [], isLoading: false }),
  useCreateReceipt: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateReceipt: () => ({ isPending: false, mutate: vi.fn() }),
  useCreatePayment: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdatePayment: () => ({ isPending: false, mutate: vi.fn() }),
  useCreatePettyCash: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/lib/language-provider", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => ({
      "common.loading": "Loading",
      "banking.bank.loading": "Loading banks",
      "banking.currency.loading": "Loading currencies",
      "banking.bank.empty": "No banks found",
      "banking.currency.empty": "No active currencies",
    }[key] ?? key),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
// Keep option content visible without portals or a browser. The actual five
// components and their list processing/error/loading branches run unmodified.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: childrenOnly, DialogContent: childrenOnly, DialogHeader: childrenOnly,
  DialogTitle: childrenOnly, DialogFooter: childrenOnly,
}));
vi.mock("@/components/ui/select", () => ({
  Select: childrenOnly, SelectContent: childrenOnly, SelectItem: childrenOnly,
  SelectTrigger: childrenOnly, SelectValue: () => null,
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: childrenOnly, PopoverContent: childrenOnly, PopoverTrigger: childrenOnly,
}));
vi.mock("@/components/ui/command", () => ({
  Command: childrenOnly, CommandEmpty: childrenOnly, CommandGroup: childrenOnly,
  CommandInput: () => null, CommandItem: childrenOnly, CommandList: childrenOnly,
}));
vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: childrenOnly }));
vi.mock("@/components/journal-entries/AccountPicker", () => ({ AccountPicker: () => null }));

const components: {
  name: string;
  component: ComponentType<any>;
  props: Record<string, unknown>;
  option: string;
  empty: string;
}[] = [
  { name: "BankSelect", component: BankSelect, props: { value: "bank-1", onChange: vi.fn() }, option: "Test bank", empty: "No banks found" },
  { name: "CurrencySelect", component: CurrencySelect, props: { value: "SAR", onChange: vi.fn() }, option: "Saudi Riyal", empty: "No active currencies" },
  { name: "ReceiptFormDialog", component: ReceiptFormDialog, props: { open: true, onOpenChange: vi.fn() }, option: "Test bank account", empty: "No active bank accounts" },
  { name: "PaymentFormDialog", component: PaymentFormDialog, props: { open: true, onOpenChange: vi.fn() }, option: "Test bank account", empty: "No active bank accounts" },
  { name: "PettyCashFormDialog", component: PettyCashFormDialog, props: { open: true, onOpenChange: vi.fn() }, option: "Test cash box", empty: "No active cash boxes" },
];

beforeEach(() => {
  for (const query of Object.values(queries)) {
    query.isLoading = false;
    query.isError = false;
    query.refetch.mockClear();
  }
  queries.banks.data = { data: [{ id: "bank-1", nameEn: "Test bank", nameAr: "" }] };
  queries.currencies.data = { data: [{ code: "SAR", nameEn: "Saudi Riyal", nameAr: "", symbol: "SAR" }] };
  queries.accounts.data = {
    data: [
      { id: "account-1", accountNameEn: "Test bank account", accountNameAr: "", accountNumber: "123", isActive: true, deletedAt: null },
      { id: "account-2", accountNameEn: "Inactive account", isActive: false, deletedAt: null },
      { id: "account-3", accountNameEn: "Deleted account", isActive: true, deletedAt: "2026-01-01" },
    ],
  };
  queries.boxes.data = {
    data: [
      { id: "box-1", nameEn: "Test cash box", nameAr: "", code: "CASH", isActive: true, deletedAt: null },
      { id: "box-2", nameEn: "Inactive box", code: "INACTIVE", isActive: false, deletedAt: null },
      { id: "box-3", nameEn: "Deleted box", code: "DELETED", isActive: true, deletedAt: "2026-01-01" },
    ],
  };
});

describe.each(components)("$name list responses", ({ component, props, option, empty }) => {
  const render = () => renderToStaticMarkup(createElement(component, props));

  it("renders paginated results without array-method crashes", () => {
    const html = render();
    expect(html).toContain(option);
    expect(html).not.toContain("Inactive box");
    expect(html).not.toContain("Deleted box");
    expect(html).not.toContain("Inactive account");
    expect(html).not.toContain("Deleted account");
  });

  it("preserves compatibility with array responses", () => {
    for (const query of Object.values(queries)) {
      query.data = (query.data as { data: unknown[] }).data;
    }
    expect(render()).toContain(option);
  });

  it("renders an empty state for an empty page", () => {
    for (const query of Object.values(queries)) query.data = { data: [] };
    expect(render()).toContain(empty);
  });

  it("renders safely while list requests are loading", () => {
    for (const query of Object.values(queries)) {
      query.data = undefined;
      query.isLoading = true;
    }
    expect(render()).toContain("Loading");
  });

  it("distinguishes a failed request from an empty list and offers retry", () => {
    for (const query of Object.values(queries)) {
      query.data = undefined;
      query.isError = true;
    }
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load");
    expect(html).toContain("Retry");
    expect(html).not.toContain(empty);
  });
});
