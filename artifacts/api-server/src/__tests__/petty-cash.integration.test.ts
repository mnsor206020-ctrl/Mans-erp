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
    cashBox: {
      findFirst: vi.fn(),
      update:    vi.fn(),
    },
    pettyCash: {
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
import pettyCashRouter from "../routes/petty-cash";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ORG_ID         = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID        = "dddddddd-0000-0000-0000-000000000004";
const CASH_BOX_ID    = "bbbbbbbb-0000-0000-0000-000000000002";
const PC_ID          = "cccccccc-0000-0000-0000-000000000003";
const GL_ACCOUNT_ID  = "ffffffff-0000-0000-0000-000000000006";
const CB_GL_ACCT_ID  = "77777777-0000-0000-0000-000000000007";
const FISCAL_YEAR_ID = "99999999-0000-0000-0000-000000000009";
const JE_ID          = "88888888-0000-0000-0000-000000000008";

const mockUser = {
  id:             USER_ID,
  organizationId: ORG_ID,
  clerkId:        "test-clerk-id",
  deletedAt:      null,
  userRoles:      userRolesGrantingAll("petty_cash"),
};

const mockCashBox = {
  id:             CASH_BOX_ID,
  organizationId: ORG_ID,
  nameEn:         "Petty Cash Box",
  nameAr:         "صندوق المصروفات",
  code:           "PCB-001",
  currencyCode:   "SAR",
  isActive:       true,
  deletedAt:      null,
  currentBalance: "5000",
  glAccountId:    CB_GL_ACCT_ID,
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
  totalDebit:     "200",
  totalCredit:    "200",
  lines: [
    { lineNumber: 1, accountId: CB_GL_ACCT_ID, debit: "0",   credit: "200", debitBase: "0",   creditBase: "200" },
    { lineNumber: 2, accountId: GL_ACCOUNT_ID,  debit: "200", credit: "0",   debitBase: "200", creditBase: "0" },
  ],
};

const mockEntry = {
  id:              PC_ID,
  cashBoxId:       CASH_BOX_ID,
  type:            "OUT",
  transactionDate: "2026-07-01T00:00:00.000Z",
  amount:          "200",
  descriptionEn:   "Office supplies",
  descriptionAr:   "مستلزمات مكتبية",
  reference:       null,
  receiptNumber:   null,
  deletedAt:       null,
  createdAt:       new Date().toISOString(),
  updatedAt:       new Date().toISOString(),
  cashBox: {
    id:          CASH_BOX_ID,
    nameEn:      "Petty Cash Box",
    nameAr:      "صندوق المصروفات",
    code:        "PCB-001",
    currencyCode: "SAR",
  },
};

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/petty-cash", pettyCashRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Petty Cash API — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst        as any).mockResolvedValue(mockUser);
    (prisma.cashBox.findFirst     as any).mockResolvedValue(mockCashBox);
    (prisma.fiscalYear.findFirst  as any).mockResolvedValue(mockFiscalYear);
    (prisma.fiscalYear.findMany as any).mockResolvedValue([mockFiscalYear]);
    (prisma.journalEntry.findFirst as any).mockResolvedValue(null);
  });

  // ── PC-I-01 ──────────────────────────────────────────────────────────────────
  it("PC-I-01: GET /petty-cash returns { data: [] } for a new organization", async () => {
    (prisma.pettyCash.findMany as any).mockResolvedValue([]);

    const res = await request(app).get("/api/petty-cash");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toEqual([]);
  });

  // ── PC-I-02 ──────────────────────────────────────────────────────────────────
  it("PC-I-02: POST creates an OUT entry and decrements cash box balance atomically", async () => {
    const createPettyCash = vi.fn().mockResolvedValue(mockEntry);
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const txMock = {
        pettyCash:    { create: createPettyCash, update: vi.fn().mockResolvedValue({}) },
        cashBox:      { update: vi.fn().mockResolvedValue({ ...mockCashBox, currentBalance: "4800" }) },
        journalEntry: {
          findMany: vi.fn().mockResolvedValue([]),
          create:   vi.fn().mockResolvedValue(mockJE),
          update:   vi.fn().mockResolvedValue({}),
        },
      };
      return await fn(txMock);
    });

    const res = await request(app)
      .post("/api/petty-cash")
      .send({
        cashBoxId:       CASH_BOX_ID,
        type:            "OUT",
        transactionDate: "2026-07-01",
        amount:          200,
        descriptionEn:   "Office supplies",
        descriptionAr:   "مستلزمات مكتبية",
        glAccountId:     GL_ACCOUNT_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("OUT");
    expect(res.body.cashBox).toBeDefined();
    expect(res.body.cashBox.id).toBe(CASH_BOX_ID);
    // Keep the persisted payload aligned with the Prisma PettyCash model.
    // The actor belongs on the generated journal, not on an unsupported field.
    expect(createPettyCash.mock.calls[0][0].data).toEqual({
      cashBoxId: CASH_BOX_ID,
      type: "OUT",
      transactionDate: new Date("2026-07-01"),
      amount: 200,
      descriptionEn: "Office supplies",
      descriptionAr: "مستلزمات مكتبية",
      reference: null,
      receiptNumber: null,
      categoryId: null,
      glAccountId: GL_ACCOUNT_ID,
      costCenterId: null,
    });
  });

  // ── PC-I-03 ──────────────────────────────────────────────────────────────────
  it("PC-I-03: POST creates an IN entry and increments cash box balance atomically", async () => {
    const inEntry = { ...mockEntry, type: "IN" };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const txMock = {
        pettyCash:    { create: vi.fn().mockResolvedValue(inEntry), update: vi.fn().mockResolvedValue({}) },
        cashBox:      { update: vi.fn().mockResolvedValue({ ...mockCashBox, currentBalance: "5500" }) },
        journalEntry: {
          findMany: vi.fn().mockResolvedValue([]),
          create:   vi.fn().mockResolvedValue(mockJE),
          update:   vi.fn().mockResolvedValue({}),
        },
      };
      return await fn(txMock);
    });

    const res = await request(app)
      .post("/api/petty-cash")
      .send({
        cashBoxId:       CASH_BOX_ID,
        type:            "IN",
        transactionDate: "2026-07-01",
        amount:          500,
        descriptionEn:   "Cash replenishment",
        descriptionAr:   "تعبئة النقدية",
        glAccountId:     GL_ACCOUNT_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("IN");
  });

  // ── PC-I-04 ──────────────────────────────────────────────────────────────────
  it("PC-I-04: POST with inactive cash box returns 400", async () => {
    (prisma.cashBox.findFirst as any).mockResolvedValue({ ...mockCashBox, isActive: false });

    const res = await request(app)
      .post("/api/petty-cash")
      .send({
        cashBoxId:       CASH_BOX_ID,
        type:            "OUT",
        transactionDate: "2026-07-01",
        amount:          100,
        descriptionEn:   "Test",
        descriptionAr:   "اختبار",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inactive/i);
  });

  // ── PC-I-05 ──────────────────────────────────────────────────────────────────
  it("PC-I-05: POST with non-existent cash box returns 404", async () => {
    (prisma.cashBox.findFirst as any).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/petty-cash")
      .send({
        cashBoxId:       CASH_BOX_ID,
        type:            "OUT",
        transactionDate: "2026-07-01",
        amount:          100,
        descriptionEn:   "Test",
        descriptionAr:   "اختبار",
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── PC-I-06 ──────────────────────────────────────────────────────────────────
  it("PC-I-06: GET /:id returns the entry with nested cashBox", async () => {
    (prisma.pettyCash.findFirst as any).mockResolvedValue(mockEntry);

    const res = await request(app).get(`/api/petty-cash/${PC_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PC_ID);
    expect(res.body.cashBox).toBeDefined();
    expect(res.body.cashBox.id).toBe(CASH_BOX_ID);
  });

  // ── PC-I-07 ──────────────────────────────────────────────────────────────────
  it("PC-I-07: GET /:id for unknown id returns HTTP 404", async () => {
    (prisma.pettyCash.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get("/api/petty-cash/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── PC-I-08 ──────────────────────────────────────────────────────────────────
  it("PC-I-08: DELETE an OUT entry reverses balance (increments cash box) atomically", async () => {
    (prisma.pettyCash.findFirst as any).mockResolvedValue(mockEntry);
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const txMock = {
        pettyCash: { update: vi.fn().mockResolvedValue({ ...mockEntry, deletedAt: new Date() }) },
        cashBox:   { update: vi.fn().mockResolvedValue({ ...mockCashBox, currentBalance: "5200" }) },
      };
      await fn(txMock);
    });

    const res = await request(app).delete(`/api/petty-cash/${PC_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // ── PC-I-09 ──────────────────────────────────────────────────────────────────
  it("PC-I-09: DELETE an IN entry reverses balance (decrements cash box) atomically", async () => {
    const inEntry = { ...mockEntry, type: "IN", amount: "500" };
    (prisma.pettyCash.findFirst as any).mockResolvedValue(inEntry);
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const txMock = {
        pettyCash: { update: vi.fn().mockResolvedValue({ ...inEntry, deletedAt: new Date() }) },
        cashBox:   { update: vi.fn().mockResolvedValue({ ...mockCashBox, currentBalance: "4500" }) },
      };
      await fn(txMock);
    });

    const res = await request(app).delete(`/api/petty-cash/${PC_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // ── PC-I-10 ──────────────────────────────────────────────────────────────────
  it("PC-I-10: POST with missing descriptionAr returns 400 validation error", async () => {
    const res = await request(app)
      .post("/api/petty-cash")
      .send({
        cashBoxId:       CASH_BOX_ID,
        type:            "OUT",
        transactionDate: "2026-07-01",
        amount:          100,
        descriptionEn:   "Supplies",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation/i);
  });

  // ── PC-I-11 ──────────────────────────────────────────────────────────────────
  it("PC-I-11: GET /petty-cash with cashBoxId filter passes the filter to Prisma", async () => {
    (prisma.pettyCash.findMany as any).mockResolvedValue([mockEntry]);

    const res = await request(app).get(`/api/petty-cash?cashBoxId=${CASH_BOX_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].cashBoxId).toBe(CASH_BOX_ID);
  });
});
