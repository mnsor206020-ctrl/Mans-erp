import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { isValidElement, type ReactNode } from "react";
import {
  getCreateReceiptMutationOptions,
  getCreatePaymentMutationOptions,
  getCreatePettyCashMutationOptions,
  setBaseUrl,
} from "@workspace/api-client-react";
import { ReceiptFormDialog } from "../components/banking/ReceiptFormDialog";
import { PaymentFormDialog } from "../components/banking/PaymentFormDialog";
import { PettyCashFormDialog } from "../components/banking/PettyCashFormDialog";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  createReceipt: vi.fn(),
  updateReceipt: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  createPettyCash: vi.fn(),
  toast: vi.fn(),
}));

// Exercise the real submit handlers with deterministic, valid form values.
// Transport tests below use an isolated HTTP receiver, never the running ERP API.
// No authentication, database writes, or accounting operations occur.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => [harness.states.shift() ?? initial, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock("@workspace/api-client-react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/api-client-react")>(),
  useListBankAccounts: () => ({ data: { data: [] } }),
  useListCashBoxes: () => ({ data: { data: [] } }),
  useListChartOfAccounts: () => ({ data: { data: [] } }),
  useListCostCenters: () => ({ data: [] }),
  useCreateReceipt: () => ({ mutate: harness.createReceipt, isPending: false }),
  useUpdateReceipt: () => ({ mutate: harness.updateReceipt, isPending: false }),
  useCreatePayment: () => ({ mutate: harness.createPayment, isPending: false }),
  useUpdatePayment: () => ({ mutate: harness.updatePayment, isPending: false }),
  useCreatePettyCash: () => ({ mutate: harness.createPettyCash, isPending: false }),
}));
vi.mock("@/lib/language-provider", () => ({
  useLanguage: () => ({ lang: "en", t: (key: string) => key }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: harness.toast }),
}));
vi.mock("@/components/journal-entries/AccountPicker", () => ({
  AccountPicker: () => null,
}));

function submit(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(submit);
  if (!isValidElement(node)) return false;
  const props = node.props as {
    onClick?: () => void;
    disabled?: boolean;
    children?: ReactNode;
  };
  if (props.onClick && props.disabled === false && props.children !== "common.cancel") {
    props.onClick();
    return true;
  }
  return submit(props.children);
}

function voucherState() {
  return [
    "2026-11-12", "BANK_TRANSFER", "1.25", "SAR", "1", "test-bank", "",
    "test-gl", "TEST party", "", "TEST reference", "", "", "", "", "", {},
  ];
}

const cases = [
  {
    name: "receipt", render: ReceiptFormDialog, mutate: harness.createReceipt,
    state: voucherState, dateField: "receiptDate", path: "/api/receipts",
    mutationOptions: getCreateReceiptMutationOptions,
  },
  {
    name: "payment", render: PaymentFormDialog, mutate: harness.createPayment,
    state: voucherState, dateField: "paymentDate", path: "/api/payments",
    mutationOptions: getCreatePaymentMutationOptions,
  },
  {
    name: "petty cash", render: PettyCashFormDialog, mutate: harness.createPettyCash,
    state: () => [
      "2026-11-12", "IN", "1.25", "test-box", "test-gl", "",
      "TEST reference", "TEST description", "وصف تجريبي", {},
    ],
    dateField: "transactionDate", path: "/api/petty-cash",
    mutationOptions: getCreatePettyCashMutationOptions,
  },
];

let server: Server;
let responseStatus = 201;
let received: {
  path?: string;
  method?: string;
  contentType?: string;
  rawBody: string;
  body: Record<string, unknown> | null;
}[] = [];

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : null;
    received.push({
      path: req.url,
      method: req.method,
      contentType: req.headers["content-type"],
      rawBody,
      body,
    });
    // A regression to mutate(payload) yields no JSON body and must fail here.
    const rejected = responseStatus === 400 || !body || !Object.keys(body).length;
    res.writeHead(rejected ? 400 : 201, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rejected
      ? { error: "TEST API validation error" }
      : { id: "TEST-response-only", ...body }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  setBaseUrl(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(async () => {
  setBaseUrl("");
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  harness.states = [];
  responseStatus = 201;
  received = [];
});

describe.each(cases)("$name creation", ({ render, mutate, state, dateField, path, mutationOptions }) => {
  function save() {
    harness.states = state();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    expect(submit(render({ open: true, onOpenChange, onSuccess }))).toBe(true);
    expect(mutate).toHaveBeenCalledTimes(1);
    const [variables, callbacks] = mutate.mock.calls[0];
    return { variables, callbacks, onOpenChange, onSuccess };
  }

  it("passes the payload under data with serialized dates and numeric amounts", () => {
    const { variables } = save();
    expect(Object.keys(variables)).toEqual(["data"]);
    expect(variables.data).toMatchObject({
      [dateField]: "2026-11-12T00:00:00.000Z",
      amount: 1.25,
      glAccountId: "test-gl",
      reference: "TEST reference",
    });
    if (dateField === "transactionDate") {
      expect(variables.data).toMatchObject({ cashBoxId: "test-box", type: "IN" });
    } else {
      expect(variables.data).toMatchObject({
        bankAccountId: "test-bank", paymentMethod: "BANK_TRANSFER", currencyCode: "SAR",
      });
    }
  });

  it("closes and refreshes the parent only after a successful save", () => {
    const { callbacks, onOpenChange, onSuccess } = save();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    callbacks.onSuccess();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(harness.toast).toHaveBeenCalled();
  });

  it("shows the API error without closing or refreshing the form", () => {
    const { callbacks, onOpenChange, onSuccess } = save();
    callbacks.onError(new Error("TEST API validation error"));
    expect(harness.toast).toHaveBeenCalledWith({
      title: "TEST API validation error", variant: "destructive",
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("sends a nonempty top-level JSON body through the actual generated HTTP client", async () => {
    const { variables, callbacks, onOpenChange, onSuccess } = save();
    const result = await mutationOptions().mutationFn!(variables, {} as never);
    callbacks.onSuccess(result);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      path,
      method: "POST",
      contentType: "application/json",
      body: {
        [dateField]: "2026-11-12T00:00:00.000Z",
        amount: 1.25,
        glAccountId: "test-gl",
        reference: "TEST reference",
      },
    });
    expect(received[0].rawBody).not.toBe("");
    expect(received[0].body).toEqual(JSON.parse(JSON.stringify(variables.data)));
    // data is a mutation-argument wrapper, not an HTTP-body wrapper.
    expect(received[0].body).not.toHaveProperty("data");
    if (dateField === "transactionDate") {
      expect(received[0].body).toMatchObject({ cashBoxId: "test-box", type: "IN" });
    } else {
      expect(received[0].body).toMatchObject({
        bankAccountId: "test-bank", paymentMethod: "BANK_TRANSFER", currencyCode: "SAR",
      });
    }
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("handles an actual HTTP 400 without losing the populated submission", async () => {
    responseStatus = 400;
    const { variables, callbacks, onOpenChange, onSuccess } = save();
    const originalPayload = JSON.stringify(variables);
    let failure: unknown;
    try {
      await mutationOptions().mutationFn!(variables, {} as never);
    } catch (err) {
      failure = err;
      callbacks.onError(err);
    }

    expect(failure).toMatchObject({
      name: "ApiError", status: 400, data: { error: "TEST API validation error" },
    });
    expect(received).toHaveLength(1);
    expect(received[0].body).toEqual(JSON.parse(JSON.stringify(variables.data)));
    expect(harness.toast).toHaveBeenCalledWith({
      title: expect.stringContaining("TEST API validation error"),
      variant: "destructive",
    });
    expect(JSON.stringify(variables)).toBe(originalPayload);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

it.each([
  { render: ReceiptFormDialog, field: "receipt", mutate: harness.updateReceipt, date: "receiptDate" },
  { render: PaymentFormDialog, field: "payment", mutate: harness.updatePayment, date: "paymentDate" },
])("preserves the id/data contract when editing $field", ({ render, field, mutate, date }) => {
  harness.states = voucherState();
  const props = {
    open: true, onOpenChange: vi.fn(), onSuccess: vi.fn(),
    [field]: { id: "test-voucher" },
  };
  expect(submit(render(props))).toBe(true);
  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "test-voucher",
      data: expect.objectContaining({ [date]: "2026-11-12T00:00:00.000Z", amount: 1.25 }),
    }),
    expect.any(Object),
  );
});
