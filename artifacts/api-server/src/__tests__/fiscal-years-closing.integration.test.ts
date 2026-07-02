import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─── Mock Clerk ───────────────────────────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  getAuth:         (_req: express.Request) => ({ userId: "clerk-user-1" }),
  clerkMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// ─── Shared fixtures ──────────────────────────────────────────────────────────
const mockUser = {
  id: "user-1", clerkId: "clerk-user-1",
  organizationId: "org-1", email: "test@test.com", deletedAt: null,
};

const mockFiscalYear = {
  id: "fy-1", organizationId: "org-1", nameEn: "FY 2025", nameAr: "السنة 2025",
  status: "OPEN", endDate: new Date("2025-12-31"), deletedAt: null,
  closedAt: null, closedByUserId: null,
};

const mockReAccount = {
  id: "re-acc-1", organizationId: "org-1",
  code: "3100", nameEn: "Retained Earnings", nameAr: "الأرباح المحتجزة",
  type: "EQUITY", isActive: true, deletedAt: null,
};

function makeDecimal(n: number) {
  return { valueOf: () => n, toString: () => String(n) };
}

const mockPostedLines = [
  {
    id: "jl-1", accountId: "rev-1",
    debit: makeDecimal(0), credit: makeDecimal(50000),
    account: { id: "rev-1", code: "4010", nameEn: "Sales", nameAr: "مبيعات", type: "REVENUE", nature: "CREDIT" },
  },
  {
    id: "jl-2", accountId: "exp-1",
    debit: makeDecimal(30000), credit: makeDecimal(0),
    account: { id: "exp-1", code: "5010", nameEn: "Salaries", nameAr: "رواتب", type: "EXPENSE", nature: "DEBIT" },
  },
];

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const prismaUserMock           = { findFirst: vi.fn() };
const prismaFiscalYearMock     = { findFirst: vi.fn(), update: vi.fn() };
const prismaJEMock             = { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() };
const prismaChartOfAccountMock = { findFirst: vi.fn() };
const prismaJELineMock         = { findMany: vi.fn() };
const prismaTransactionMock    = vi.fn();

vi.mock("@workspace/prisma", () => ({
  prisma: {
    user:             prismaUserMock,
    fiscalYear:       prismaFiscalYearMock,
    journalEntry:     prismaJEMock,
    chartOfAccount:   prismaChartOfAccountMock,
    journalEntryLine: prismaJELineMock,
    $transaction:     prismaTransactionMock,
  },
}));

// ─── App factory ─────────────────────────────────────────────────────────────
async function buildApp() {
  const { default: fiscalYearsRouter } = await import("../routes/fiscal-years.js");
  const app = express();
  app.use(express.json());
  app.use("/fiscal-years", fiscalYearsRouter);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("POST /fiscal-years/:id/close", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 404 when fiscal year is not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/fiscal-years/fy-404/close")
      .send({ retainedEarningsAccountId: "re-acc-1" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 400 when retainedEarningsAccountId is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);

    const res = await request(app)
      .post("/fiscal-years/fy-1/close")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/retainedEarningsAccountId/i);
  });

  it("returns 400 when fiscal year is already CLOSED", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue({ ...mockFiscalYear, status: "CLOSED" });

    const res = await request(app)
      .post("/fiscal-years/fy-1/close")
      .send({ retainedEarningsAccountId: "re-acc-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already CLOSED/i);
  });

  it("returns 400 when fiscal year is already LOCKED", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue({ ...mockFiscalYear, status: "LOCKED" });

    const res = await request(app)
      .post("/fiscal-years/fy-1/close")
      .send({ retainedEarningsAccountId: "re-acc-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already LOCKED/i);
  });

  it("returns 400 when closing entries already exist", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaJEMock.findFirst.mockResolvedValue({ id: "je-existing", type: "CLOSING" });

    const res = await request(app)
      .post("/fiscal-years/fy-1/close")
      .send({ retainedEarningsAccountId: "re-acc-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exist/i);
  });

  it("returns 400 when retained earnings account is not found or not EQUITY", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaJEMock.findFirst.mockResolvedValue(null);
    prismaChartOfAccountMock.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/fiscal-years/fy-1/close")
      .send({ retainedEarningsAccountId: "wrong-acc-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/EQUITY/i);
  });

  it("returns 400 when no revenue or expense balances exist", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaJEMock.findFirst.mockResolvedValue(null);
    prismaChartOfAccountMock.findFirst.mockResolvedValue(mockReAccount);
    prismaJELineMock.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post("/fiscal-years/fy-1/close")
      .send({ retainedEarningsAccountId: "re-acc-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no revenue or expense/i);
  });

  it("returns 200 with closing result on success", async () => {
    const closingEntry = { id: "je-closing-1", totalDebit: 50000, totalCredit: 50000 };
    const closedFY     = { ...mockFiscalYear, status: "CLOSED", closedAt: new Date("2026-01-01") };

    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaJEMock.findFirst.mockResolvedValue(null);
    prismaJEMock.findMany.mockResolvedValue([]); // for generateJournalNumber
    prismaChartOfAccountMock.findFirst.mockResolvedValue(mockReAccount);
    prismaJELineMock.findMany.mockResolvedValue(mockPostedLines);
    prismaTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        journalEntry: {
          create: vi.fn().mockResolvedValue(closingEntry),
        },
        fiscalYear: {
          update: vi.fn().mockResolvedValue(closedFY),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post("/fiscal-years/fy-1/close")
      .send({ retainedEarningsAccountId: "re-acc-1" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CLOSED");
    expect(res.body.fiscalYearId).toBe("fy-1");
    expect(res.body.closingJournalEntryId).toBe("je-closing-1");
    expect(res.body.netIncome).toBe(20000); // revenue 50000 - expenses 30000
  });

  it("returns 401 when user is not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/fiscal-years/fy-1/close")
      .send({ retainedEarningsAccountId: "re-acc-1" });

    expect(res.status).toBe(401);
  });
});
