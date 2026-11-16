import "./helpers/legacy-accounting-boundary";
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Mock Clerk before router import ───────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "test-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

// ── Mock Prisma before router import ──────────────────────────────────────────
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    currency: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    bankAccount: {
      findFirst: vi.fn(),
      update:    vi.fn(),
    },
    cashBox: {
      findFirst: vi.fn(),
      update:    vi.fn(),
    },
    receipt: {
      findMany:  vi.fn(),
      findFirst: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
    fiscalYear: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    journalEntry: {
      findFirst: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ── Import router after mocks ─────────────────────────────────────────────────
import receiptsRouter from "../routes/receipts";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ORG_ID          = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID         = "dddddddd-0000-0000-0000-000000000004";
const BANK_ACCOUNT_ID = "bbbbbbbb-0000-0000-0000-000000000002";
const CASH_BOX_ID     = "cccccccc-0000-0000-0000-000000000003";
const RECEIPT_ID      = "eeeeeeee-0000-0000-0000-000000000005";
const GL_ACCOUNT_ID   = "ffffffff-0000-0000-0000-000000000006";
const FISCAL_YEAR_ID  = "99999999-0000-0000-0000-000000000009";
const JE_ID           = "88888888-0000-0000-0000-000000000008";

const mockUser = {
  id:             USER_ID,
  organizationId: ORG_ID,
  clerkId:        "test-clerk-id",
  deletedAt:      null,
  userRoles:      userRolesGrantingAll("receipts"),
};

const mockCurrency = {
  code:   "SAR",
  nameEn: "Saudi Riyal",
  status: "ACTIVE",
};

const mockBankAccount = {
  id:             BANK_ACCOUNT_ID,
  organizationId: ORG_ID,
  isActive:       true,
  deletedAt:      null,
  currentBalance: "10000",
  glAccountId:    GL_ACCOUNT_ID,
};

const mockCashBox = {
  id:             CASH_BOX_ID,
  organizationId: ORG_ID,
  isActive:       true,
  deletedAt:      null,
  currentBalance: "5000",
};

const mockReceipt = {
  id:             RECEIPT_ID,
  organizationId: ORG_ID,
  number:         "RCP-2026-0001",
  receiptDate:    "2026-07-01T00:00:00.000Z",
  paymentMethod:  "BANK_TRANSFER",
  status:         "DRAFT",
  currencyCode:   "SAR",
  exchangeRate:   "1",
  amount:         "1000",
  amountBase:     "1000",
  bankAccountId:  BANK_ACCOUNT_ID,
  cashBoxId:      null,
  glAccountId:    GL_ACCOUNT_ID,
  journalEntryId: null,
  deletedAt:      null,
  createdAt:      new Date().toISOString(),
  updatedAt:      new Date().toISOString(),
  bankAccount: {
    id:            BANK_ACCOUNT_ID,
    accountNameEn: "Main Account",
    accountNameAr: "الحساب الرئيسي",
    accountNumber: "SA0000000001",
    currencyCode:  "SAR",
  },
  cashBox: null,
};

const mockFiscalYear = { id: FISCAL_YEAR_ID, status: "OPEN" };

const mockJE = {
  id:             JE_ID,
  number:         "JE-2026-0001",
  organizationId: ORG_ID,
  fiscalYearId:   FISCAL_YEAR_ID,
  entryDate:      new Date("2026-07-01"),
  type:           "AUTOMATIC",
  status:         "POSTED",
  currencyCode:   "SAR",
  exchangeRate:   "1",
  totalDebit:     "1000",
  totalCredit:    "1000",
  lines: [
    { lineNumber: 1, accountId: GL_ACCOUNT_ID, debit: "1000", credit: "0",    debitBase: "1000", creditBase: "0" },
    { lineNumber: 2, accountId: GL_ACCOUNT_ID, debit: "0",    credit: "1000", debitBase: "0",    creditBase: "1000" },
  ],
};

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/receipts", receiptsRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Receipts API — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst        as any).mockResolvedValue(mockUser);
    (prisma.currency.findFirst    as any).mockResolvedValue(mockCurrency);
    (prisma.branch.findFirst      as any).mockResolvedValue(null);
    (prisma.bankAccount.findFirst as any).mockResolvedValue(mockBankAccount);
    (prisma.cashBox.findFirst     as any).mockResolvedValue(mockCashBox);
    (prisma.fiscalYear.findFirst  as any).mockResolvedValue(mockFiscalYear);
    (prisma.fiscalYear.findMany as any).mockResolvedValue([mockFiscalYear]);
    (prisma.journalEntry.findFirst as any).mockResolvedValue(null);
  });

  // ── RCP-I-01 ─────────────────────────────────────────────────────────────────
  it("RCP-I-01: GET /receipts returns { data: [] } for a new organization", async () => {
    (prisma.receipt.findMany as any).mockResolvedValue([]);

    const res = await request(app).get("/api/receipts");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toEqual([]);
  });

  // ── RCP-I-02 ─────────────────────────────────────────────────────────────────
  it("RCP-I-02: POST creates a DRAFT receipt with auto-generated number", async () => {
    (prisma.receipt.findMany as any).mockResolvedValue([]);
    (prisma.receipt.create   as any).mockResolvedValue(mockReceipt);

    const res = await request(app)
      .post("/api/receipts")
      .send({
        receiptDate:   "2026-07-01",
        paymentMethod: "BANK_TRANSFER",
        amount:        1000,
        bankAccountId: BANK_ACCOUNT_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.number).toMatch(/^RCP-\d{4}-\d{4}$/);
  });

  // ── RCP-I-03 ─────────────────────────────────────────────────────────────────
  it("RCP-I-03: POST with CASH paymentMethod and no cashBoxId returns 400", async () => {
    const res = await request(app)
      .post("/api/receipts")
      .send({
        receiptDate:   "2026-07-01",
        paymentMethod: "CASH",
        amount:        500,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cashBoxId.*required/i);
  });

  // ── RCP-I-04 ─────────────────────────────────────────────────────────────────
  it("RCP-I-04: POST with non-CASH paymentMethod and no bankAccountId returns 400", async () => {
    const res = await request(app)
      .post("/api/receipts")
      .send({
        receiptDate:   "2026-07-01",
        paymentMethod: "CHEQUE",
        amount:        500,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bankAccountId.*required/i);
  });

  // ── RCP-I-05 ─────────────────────────────────────────────────────────────────
  it("RCP-I-05: GET /:id returns the receipt with nested bankAccount", async () => {
    (prisma.receipt.findFirst as any).mockResolvedValue(mockReceipt);

    const res = await request(app).get(`/api/receipts/${RECEIPT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECEIPT_ID);
    expect(res.body.bankAccount).toBeDefined();
    expect(res.body.bankAccount.id).toBe(BANK_ACCOUNT_ID);
  });

  // ── RCP-I-06 ─────────────────────────────────────────────────────────────────
  it("RCP-I-06: GET /:id for unknown id returns HTTP 404", async () => {
    (prisma.receipt.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get("/api/receipts/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── RCP-I-07 ─────────────────────────────────────────────────────────────────
  it("RCP-I-07: PATCH updates amount on a DRAFT receipt", async () => {
    const updated = { ...mockReceipt, amount: "2000", amountBase: "2000" };
    (prisma.receipt.findFirst as any).mockResolvedValue(mockReceipt);
    (prisma.receipt.update   as any).mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/receipts/${RECEIPT_ID}`)
      .send({ amount: 2000 });

    expect(res.status).toBe(200);
    expect(Number(res.body.amount)).toBe(2000);
  });

  // ── RCP-I-08 ─────────────────────────────────────────────────────────────────
  it("RCP-I-08: PATCH on a CONFIRMED receipt returns HTTP 400", async () => {
    const confirmed = { ...mockReceipt, status: "CONFIRMED" };
    (prisma.receipt.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app)
      .patch(`/api/receipts/${RECEIPT_ID}`)
      .send({ amount: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/DRAFT/i);
  });

  // ── RCP-I-09 ─────────────────────────────────────────────────────────────────
  it("RCP-I-09: DELETE a DRAFT receipt returns { ok: true } and sets deletedAt", async () => {
    (prisma.receipt.findFirst as any).mockResolvedValue(mockReceipt);
    (prisma.receipt.update   as any).mockResolvedValue({ ...mockReceipt, deletedAt: new Date() });

    const res = await request(app).delete(`/api/receipts/${RECEIPT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const updateCall = (prisma.receipt.update as any).mock.calls[0][0];
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  // ── RCP-I-10 ─────────────────────────────────────────────────────────────────
  it("RCP-I-10: DELETE a CONFIRMED receipt returns HTTP 400", async () => {
    const confirmed = { ...mockReceipt, status: "CONFIRMED" };
    (prisma.receipt.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app).delete(`/api/receipts/${RECEIPT_ID}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/DRAFT/i);
  });

  // ── RCP-I-11 ─────────────────────────────────────────────────────────────────
  it("RCP-I-11: POST /confirm on a DRAFT receipt increments bank account balance atomically", async () => {
    const confirmed = { ...mockReceipt, status: "CONFIRMED", confirmedAt: new Date() };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const txMock = {
        receipt:      { update: vi.fn().mockResolvedValue(confirmed) },
        bankAccount:  { update: vi.fn().mockResolvedValue({}) },
        cashBox:      { update: vi.fn() },
        journalEntry: {
          findMany: vi.fn().mockResolvedValue([]),
          create:   vi.fn().mockResolvedValue(mockJE),
          update:   vi.fn().mockResolvedValue({}),
        },
      };
      return await fn(txMock);
    });
    (prisma.receipt.findFirst as any).mockResolvedValue(mockReceipt);

    const res = await request(app).post(`/api/receipts/${RECEIPT_ID}/confirm`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CONFIRMED");
  });

  // ── RCP-I-12 ─────────────────────────────────────────────────────────────────
  it("RCP-I-12: POST /confirm on a CONFIRMED receipt returns HTTP 400", async () => {
    const confirmed = { ...mockReceipt, status: "CONFIRMED" };
    (prisma.receipt.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app).post(`/api/receipts/${RECEIPT_ID}/confirm`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/DRAFT/i);
  });

  // ── RCP-I-13 ─────────────────────────────────────────────────────────────────
  it("RCP-I-13: POST /confirm on a receipt with no bank account or cash box returns 400", async () => {
    const noLink = { ...mockReceipt, bankAccountId: null, cashBoxId: null };
    (prisma.receipt.findFirst as any).mockResolvedValue(noLink);

    const res = await request(app).post(`/api/receipts/${RECEIPT_ID}/confirm`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bank account or cash box/i);
  });

  // ── RCP-I-14 ─────────────────────────────────────────────────────────────────
  it("RCP-I-14: POST /void on a CONFIRMED receipt decrements bank account balance atomically", async () => {
    const confirmed = { ...mockReceipt, status: "CONFIRMED" };
    const voided    = { ...confirmed, status: "VOIDED", voidedAt: new Date(), voidReason: "Error" };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const txMock = {
        receipt:     { update: vi.fn().mockResolvedValue(voided) },
        bankAccount: { update: vi.fn().mockResolvedValue({}) },
        cashBox:     { update: vi.fn() },
      };
      return await fn(txMock);
    });
    (prisma.receipt.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app)
      .post(`/api/receipts/${RECEIPT_ID}/void`)
      .send({ voidReason: "Error" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("VOIDED");
    expect(res.body.voidReason).toBe("Error");
  });

  // ── RCP-I-15 ─────────────────────────────────────────────────────────────────
  it("RCP-I-15: POST /void on a DRAFT receipt returns HTTP 400", async () => {
    (prisma.receipt.findFirst as any).mockResolvedValue(mockReceipt);

    const res = await request(app)
      .post(`/api/receipts/${RECEIPT_ID}/void`)
      .send({ voidReason: "Test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/CONFIRMED/i);
  });

  // ── RCP-I-16 ─────────────────────────────────────────────────────────────────
  it("RCP-I-16: POST /void with missing voidReason returns HTTP 400", async () => {
    const confirmed = { ...mockReceipt, status: "CONFIRMED" };
    (prisma.receipt.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app)
      .post(`/api/receipts/${RECEIPT_ID}/void`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/voidReason/i);
  });

  // ── RCP-I-17 ─────────────────────────────────────────────────────────────────
  it("RCP-I-17: duplicate receipt number returns HTTP 409", async () => {
    const p2002Error = Object.assign(new Error("Unique constraint violation"), {
      code: "P2002",
    });
    (prisma.receipt.findMany as any).mockResolvedValue([]);
    (prisma.receipt.create  as any).mockRejectedValue(p2002Error);

    const res = await request(app)
      .post("/api/receipts")
      .send({
        receiptDate:   "2026-07-01",
        paymentMethod: "BANK_TRANSFER",
        amount:        1000,
        bankAccountId: BANK_ACCOUNT_ID,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });
});
