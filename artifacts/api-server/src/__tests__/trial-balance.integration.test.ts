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
    user:             { findFirst: vi.fn() },
    fiscalYear:       { findFirst: vi.fn() },
    journalEntryLine: { findMany:  vi.fn() },
  },
}));

import reportsRouter from "../routes/reports";
import { prisma } from "@workspace/prisma";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG_ID    = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID   = "bbbbbbbb-0000-0000-0000-000000000002";
const FY_ID     = "cccccccc-0000-0000-0000-000000000003";
const ACCT_A_ID = "dddddddd-0000-0000-0000-000000000004";
const ACCT_B_ID = "eeeeeeee-0000-0000-0000-000000000005";

const mockUser = {
  id:             USER_ID,
  organizationId: ORG_ID,
  clerkId:        "test-clerk-id",
  deletedAt:      null,
};

const mockFiscalYear = {
  id:             FY_ID,
  organizationId: ORG_ID,
  nameEn:         "FY 2026",
  nameAr:         "السنة المالية 2026",
  deletedAt:      null,
};

const mockLines = [
  {
    accountId: ACCT_A_ID,
    debit:     "1000.0000",
    credit:    "0.0000",
    debitBase: "1000.0000",
    creditBase:"0.0000",
    account:   { id: ACCT_A_ID, code: "1000", nameEn: "Cash",    nameAr: "النقدية"    },
  },
  {
    accountId: ACCT_A_ID,
    debit:     "500.0000",
    credit:    "0.0000",
    debitBase: "500.0000",
    creditBase:"0.0000",
    account:   { id: ACCT_A_ID, code: "1000", nameEn: "Cash",    nameAr: "النقدية"    },
  },
  {
    accountId: ACCT_B_ID,
    debit:     "0.0000",
    credit:    "1500.0000",
    debitBase: "0.0000",
    creditBase:"1500.0000",
    account:   { id: ACCT_B_ID, code: "2000", nameEn: "Revenue", nameAr: "الإيرادات" },
  },
];

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/reports", reportsRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /reports/trial-balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TB-I-01: returns 400 when fiscalYearId is missing", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    const res = await request(createApp()).get("/reports/trial-balance");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fiscalYearId/i);
  });

  it("TB-I-02: returns 404 when fiscal year not found for this org", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(null);
    const res = await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/fiscal year/i);
  });

  it("TB-I-03: returns aggregated trial balance with correct line count", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntryLine.findMany as any).mockResolvedValue(mockLines);
    const res = await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.fiscalYearId).toBe(FY_ID);
    expect(res.body.lines).toHaveLength(2);
  });

  it("TB-I-04: debit lines are aggregated per account", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntryLine.findMany as any).mockResolvedValue(mockLines);
    const res = await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}`);
    const cashLine = res.body.lines.find((l: any) => l.accountCode === "1000");
    expect(cashLine.totalDebit).toBe(1500);
    expect(cashLine.totalCredit).toBe(0);
    expect(cashLine.balance).toBe(1500);
  });

  it("TB-I-05: totalDebit and totalCredit match sum of lines", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntryLine.findMany as any).mockResolvedValue(mockLines);
    const res = await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}`);
    expect(res.body.totalDebit).toBe(1500);
    expect(res.body.totalCredit).toBe(1500);
  });

  it("TB-I-06: returns empty lines when no posted entries exist", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntryLine.findMany as any).mockResolvedValue([]);
    const res = await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(0);
    expect(res.body.totalDebit).toBe(0);
    expect(res.body.totalCredit).toBe(0);
  });

  it("TB-I-07: respects asOf date parameter", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntryLine.findMany as any).mockResolvedValue([]);
    const res = await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}&asOf=2026-06-30`);
    expect(res.status).toBe(200);
    expect(res.body.asOf).toBe("2026-06-30");
    const callArg = (prisma.journalEntryLine.findMany as any).mock.calls[0][0];
    expect(callArg.where.journalEntry.entryDate).toEqual({ lte: new Date("2026-06-30") });
  });

  it("TB-I-08: asOf is null when not provided", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntryLine.findMany as any).mockResolvedValue([]);
    const res = await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}`);
    expect(res.body.asOf).toBeNull();
  });

  it("TB-I-09: includes POSTED and REVERSED journal entry lines", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntryLine.findMany as any).mockResolvedValue([]);
    await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}`);
    const callArg = (prisma.journalEntryLine.findMany as any).mock.calls[0][0];
    expect(callArg.where.journalEntry.status).toEqual({ in: ["POSTED", "REVERSED", "LOCKED"] });
    expect(callArg.where.journalEntry.fiscalYearId).toBe(FY_ID);
  });

  it("TB-I-10: lines are sorted by accountCode ascending", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFiscalYear);
    (prisma.journalEntryLine.findMany as any).mockResolvedValue([
      { accountId: ACCT_B_ID, debit: "0.0000", credit: "1000.0000", debitBase: "0.0000", creditBase: "1000.0000",
        account: { id: ACCT_B_ID, code: "2000", nameEn: "Revenue", nameAr: "الإيرادات" } },
      { accountId: ACCT_A_ID, debit: "1000.0000", credit: "0.0000", debitBase: "1000.0000", creditBase: "0.0000",
        account: { id: ACCT_A_ID, code: "1000", nameEn: "Cash", nameAr: "النقدية" } },
    ]);
    const res = await request(createApp()).get(`/reports/trial-balance?fiscalYearId=${FY_ID}`);
    expect(res.body.lines[0].accountCode).toBe("1000");
    expect(res.body.lines[1].accountCode).toBe("2000");
  });
});
