import "./helpers/legacy-accounting-boundary";
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
import { userRolesGrantingAll } from "./helpers/rbac";

const mockUser = {
  id: "user-1", clerkId: "clerk-user-1",
  organizationId: "org-1", email: "test@test.com", deletedAt: null,
  userRoles: userRolesGrantingAll("fiscal_years"),
};

const mockClosedFY = {
  id: "fy-1", organizationId: "org-1", nameEn: "FY 2025", nameAr: "السنة 2025",
  status: "CLOSED", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31"),
  closedAt: new Date("2026-01-01"), closedByUserId: "user-1",
  previousFiscalYearId: null, deletedAt: null,
};

function makeDecimal(n: number) {
  return { valueOf: () => n, toString: () => String(n) };
}

const mockPostedLines = [
  {
    id: "jl-1", accountId: "cash-1",
    debit: makeDecimal(80000), credit: makeDecimal(0),
    account: { id: "cash-1", code: "1010", nameEn: "Cash", nameAr: "نقدية", type: "ASSET", nature: "DEBIT" },
  },
  {
    id: "jl-2", accountId: "ap-1",
    debit: makeDecimal(0), credit: makeDecimal(20000),
    account: { id: "ap-1", code: "2010", nameEn: "Accounts Payable", nameAr: "ذمم دائنة", type: "LIABILITY", nature: "CREDIT" },
  },
  {
    id: "jl-3", accountId: "capital-1",
    debit: makeDecimal(0), credit: makeDecimal(60000),
    account: { id: "capital-1", code: "3010", nameEn: "Capital", nameAr: "رأس المال", type: "EQUITY", nature: "CREDIT" },
  },
];

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const prismaUserMock           = { findFirst: vi.fn() };
const prismaFiscalYearMock     = { findFirst: vi.fn(), create: vi.fn() };
const prismaJEMock             = { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() };
const prismaJELineMock         = { findMany: vi.fn() };
const prismaTransactionMock    = vi.fn();

vi.mock("@workspace/prisma", () => ({
  prisma: {
    user:             prismaUserMock,
    fiscalYear:       prismaFiscalYearMock,
    journalEntry:     prismaJEMock,
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
describe("POST /fiscal-years/:id/rollover", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 404 when fiscal year is not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue(null);

    const res = await request(app).post("/fiscal-years/fy-404/rollover").send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 400 when fiscal year is still OPEN", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst.mockResolvedValue({ ...mockClosedFY, status: "OPEN" });

    const res = await request(app).post("/fiscal-years/fy-1/rollover").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must be CLOSED/i);
  });

  it("returns 400 when a rollover already exists for this fiscal year", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst
      .mockResolvedValueOnce(mockClosedFY)                                  // source lookup
      .mockResolvedValueOnce({ id: "fy-2", previousFiscalYearId: "fy-1" }); // existing next FY

    const res = await request(app).post("/fiscal-years/fy-1/rollover").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been rolled over/i);
  });

  it("returns 400 when a fiscal year with the same dates already exists", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst
      .mockResolvedValueOnce(mockClosedFY) // source lookup
      .mockResolvedValueOnce(null)          // no existing next FY
      .mockResolvedValueOnce({ id: "fy-overlap" }); // overlapping window

    const res = await request(app).post("/fiscal-years/fy-1/rollover").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("تتداخل");
  });

  it("returns 400 when there are no balance sheet balances to roll forward", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst
      .mockResolvedValueOnce(mockClosedFY)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockClosedFY); // immediate preceding year
    prismaJELineMock.findMany.mockResolvedValue([]);

    const res = await request(app).post("/fiscal-years/fy-1/rollover").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no balance sheet/i);
  });

  it("returns 201 with the new fiscal year and opening entry on success", async () => {
    const newFY = {
      id: "fy-2", organizationId: "org-1", previousFiscalYearId: "fy-1",
      status: "OPEN", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    };
    const openingEntry = { id: "je-opening-1" };

    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaFiscalYearMock.findFirst
      .mockResolvedValueOnce(mockClosedFY) // source lookup
      .mockResolvedValueOnce(null)          // no existing next FY
      .mockResolvedValueOnce(null)          // no overlap
      .mockResolvedValueOnce(mockClosedFY); // immediate preceding year
    prismaJELineMock.findMany.mockResolvedValue(mockPostedLines);
    prismaJEMock.findMany.mockResolvedValue([]); // for generateJournalNumber

    prismaTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        fiscalYear:   { create: vi.fn().mockResolvedValue(newFY) },
        journalEntry: { findMany: prismaJEMock.findMany, create: vi.fn().mockResolvedValue(openingEntry) },
      };
      return fn(tx);
    });

    const res = await request(app).post("/fiscal-years/fy-1/rollover").send({});

    expect(res.status).toBe(201);
    expect(res.body.fiscalYearId).toBe("fy-2");
    expect(res.body.previousFiscalYearId).toBe("fy-1");
    expect(res.body.status).toBe("OPEN");
    expect(res.body.openingJournalEntryId).toBe("je-opening-1");
  });

  it("returns 401 when user is not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(null);

    const res = await request(app).post("/fiscal-years/fy-1/rollover").send({});

    expect(res.status).toBe(401);
  });
});
