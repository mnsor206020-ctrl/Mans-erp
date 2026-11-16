import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─── Mock Clerk ───────────────────────────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  getAuth:         (_req: express.Request) => ({ userId: "clerk-user-1" }),
  clerkMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const mockUser       = { id: "user-1", clerkId: "clerk-user-1", organizationId: "org-1", deletedAt: null };
const mockFiscalYear = { id: "fy-1", organizationId: "org-1", deletedAt: null };

function makeDecimal(n: number) {
  return { valueOf: () => n, toString: () => String(n) };
}

const mockLines = [
  {
    id: "jl-1", journalEntryId: "je-1", accountId: "acc-rev-1",
    debit:  makeDecimal(0), credit: makeDecimal(50000),
    debitBase: makeDecimal(0), creditBase: makeDecimal(50000),
    account: { id: "acc-rev-1", code: "4010", nameEn: "Sales", nameAr: "مبيعات", type: "REVENUE", nature: "CREDIT" },
  },
  {
    id: "jl-2", journalEntryId: "je-1", accountId: "acc-exp-1",
    debit:  makeDecimal(20000), credit: makeDecimal(0),
    debitBase: makeDecimal(20000), creditBase: makeDecimal(0),
    account: { id: "acc-exp-1", code: "5010", nameEn: "Salaries", nameAr: "رواتب", type: "EXPENSE", nature: "DEBIT" },
  },
  {
    id: "jl-3", journalEntryId: "je-1", accountId: "acc-exp-2",
    debit:  makeDecimal(10000), credit: makeDecimal(0),
    debitBase: makeDecimal(10000), creditBase: makeDecimal(0),
    account: { id: "acc-exp-2", code: "5020", nameEn: "Rent", nameAr: "إيجار", type: "EXPENSE", nature: "DEBIT" },
  },
];

const prismaUserMock       = { findFirst: vi.fn() };
const prismaFiscalYearMock = { findFirst: vi.fn() };
const prismaLineMock       = { findMany:  vi.fn() };

vi.mock("@workspace/prisma", () => ({
  prisma: {
    user:             prismaUserMock,
    fiscalYear:       prismaFiscalYearMock,
    journalEntryLine: prismaLineMock,
  },
}));

// ─── App factory ─────────────────────────────────────────────────────────────
async function buildApp() {
  const { default: reportsRouter } = await import("../routes/reports.js");
  const app = express();
  app.use(express.json());
  app.use("/reports", reportsRouter);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("GET /reports/income-statement", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 400 when fiscalYearId is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    const res = await request(app)
      .get("/reports/income-statement")
      .query({ from: "2025-01-01", to: "2025-12-31" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fiscalYearId/i);
  });

  it("returns 400 when from is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", to: "2025-12-31" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/from/i);
  });

  it("returns 400 when to is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/to/i);
  });

  it("returns 400 when user has no organization", async () => {
    prismaUserMock.findFirst.mockResolvedValue({ ...mockUser, organizationId: null });
    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/organization/i);
  });

  it("returns 401 when user not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when fiscal year not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-unknown", from: "2025-01-01", to: "2025-12-31" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/fiscal year/i);
  });

  it("returns 200 with correct top-level shape", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("fiscalYearId", "fy-1");
    expect(res.body).toHaveProperty("from", "2025-01-01");
    expect(res.body).toHaveProperty("to", "2025-12-31");
    expect(Array.isArray(res.body.revenue)).toBe(true);
    expect(Array.isArray(res.body.expenses)).toBe(true);
    expect(typeof res.body.totalRevenue).toBe("number");
    expect(typeof res.body.totalExpenses).toBe("number");
    expect(typeof res.body.netIncome).toBe("number");
  });

  it("places accounts into correct sections", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    expect(res.body.revenue).toHaveLength(1);
    expect(res.body.revenue[0].accountId).toBe("acc-rev-1");
    expect(res.body.expenses).toHaveLength(2);
  });

  it("calculates CREDIT-nature balance as credit minus debit", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    expect(res.body.revenue[0].balance).toBe(50000);   // 50000 - 0
    expect(res.body.totalRevenue).toBe(50000);
  });

  it("calculates DEBIT-nature balance as debit minus credit", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    const salaries = res.body.expenses.find((e: { accountCode: string }) => e.accountCode === "5010");
    expect(salaries.balance).toBe(20000);
    expect(res.body.totalExpenses).toBe(30000);
  });

  it("computes netIncome = totalRevenue − totalExpenses", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    // 50000 - 30000 = 20000
    expect(res.body.netIncome).toBe(20000);
  });

  it("returns netIncome < 0 when expenses exceed revenue", async () => {
    const lossLines = [
      {
        id: "jl-x", journalEntryId: "je-x", accountId: "acc-rev-x",
        debit: makeDecimal(0), credit: makeDecimal(1000),
        debitBase: makeDecimal(0), creditBase: makeDecimal(1000),
        account: { id: "acc-rev-x", code: "4010", nameEn: "Sales", nameAr: "مبيعات", type: "REVENUE", nature: "CREDIT" },
      },
      {
        id: "jl-y", journalEntryId: "je-x", accountId: "acc-exp-x",
        debit: makeDecimal(5000), credit: makeDecimal(0),
        debitBase: makeDecimal(5000), creditBase: makeDecimal(0),
        account: { id: "acc-exp-x", code: "5010", nameEn: "Cost", nameAr: "تكاليف", type: "EXPENSE", nature: "DEBIT" },
      },
    ];
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(lossLines);

    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    expect(res.body.netIncome).toBe(-4000);
  });

  it("returns empty sections and netIncome=0 when no entries", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    expect(res.body.revenue).toHaveLength(0);
    expect(res.body.expenses).toHaveLength(0);
    expect(res.body.netIncome).toBe(0);
  });

  it("queries only REVENUE and EXPENSE account types", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.account.type.in).toEqual(
      expect.arrayContaining(["REVENUE", "EXPENSE"]),
    );
    expect(callArgs.where.account.type.in).toHaveLength(2);
  });

  it("queries only POSTED journal entries", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.journalEntry.status).toEqual({ in: ["POSTED", "REVERSED", "LOCKED"] });
    expect(callArgs.where.journalEntry.fiscalYearId).toBe("fy-1");
  });

  it("applies from/to as inclusive date range on entryDate", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-04-01", to: "2025-06-30" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.journalEntry.entryDate.gte).toEqual(new Date("2025-04-01"));
    expect(callArgs.where.journalEntry.entryDate.lte).toEqual(new Date("2025-06-30"));
  });

  it("scopes account query to the user's organization", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/income-statement")
      .query({ fiscalYearId: "fy-1", from: "2025-01-01", to: "2025-12-31" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.account.organizationId).toBe("org-1");
  });
});
