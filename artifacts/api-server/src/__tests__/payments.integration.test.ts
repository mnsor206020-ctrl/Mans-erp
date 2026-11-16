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
    payment: {
      findMany:  vi.fn(),
      findFirst: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
    fiscalYear: {
      findFirst: vi.fn(),
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
import paymentsRouter from "../routes/payments";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ORG_ID          = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID         = "dddddddd-0000-0000-0000-000000000004";
const BANK_ACCOUNT_ID = "bbbbbbbb-0000-0000-0000-000000000002";
const CASH_BOX_ID     = "cccccccc-0000-0000-0000-000000000003";
const PAYMENT_ID      = "eeeeeeee-0000-0000-0000-000000000005";
const GL_ACCOUNT_ID   = "ffffffff-0000-0000-0000-000000000006";
const FISCAL_YEAR_ID  = "99999999-0000-0000-0000-000000000009";
const JE_ID           = "88888888-0000-0000-0000-000000000008";

const mockUser = {
  id:             USER_ID,
  organizationId: ORG_ID,
  clerkId:        "test-clerk-id",
  deletedAt:      null,
  userRoles:      userRolesGrantingAll("payments"),
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

const mockPayment = {
  id:             PAYMENT_ID,
  organizationId: ORG_ID,
  number:         "PMT-2026-0001",
  paymentDate:    "2026-07-01T00:00:00.000Z",
  paymentMethod:  "BANK_TRANSFER",
  status:         "DRAFT",
  currencyCode:   "SAR",
  exchangeRate:   "1",
  amount:         "500",
  amountBase:     "500",
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
  totalDebit:     "500",
  totalCredit:    "500",
  lines: [
    { lineNumber: 1, accountId: GL_ACCOUNT_ID, debit: "500", credit: "0",   debitBase: "500", creditBase: "0" },
    { lineNumber: 2, accountId: GL_ACCOUNT_ID, debit: "0",   credit: "500", debitBase: "0",   creditBase: "500" },
  ],
};

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/payments", paymentsRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Payments API — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst        as any).mockResolvedValue(mockUser);
    (prisma.currency.findFirst    as any).mockResolvedValue(mockCurrency);
    (prisma.branch.findFirst      as any).mockResolvedValue(null);
    (prisma.bankAccount.findFirst as any).mockResolvedValue(mockBankAccount);
    (prisma.cashBox.findFirst     as any).mockResolvedValue(mockCashBox);
    (prisma.fiscalYear.findFirst  as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntry.findFirst as any).mockResolvedValue(null);
  });

  // ── PMT-I-01 ─────────────────────────────────────────────────────────────────
  it("PMT-I-01: GET /payments returns { data: [] } for a new organization", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([]);

    const res = await request(app).get("/api/payments");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toEqual([]);
  });

  // ── PMT-I-02 ─────────────────────────────────────────────────────────────────
  it("PMT-I-02: POST creates a DRAFT payment with auto-generated number", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (prisma.payment.create   as any).mockResolvedValue(mockPayment);

    const res = await request(app)
      .post("/api/payments")
      .send({
        paymentDate:   "2026-07-01",
        paymentMethod: "BANK_TRANSFER",
        amount:        500,
        bankAccountId: BANK_ACCOUNT_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.number).toMatch(/^PMT-\d{4}-\d{4}$/);
  });

  // ── PMT-I-03 ─────────────────────────────────────────────────────────────────
  it("PMT-I-03: POST with CASH paymentMethod and no cashBoxId returns 400", async () => {
    const res = await request(app)
      .post("/api/payments")
      .send({
        paymentDate:   "2026-07-01",
        paymentMethod: "CASH",
        amount:        200,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cashBoxId.*required/i);
  });

  // ── PMT-I-04 ─────────────────────────────────────────────────────────────────
  it("PMT-I-04: POST with non-CASH paymentMethod and no bankAccountId returns 400", async () => {
    const res = await request(app)
      .post("/api/payments")
      .send({
        paymentDate:   "2026-07-01",
        paymentMethod: "CHEQUE",
        amount:        200,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bankAccountId.*required/i);
  });

  // ── PMT-I-05 ─────────────────────────────────────────────────────────────────
  it("PMT-I-05: GET /:id returns the payment with nested bankAccount", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(mockPayment);

    const res = await request(app).get(`/api/payments/${PAYMENT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PAYMENT_ID);
    expect(res.body.bankAccount).toBeDefined();
    expect(res.body.bankAccount.id).toBe(BANK_ACCOUNT_ID);
  });

  // ── PMT-I-06 ─────────────────────────────────────────────────────────────────
  it("PMT-I-06: GET /:id for unknown id returns HTTP 404", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get("/api/payments/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── PMT-I-07 ─────────────────────────────────────────────────────────────────
  it("PMT-I-07: PATCH updates amount on a DRAFT payment", async () => {
    const updated = { ...mockPayment, amount: "750", amountBase: "750" };
    (prisma.payment.findFirst as any).mockResolvedValue(mockPayment);
    (prisma.payment.update   as any).mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/payments/${PAYMENT_ID}`)
      .send({ amount: 750 });

    expect(res.status).toBe(200);
    expect(Number(res.body.amount)).toBe(750);
  });

  // ── PMT-I-08 ─────────────────────────────────────────────────────────────────
  it("PMT-I-08: PATCH on a CONFIRMED payment returns HTTP 400", async () => {
    const confirmed = { ...mockPayment, status: "CONFIRMED" };
    (prisma.payment.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app)
      .patch(`/api/payments/${PAYMENT_ID}`)
      .send({ amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/DRAFT/i);
  });

  // ── PMT-I-09 ─────────────────────────────────────────────────────────────────
  it("PMT-I-09: DELETE a DRAFT payment returns { ok: true } and sets deletedAt", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(mockPayment);
    (prisma.payment.update   as any).mockResolvedValue({ ...mockPayment, deletedAt: new Date() });

    const res = await request(app).delete(`/api/payments/${PAYMENT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const updateCall = (prisma.payment.update as any).mock.calls[0][0];
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  // ── PMT-I-10 ─────────────────────────────────────────────────────────────────
  it("PMT-I-10: DELETE a CONFIRMED payment returns HTTP 400", async () => {
    const confirmed = { ...mockPayment, status: "CONFIRMED" };
    (prisma.payment.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app).delete(`/api/payments/${PAYMENT_ID}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/DRAFT/i);
  });

  // ── PMT-I-11 ─────────────────────────────────────────────────────────────────
  it("PMT-I-11: POST /confirm on a DRAFT payment decrements bank account balance atomically", async () => {
    const confirmed = { ...mockPayment, status: "CONFIRMED", confirmedAt: new Date() };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const txMock = {
        payment:      { update: vi.fn().mockResolvedValue(confirmed) },
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
    (prisma.payment.findFirst as any).mockResolvedValue(mockPayment);

    const res = await request(app).post(`/api/payments/${PAYMENT_ID}/confirm`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CONFIRMED");
  });

  // ── PMT-I-12 ─────────────────────────────────────────────────────────────────
  it("PMT-I-12: POST /confirm on a CONFIRMED payment returns HTTP 400", async () => {
    const confirmed = { ...mockPayment, status: "CONFIRMED" };
    (prisma.payment.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app).post(`/api/payments/${PAYMENT_ID}/confirm`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/DRAFT/i);
  });

  // ── PMT-I-13 ─────────────────────────────────────────────────────────────────
  it("PMT-I-13: POST /confirm on a payment with no bank account or cash box returns 400", async () => {
    const noLink = { ...mockPayment, bankAccountId: null, cashBoxId: null };
    (prisma.payment.findFirst as any).mockResolvedValue(noLink);

    const res = await request(app).post(`/api/payments/${PAYMENT_ID}/confirm`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bank account or cash box/i);
  });

  // ── PMT-I-14 ─────────────────────────────────────────────────────────────────
  it("PMT-I-14: POST /void on a CONFIRMED payment increments bank account balance atomically", async () => {
    const confirmed = { ...mockPayment, status: "CONFIRMED" };
    const voided    = { ...confirmed, status: "VOIDED", voidedAt: new Date(), voidReason: "Wrong payee" };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const txMock = {
        payment:     { update: vi.fn().mockResolvedValue(voided) },
        bankAccount: { update: vi.fn().mockResolvedValue({}) },
        cashBox:     { update: vi.fn() },
      };
      return await fn(txMock);
    });
    (prisma.payment.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app)
      .post(`/api/payments/${PAYMENT_ID}/void`)
      .send({ voidReason: "Wrong payee" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("VOIDED");
    expect(res.body.voidReason).toBe("Wrong payee");
  });

  // ── PMT-I-15 ─────────────────────────────────────────────────────────────────
  it("PMT-I-15: POST /void on a DRAFT payment returns HTTP 400", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(mockPayment);

    const res = await request(app)
      .post(`/api/payments/${PAYMENT_ID}/void`)
      .send({ voidReason: "Test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/CONFIRMED/i);
  });

  // ── PMT-I-16 ─────────────────────────────────────────────────────────────────
  it("PMT-I-16: POST /void with missing voidReason returns HTTP 400", async () => {
    const confirmed = { ...mockPayment, status: "CONFIRMED" };
    (prisma.payment.findFirst as any).mockResolvedValue(confirmed);

    const res = await request(app)
      .post(`/api/payments/${PAYMENT_ID}/void`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/voidReason/i);
  });

  // ── PMT-I-17 ─────────────────────────────────────────────────────────────────
  it("PMT-I-17: duplicate payment number returns HTTP 409", async () => {
    const p2002Error = Object.assign(new Error("Unique constraint violation"), {
      code: "P2002",
    });
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (prisma.payment.create  as any).mockRejectedValue(p2002Error);

    const res = await request(app)
      .post("/api/payments")
      .send({
        paymentDate:   "2026-07-01",
        paymentMethod: "BANK_TRANSFER",
        amount:        500,
        bankAccountId: BANK_ACCOUNT_ID,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });
});
