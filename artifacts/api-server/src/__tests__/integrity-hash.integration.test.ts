import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { computeIntegrityHash } from "../services/integrity-hash";

// ── Mock Clerk before router import ───────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "test-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

// ── Mock Prisma before router import ──────────────────────────────────────────
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user:                 { findFirst: vi.fn() },
    fiscalYear:           { findFirst: vi.fn() },
    journalEntry:         { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    chartOfAccount:       { findFirst: vi.fn() },
    journalEntryLine:     { deleteMany: vi.fn(), createMany: vi.fn() },
    journalEntryApproval: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    auditLog:             { create: vi.fn() },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const { prisma } = await import("@workspace/prisma");
      return fn(prisma);
    }),
  },
}));

import journalEntriesRouter from "../routes/journal-entries";
import { prisma } from "@workspace/prisma";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ORG_ID   = "aaaaaaaa-0000-0000-0000-000000000001";
const FY_ID    = "bbbbbbbb-0000-0000-0000-000000000002";
const ENTRY_ID = "cccccccc-0000-0000-0000-000000000003";
const USER_ID  = "dddddddd-0000-0000-0000-000000000004";
const ACCT_1   = "eeeeeeee-0000-0000-0000-000000000005";
const ACCT_2   = "ffffffff-0000-0000-0000-000000000006";

const mockUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  email: "test@example.com",
  clerkId: "test-clerk-id",
};

const twoBalancedLines = [
  {
    lineNumber: 1,
    accountId: ACCT_1,
    debit: "500.0000", credit: "0.0000",
    debitBase: "500.0000", creditBase: "0.0000",
    account: { isActive: true, isGroup: false, code: "1001" },
  },
  {
    lineNumber: 2,
    accountId: ACCT_2,
    debit: "0.0000", credit: "500.0000",
    debitBase: "0.0000", creditBase: "500.0000",
    account: { isActive: true, isGroup: false, code: "2001" },
  },
];

const mockApproved = {
  id:             ENTRY_ID,
  number:         "JE-2026-0001",
  organizationId: ORG_ID,
  fiscalYearId:   FY_ID,
  status:         "APPROVED",
  entryDate:      new Date("2026-06-30T00:00:00.000Z"),
  type:           "MANUAL",
  currencyCode:   "SAR",
  exchangeRate:   "1.00000000",
  totalDebit:     "500.0000",
  totalCredit:    "500.0000",
  deletedAt:      null,
  fiscalYear:     { status: "OPEN" },
  lines:          twoBalancedLines,
};

const app = express();
app.use(express.json());
app.use("/api/journal-entries", journalEntriesRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Integrity Hash — Integration (Sprint 2.4 Milestone 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst                 as any).mockResolvedValue(mockUser);
    (prisma.auditLog.create                as any).mockResolvedValue({});
    (prisma.journalEntryApproval.create    as any).mockResolvedValue({});
    (prisma.journalEntryApproval.findFirst as any).mockResolvedValue(null);
    (prisma.journalEntryApproval.findMany  as any).mockResolvedValue([]);
    (prisma.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(prisma));
  });

  // ── H-01: POST from APPROVED → 200, hash stored ───────────────────────────
  it("H-01: POST /:id/post from APPROVED → 200, integrityHash populated, status = POSTED", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockApproved);
    (prisma.journalEntry.update    as any).mockResolvedValue({
      ...mockApproved,
      status:        "POSTED",
      integrityHash: "a".repeat(64),
      hashAlgorithm: "SHA-256",
      hashedAt:      new Date(),
    });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/post`);

    expect(res.status).toBe(200);

    const updateCall = (prisma.journalEntry.update as any).mock.calls[0][0];
    expect(updateCall.data.status).toBe("POSTED");
    expect(updateCall.data.integrityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(updateCall.data.hashAlgorithm).toBe("SHA-256");
    expect(updateCall.data.hashedAt).toBeInstanceOf(Date);
    expect(updateCall.data.postedAt).toBeInstanceOf(Date);
    expect(updateCall.data.postedByUserId).toBe(USER_ID);
  });

  // ── H-02: postedAt and hashedAt are the same timestamp ────────────────────
  it("H-02: postedAt and hashedAt are the same Date instance", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockApproved);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockApproved, status: "POSTED" });

    await request(app).post(`/api/journal-entries/${ENTRY_ID}/post`);

    const updateCall = (prisma.journalEntry.update as any).mock.calls[0][0];
    expect(updateCall.data.postedAt).toStrictEqual(updateCall.data.hashedAt);
  });

  // ── H-03: POST from DRAFT → 400 ───────────────────────────────────────────
  it("H-03: POST /:id/post from DRAFT → 400, hash not computed", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue({
      ...mockApproved,
      status: "DRAFT",
    });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/post`);

    expect(res.status).toBe(400);
    expect(prisma.journalEntry.update).not.toHaveBeenCalled();
  });

  // ── H-04: POST with FY closed → 400 ───────────────────────────────────────
  it("H-04: POST /:id/post with closed FY → 400", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue({
      ...mockApproved,
      fiscalYear: { status: "CLOSED" },
    });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/post`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fiscal year/i);
    expect(prisma.journalEntry.update).not.toHaveBeenCalled();
  });

  // ── H-05: GET verify-hash → isValid true when entry untampered ────────────
  it("H-05: GET /:id/verify-hash → isValid true for unmodified entry", async () => {
    const fixedPostedAt = new Date("2026-06-30T12:00:00.000Z");

    const storedHash = computeIntegrityHash(
      {
        id:             mockApproved.id,
        number:         mockApproved.number,
        organizationId: mockApproved.organizationId,
        fiscalYearId:   mockApproved.fiscalYearId,
        entryDate:      mockApproved.entryDate,
        type:           mockApproved.type,
        currencyCode:   mockApproved.currencyCode,
        exchangeRate:   mockApproved.exchangeRate,
        totalDebit:     mockApproved.totalDebit,
        totalCredit:    mockApproved.totalCredit,
        postedAt:       fixedPostedAt,
        postedByUserId: USER_ID,
      },
      twoBalancedLines,
    );

    const mockPostedEntry = {
      ...mockApproved,
      status:         "POSTED",
      postedAt:       fixedPostedAt,
      postedByUserId: USER_ID,
      integrityHash:  storedHash,
      hashAlgorithm:  "SHA-256",
      hashedAt:       fixedPostedAt,
    };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockPostedEntry);

    const res = await request(app).get(`/api/journal-entries/${ENTRY_ID}/verify-hash`);

    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.storedHash).toBe(storedHash);
    expect(res.body.computedHash).toBe(storedHash);
    expect(res.body.entryId).toBe(ENTRY_ID);
    expect(res.body.number).toBe("JE-2026-0001");
    expect(res.body.verifiedAt).toBeDefined();
  });

  // ── H-06: GET verify-hash → isValid false when hash tampered ─────────────
  it("H-06: GET /:id/verify-hash → isValid false when stored hash does not match", async () => {
    const fixedPostedAt = new Date("2026-06-30T12:00:00.000Z");
    const tamperedHash  = "0".repeat(64);

    (prisma.journalEntry.findFirst as any).mockResolvedValue({
      ...mockApproved,
      status:         "POSTED",
      postedAt:       fixedPostedAt,
      postedByUserId: USER_ID,
      integrityHash:  tamperedHash,
      hashAlgorithm:  "SHA-256",
      hashedAt:       fixedPostedAt,
    });

    const res = await request(app).get(`/api/journal-entries/${ENTRY_ID}/verify-hash`);

    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.storedHash).toBe(tamperedHash);
    expect(res.body.computedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.computedHash).not.toBe(tamperedHash);
  });

  // ── H-07: GET verify-hash on non-posted entry → 400 ──────────────────────
  it("H-07: GET /:id/verify-hash on non-posted entry → 400", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue({
      ...mockApproved,
      status:        "APPROVED",
      integrityHash: null,
      postedAt:      null,
      postedByUserId: null,
    });

    const res = await request(app).get(`/api/journal-entries/${ENTRY_ID}/verify-hash`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not been posted/i);
  });
});
