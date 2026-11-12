import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─── Mock Clerk ───────────────────────────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  getAuth:     (_req: express.Request) => ({ userId: "clerk-user-1" }),
  clerkMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const mockUser        = { id: "user-1", clerkId: "clerk-user-1", organizationId: "org-1", deletedAt: null };
const mockAccount     = { id: "acc-1", code: "1010", nameEn: "Cash", nameAr: "النقدية", organizationId: "org-1", deletedAt: null };
const mockLines = [
  {
    id:             "line-1",
    journalEntryId: "je-1",
    accountId:      "acc-1",
    lineNumber:     1,
    debit:          { valueOf: () => 1000, toString: () => "1000" },
    credit:         { valueOf: () => 0,    toString: () => "0"    },
    journalEntry: {
      id:            "je-1",
      number:        "JE-001",
      entryDate:     new Date("2025-01-10"),
      descriptionEn: "Opening balance",
      descriptionAr: "رصيد افتتاحي",
      reference:     "REF-001",
    },
  },
  {
    id:             "line-2",
    journalEntryId: "je-2",
    accountId:      "acc-1",
    lineNumber:     1,
    debit:          { valueOf: () => 0,   toString: () => "0"   },
    credit:         { valueOf: () => 300, toString: () => "300" },
    journalEntry: {
      id:            "je-2",
      number:        "JE-002",
      entryDate:     new Date("2025-01-15"),
      descriptionEn: "Payment",
      descriptionAr: "دفعة",
      reference:     null,
    },
  },
];

const prismaUserMock    = { findFirst: vi.fn() };
const prismaAccountMock = { findFirst: vi.fn() };
const prismaLineMock    = { findMany:  vi.fn() };

vi.mock("@workspace/prisma", () => ({
  prisma: {
    user:             prismaUserMock,
    chartOfAccount:   prismaAccountMock,
    journalEntryLine: prismaLineMock,
  },
}));

// ─── App under test ───────────────────────────────────────────────────────────
async function buildApp() {
  const { default: reportsRouter } = await import("../routes/reports.js");
  const app = express();
  app.use(express.json());
  app.use("/reports", reportsRouter);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("GET /reports/account-ledger", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 400 when accountId is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ from: "2025-01-01", to: "2025-12-31" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/accountId/i);
  });

  it("returns 400 when from is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", to: "2025-12-31" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when to is missing", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when user has no organization", async () => {
    prismaUserMock.findFirst.mockResolvedValue({ ...mockUser, organizationId: null });
    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01", to: "2025-12-31" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/organization/i);
  });

  it("returns 401 when user not found", async () => {
    prismaUserMock.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01", to: "2025-12-31" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when account not found or not in org", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-unknown", from: "2025-01-01", to: "2025-12-31" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/account/i);
  });

  it("returns 200 with correct shape and account metadata", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(mockAccount);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01", to: "2025-12-31" });

    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe("acc-1");
    expect(res.body.accountCode).toBe("1010");
    expect(res.body.accountNameEn).toBe("Cash");
    expect(res.body.from).toBe("2025-01-01");
    expect(res.body.to).toBe("2025-12-31");
    expect(Array.isArray(res.body.lines)).toBe(true);
  });

  it("calculates running balance correctly across lines", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(mockAccount);
    // call 0 = prior-period beginning balance query (empty → beginningBalance = 0)
    // call 1 = period lines query
    prismaLineMock.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(mockLines);

    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01", to: "2025-12-31" });

    const lines = res.body.lines;
    expect(lines).toHaveLength(2);
    expect(lines[0].debit).toBe(1000);
    expect(lines[0].credit).toBe(0);
    expect(lines[0].runningBalance).toBe(1000);
    expect(lines[1].debit).toBe(0);
    expect(lines[1].credit).toBe(300);
    expect(lines[1].runningBalance).toBe(700);
  });

  it("returns journal entry fields on each line", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(mockAccount);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01", to: "2025-12-31" });

    const line = res.body.lines[0];
    expect(line.journalEntryId).toBe("je-1");
    expect(line.journalNumber).toBe("JE-001");
    expect(line.entryDate).toBe("2025-01-10");
    expect(line.descriptionEn).toBe("Opening balance");
    expect(line.reference).toBe("REF-001");
  });

  it("sets null for missing descriptionAr/reference", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(mockAccount);
    prismaLineMock.findMany.mockResolvedValue(mockLines);

    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01", to: "2025-12-31" });

    const line2 = res.body.lines[1];
    expect(line2.reference).toBeNull();
  });

  it("returns empty lines array when no entries match", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(mockAccount);
    prismaLineMock.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-06-01", to: "2025-06-30" });

    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(0);
  });

  it("queries only POSTED entries (Prisma called with correct filter)", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(mockAccount);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01", to: "2025-12-31" });

    const callArgs = prismaLineMock.findMany.mock.calls[0][0];
    expect(callArgs.where.journalEntry.status).toEqual({ in: ["POSTED", "REVERSED"] });
    expect(callArgs.where.journalEntry.organizationId).toBe("org-1");
    expect(callArgs.where.accountId).toBe("acc-1");
  });

  it("passes date range to Prisma query", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(mockAccount);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-03-01", to: "2025-03-31" });

    // call 0 = prior-period query (lt); call 1 = period query (gte/lte)
    const callArgs = prismaLineMock.findMany.mock.calls[1][0];
    const dateRange = callArgs.where.journalEntry.entryDate;
    expect(dateRange.gte).toEqual(new Date("2025-03-01"));
    expect(dateRange.lte).toEqual(new Date("2025-03-31"));
  });

  it("requests orderBy entryDate, number, lineNumber", async () => {
    prismaUserMock.findFirst.mockResolvedValue(mockUser);
    prismaAccountMock.findFirst.mockResolvedValue(mockAccount);
    prismaLineMock.findMany.mockResolvedValue([]);

    await request(app)
      .get("/reports/account-ledger")
      .query({ accountId: "acc-1", from: "2025-01-01", to: "2025-12-31" });

    // call 0 = prior-period query (no orderBy); call 1 = period query (has orderBy)
    const callArgs = prismaLineMock.findMany.mock.calls[1][0];
    const orderBy  = callArgs.orderBy as { journalEntry?: { entryDate?: string; number?: string }; lineNumber?: string }[];
    expect(orderBy[0]?.journalEntry?.entryDate).toBe("asc");
    expect(orderBy[1]?.journalEntry?.number).toBe("asc");
    expect(orderBy[2]?.lineNumber).toBe("asc");
  });
});
