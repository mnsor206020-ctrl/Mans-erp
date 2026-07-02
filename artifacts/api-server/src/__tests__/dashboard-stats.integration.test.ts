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
const mockUserNoOrg  = { id: "user-2", clerkId: "clerk-user-1", organizationId: null,    deletedAt: null };

function makeDecimal(n: number) {
  return { valueOf: () => n, toString: () => String(n) };
}

const mockReceiptAgg = { _sum: { amountBase: makeDecimal(100000) } };
const mockPaymentAgg = { _sum: { amountBase: makeDecimal(60000)  } };
const mockBankAgg    = { _sum: { currentBalance: makeDecimal(250000) } };
const mockCashBoxAgg = { _sum: { currentBalance: makeDecimal(15000)  } };

const prismaUserMock    = { findFirst: vi.fn(), count: vi.fn() };
const prismaOrgMock     = { count: vi.fn() };
const prismaReceiptMock = { aggregate: vi.fn() };
const prismaPaymentMock = { aggregate: vi.fn() };
const prismaBankMock    = { aggregate: vi.fn() };
const prismaCashMock    = { aggregate: vi.fn() };
const prismaJEMock      = { count: vi.fn() };
const prismaAuditMock   = { findMany: vi.fn() };
const prismaQueryRaw    = vi.fn();

vi.mock("@workspace/prisma", () => ({
  prisma: {
    user:         prismaUserMock,
    organization: prismaOrgMock,
    receipt:      prismaReceiptMock,
    payment:      prismaPaymentMock,
    bankAccount:  prismaBankMock,
    cashBox:      prismaCashMock,
    journalEntry: prismaJEMock,
    auditLog:     prismaAuditMock,
    $queryRaw:    (...args: unknown[]) => prismaQueryRaw(...args),
  },
}));

// ─── App factory ─────────────────────────────────────────────────────────────
async function buildApp() {
  const { default: dashboardRouter } = await import("../routes/dashboard.js");
  const app = express();
  app.use(express.json());
  app.use("/dashboard", dashboardRouter);
  return app;
}

// ─── GET /dashboard/stats tests ───────────────────────────────────────────────
describe("GET /dashboard/stats", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when user not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(null);
    prismaUserMock.count.mockResolvedValue(0);
    prismaOrgMock.count.mockResolvedValue(0);

    const res = await request(app).get("/dashboard/stats");
    expect(res.status).toBe(401);
  });

  it("returns zeros for financial KPIs when user has no org", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUserNoOrg);
    prismaUserMock.count.mockResolvedValue(5);
    prismaOrgMock.count.mockResolvedValue(3);

    const res = await request(app).get("/dashboard/stats");
    expect(res.status).toBe(200);
    expect(res.body.totalReceipts).toBe(0);
    expect(res.body.totalPayments).toBe(0);
    expect(res.body.netCash).toBe(0);
    expect(res.body.currentBankBalance).toBe(0);
    expect(res.body.currentCashBoxBalance).toBe(0);
    expect(res.body.postedJournalEntriesCount).toBe(0);
  });

  it("returns 200 with correct top-level shape", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(10);
    prismaOrgMock.count.mockResolvedValue(2);
    prismaReceiptMock.aggregate.mockResolvedValue(mockReceiptAgg);
    prismaPaymentMock.aggregate.mockResolvedValue(mockPaymentAgg);
    prismaBankMock.aggregate.mockResolvedValue(mockBankAgg);
    prismaCashMock.aggregate.mockResolvedValue(mockCashBoxAgg);
    prismaJEMock.count.mockResolvedValue(42);

    const res = await request(app).get("/dashboard/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalReceipts");
    expect(res.body).toHaveProperty("totalPayments");
    expect(res.body).toHaveProperty("netCash");
    expect(res.body).toHaveProperty("currentBankBalance");
    expect(res.body).toHaveProperty("currentCashBoxBalance");
    expect(res.body).toHaveProperty("postedJournalEntriesCount");
  });

  it("computes totalReceipts from aggregate sum", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(1);
    prismaOrgMock.count.mockResolvedValue(1);
    prismaReceiptMock.aggregate.mockResolvedValue(mockReceiptAgg);
    prismaPaymentMock.aggregate.mockResolvedValue(mockPaymentAgg);
    prismaBankMock.aggregate.mockResolvedValue(mockBankAgg);
    prismaCashMock.aggregate.mockResolvedValue(mockCashBoxAgg);
    prismaJEMock.count.mockResolvedValue(0);

    const res = await request(app).get("/dashboard/stats");
    expect(res.body.totalReceipts).toBe(100000);
  });

  it("computes totalPayments from aggregate sum", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(1);
    prismaOrgMock.count.mockResolvedValue(1);
    prismaReceiptMock.aggregate.mockResolvedValue(mockReceiptAgg);
    prismaPaymentMock.aggregate.mockResolvedValue(mockPaymentAgg);
    prismaBankMock.aggregate.mockResolvedValue(mockBankAgg);
    prismaCashMock.aggregate.mockResolvedValue(mockCashBoxAgg);
    prismaJEMock.count.mockResolvedValue(0);

    const res = await request(app).get("/dashboard/stats");
    expect(res.body.totalPayments).toBe(60000);
  });

  it("computes netCash = totalReceipts − totalPayments", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(1);
    prismaOrgMock.count.mockResolvedValue(1);
    prismaReceiptMock.aggregate.mockResolvedValue(mockReceiptAgg);
    prismaPaymentMock.aggregate.mockResolvedValue(mockPaymentAgg);
    prismaBankMock.aggregate.mockResolvedValue(mockBankAgg);
    prismaCashMock.aggregate.mockResolvedValue(mockCashBoxAgg);
    prismaJEMock.count.mockResolvedValue(0);

    const res = await request(app).get("/dashboard/stats");
    expect(res.body.netCash).toBe(40000); // 100000 - 60000
  });

  it("returns currentBankBalance from bankAccount aggregate", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(1);
    prismaOrgMock.count.mockResolvedValue(1);
    prismaReceiptMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaPaymentMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaBankMock.aggregate.mockResolvedValue(mockBankAgg);
    prismaCashMock.aggregate.mockResolvedValue(mockCashBoxAgg);
    prismaJEMock.count.mockResolvedValue(0);

    const res = await request(app).get("/dashboard/stats");
    expect(res.body.currentBankBalance).toBe(250000);
  });

  it("returns postedJournalEntriesCount", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(1);
    prismaOrgMock.count.mockResolvedValue(1);
    prismaReceiptMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaPaymentMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaBankMock.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    prismaCashMock.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    prismaJEMock.count.mockResolvedValue(87);

    const res = await request(app).get("/dashboard/stats");
    expect(res.body.postedJournalEntriesCount).toBe(87);
  });

  it("queries receipts scoped to org with CONFIRMED status", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(1);
    prismaOrgMock.count.mockResolvedValue(1);
    prismaReceiptMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaPaymentMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaBankMock.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    prismaCashMock.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    prismaJEMock.count.mockResolvedValue(0);

    await request(app).get("/dashboard/stats");

    const args = prismaReceiptMock.aggregate.mock.calls[0][0];
    expect(args.where.organizationId).toBe("org-1");
    expect(args.where.status).toBe("CONFIRMED");
    expect(args.where.deletedAt).toBe(null);
    expect(args._sum.amountBase).toBe(true);
  });

  it("queries journal entries scoped to org with POSTED status", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(1);
    prismaOrgMock.count.mockResolvedValue(1);
    prismaReceiptMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaPaymentMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaBankMock.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    prismaCashMock.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    prismaJEMock.count.mockResolvedValue(0);

    await request(app).get("/dashboard/stats");

    const args = prismaJEMock.count.mock.calls[0][0];
    expect(args.where.organizationId).toBe("org-1");
    expect(args.where.status).toBe("POSTED");
    expect(args.where.deletedAt).toBe(null);
  });

  it("handles null aggregate sums gracefully (returns 0)", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaUserMock.count.mockResolvedValue(1);
    prismaOrgMock.count.mockResolvedValue(1);
    prismaReceiptMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaPaymentMock.aggregate.mockResolvedValue({ _sum: { amountBase: null } });
    prismaBankMock.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    prismaCashMock.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    prismaJEMock.count.mockResolvedValue(0);

    const res = await request(app).get("/dashboard/stats");
    expect(res.body.totalReceipts).toBe(0);
    expect(res.body.totalPayments).toBe(0);
    expect(res.body.currentBankBalance).toBe(0);
    expect(res.body.currentCashBoxBalance).toBe(0);
  });
});

// ─── GET /dashboard/monthly tests ────────────────────────────────────────────
describe("GET /dashboard/monthly", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 400 when user has no organization", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUserNoOrg);

    const res = await request(app).get("/dashboard/monthly");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/organization/i);
  });

  it("returns 401 when user not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(null);

    const res = await request(app).get("/dashboard/monthly");
    expect(res.status).toBe(401);
  });

  it("returns 200 with array of 12 data points", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaQueryRaw.mockResolvedValue([]); // called twice (receipts + payments)

    const res = await request(app).get("/dashboard/monthly");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(12);
  });

  it("returns zero values for months with no data", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaQueryRaw.mockResolvedValue([]);

    const res = await request(app).get("/dashboard/monthly");
    for (const row of res.body) {
      expect(row.receipts).toBe(0);
      expect(row.payments).toBe(0);
      expect(row.net).toBe(0);
    }
  });

  it("data points have the required shape", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaQueryRaw.mockResolvedValue([]);

    const res = await request(app).get("/dashboard/monthly");
    for (const row of res.body) {
      expect(row).toHaveProperty("month");
      expect(row).toHaveProperty("receipts");
      expect(row).toHaveProperty("payments");
      expect(row).toHaveProperty("net");
      expect(row.month).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("month array is in chronological order", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaQueryRaw.mockResolvedValue([]);

    const res = await request(app).get("/dashboard/monthly");
    const months: string[] = res.body.map((r: { month: string }) => r.month);
    for (let i = 1; i < months.length; i++) {
      expect(months[i] > months[i - 1]).toBe(true);
    }
  });
});
