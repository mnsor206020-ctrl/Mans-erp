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
    id: "jl-1", journalEntryId: "je-1", accountId: "acc-asset-1",
    debit:  makeDecimal(10000), credit: makeDecimal(0),
    account: { id: "acc-asset-1", code: "1010", nameEn: "Cash", nameAr: "نقد", type: "ASSET", nature: "DEBIT" },
  },
  {
    id: "jl-2", journalEntryId: "je-1", accountId: "acc-liab-1",
    debit:  makeDecimal(0), credit: makeDecimal(4000),
    account: { id: "acc-liab-1", code: "2010", nameEn: "AP", nameAr: "ذمم دائنة", type: "LIABILITY", nature: "CREDIT" },
  },
  {
    id: "jl-3", journalEntryId: "je-1", accountId: "acc-equity-1",
    debit:  makeDecimal(0), credit: makeDecimal(6000),
    account: { id: "acc-equity-1", code: "3010", nameEn: "Capital", nameAr: "رأس المال", type: "EQUITY", nature: "CREDIT" },
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
describe("GET /reports/balance-sheet", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 400 when fiscalYearId is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ asOf: "2025-12-31" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fiscalYearId/i);
  });

  it("returns 400 when asOf is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/asOf/i);
  });

  it("returns 400 when user has no organization", async () => {
    prismaUserMock.findFirst.mockResolvedValue({ ...mockUser, organizationId: null });
    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/organization/i);
  });

  it("returns 401 when user not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when fiscal year not found or not in org", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-unknown", asOf: "2025-12-31" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/fiscal year/i);
  });

  it("returns 200 with correct top-level shape", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("fiscalYearId", "fy-1");
    expect(res.body).toHaveProperty("asOf", "2025-12-31");
    expect(Array.isArray(res.body.assets)).toBe(true);
    expect(Array.isArray(res.body.liabilities)).toBe(true);
    expect(Array.isArray(res.body.equity)).toBe(true);
    expect(typeof res.body.totalAssets).toBe("number");
    expect(typeof res.body.totalLiabilities).toBe("number");
    expect(typeof res.body.totalEquity).toBe("number");
    expect(typeof res.body.isBalanced).toBe("boolean");
  });

  it("places accounts into correct sections", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    expect(res.body.assets).toHaveLength(1);
    expect(res.body.assets[0].accountId).toBe("acc-asset-1");
    expect(res.body.liabilities).toHaveLength(1);
    expect(res.body.liabilities[0].accountId).toBe("acc-liab-1");
    expect(res.body.equity).toHaveLength(1);
    expect(res.body.equity[0].accountId).toBe("acc-equity-1");
  });

  it("calculates DEBIT-nature balance as debit minus credit", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    expect(res.body.assets[0].balance).toBe(10000);    // 10000 - 0
    expect(res.body.totalAssets).toBe(10000);
  });

  it("calculates CREDIT-nature balance as credit minus debit", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    expect(res.body.liabilities[0].balance).toBe(4000);  // 4000 - 0
    expect(res.body.equity[0].balance).toBe(6000);        // 6000 - 0
  });

  it("isBalanced true when equation holds (10000 = 4000 + 6000)", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    expect(res.body.isBalanced).toBe(true);
  });

  it("returns empty sections and isBalanced=true when no posted entries", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    expect(res.body.assets).toHaveLength(0);
    expect(res.body.liabilities).toHaveLength(0);
    expect(res.body.equity).toHaveLength(0);
    expect(res.body.totalAssets).toBe(0);
    expect(res.body.isBalanced).toBe(true);
  });

  it("queries only ASSET/LIABILITY/EQUITY account types", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.account.type.in).toEqual(
      expect.arrayContaining(["ASSET", "LIABILITY", "EQUITY"]),
    );
    expect(callArgs.where.account.type.in).toHaveLength(3);
  });

  it("queries only POSTED journal entries", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.journalEntry.status).toBe("POSTED");
    expect(callArgs.where.journalEntry.fiscalYearId).toBe("fy-1");
  });

  it("applies asOf as entryDate upper bound", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-06-30" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.journalEntry.entryDate.lte).toEqual(new Date("2025-06-30"));
  });

  it("scopes account query to organization", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(mockFiscalYear);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/balance-sheet")
      .query({ fiscalYearId: "fy-1", asOf: "2025-12-31" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.account.organizationId).toBe("org-1");
  });
});
