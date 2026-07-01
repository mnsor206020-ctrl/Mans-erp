import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoist mocks so they are available inside vi.mock() factories ──────────────
const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock Clerk before router import ───────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "test-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

// ── Mock notificationService before router import ─────────────────────────────
vi.mock("../services/notification", () => ({
  notificationService: { emit: mockEmit },
}));

// ── Mock Prisma before router import ──────────────────────────────────────────
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findMany:  vi.fn(),
    },
    fiscalYear: {
      findFirst: vi.fn(),
    },
    journalEntry: {
      findMany:  vi.fn(),
      count:     vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
      findFirst: vi.fn(),
    },
    chartOfAccount: {
      findFirst: vi.fn(),
    },
    journalEntryLine: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    journalEntryApproval: {
      create:    vi.fn(),
      findFirst: vi.fn(),
      findMany:  vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const { prisma } = await import("@workspace/prisma");
      return fn(prisma);
    }),
  },
}));

import journalEntriesRouter from "../routes/journal-entries";
import { prisma } from "@workspace/prisma";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ORG_ID    = "aaaaaaaa-0000-0000-0000-000000000001";
const FY_ID     = "bbbbbbbb-0000-0000-0000-000000000002";
const ENTRY_ID  = "cccccccc-0000-0000-0000-000000000003";
const USER_ID   = "dddddddd-0000-0000-0000-000000000004";
const ACCT_1    = "eeeeeeee-0000-0000-0000-000000000005";
const ACCT_2    = "ffffffff-0000-0000-0000-000000000006";

const mockUser  = { id: USER_ID, organizationId: ORG_ID, email: "test@example.com", clerkId: "test-clerk-id" };
const orgUsers  = [{ id: USER_ID }];

const twoLines  = [
  { accountId: ACCT_1, lineNumber: 1, debit: "500.0000", credit: "0.0000",   debitBase: "500.0000", creditBase: "0.0000"   },
  { accountId: ACCT_2, lineNumber: 2, debit: "0.0000",   credit: "500.0000", debitBase: "0.0000",   creditBase: "500.0000" },
];

const mockDraft       = {
  id: ENTRY_ID, organizationId: ORG_ID, number: "JE-2026-0001", status: "DRAFT",
  fiscalYearId: FY_ID, exchangeRate: "1", reversedByEntryId: null,
  entryDate: new Date("2026-07-01"), type: "STANDARD", currencyCode: "SAR",
  totalDebit: "500.0000", totalCredit: "500.0000",
};
const mockUnderReview = { ...mockDraft, status: "UNDER_REVIEW", submittedByUserId: USER_ID };
const mockApproved    = { ...mockDraft, status: "APPROVED",     approvedByUserId:  USER_ID };
const mockPosted      = { ...mockDraft, status: "POSTED",       postedByUserId:    USER_ID, integrityHash: "abc", postedAt: new Date() };
const linesWithAccount = twoLines.map(l => ({ ...l, account: { isActive: true, isGroup: false, code: "1000" } }));
const mockPostedLines  = { ...mockPosted, lines: linesWithAccount };
const mockOpenFY       = { id: FY_ID, status: "OPEN" };

const app = express();
app.use(express.json());
app.use("/api/journal-entries", journalEntriesRouter);

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.user.findFirst                 as any).mockResolvedValue(mockUser);
  (prisma.user as any).findMany.mockResolvedValue(orgUsers);
  (prisma.auditLog.create                as any).mockResolvedValue({});
  (prisma.journalEntryApproval.create    as any).mockResolvedValue({});
  (prisma.journalEntryApproval.findFirst as any).mockResolvedValue(null);
  (prisma.journalEntryApproval.findMany  as any).mockResolvedValue([]);
  (prisma.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(prisma));
  mockEmit.mockClear();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Journal Entry Workflow — Notification emission (Milestone 3B)", () => {

  // ── N-01: submit ────────────────────────────────────────────────────────────
  it("N-01: POST /:id/submit emits journal_entry.submitted with correct entityId", async () => {
    const entryWithLines = { ...mockDraft, lines: twoLines };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(entryWithLines);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "UNDER_REVIEW" });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/submit`);

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
      event:      "journal_entry.submitted",
      entityId:   ENTRY_ID,
      entityType: "JournalEntry",
    }));
  });

  // ── N-02: submit — recipient list comes from org users ────────────────────
  it("N-02: POST /:id/submit — emit receives orgUsers as userIds", async () => {
    const extraUser  = { id: "ffffffff-0000-0000-0000-000000000099" };
    (prisma.user as any).findMany.mockResolvedValue([{ id: USER_ID }, extraUser]);
    const entryWithLines = { ...mockDraft, lines: twoLines };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(entryWithLines);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "UNDER_REVIEW" });

    await request(app).post(`/api/journal-entries/${ENTRY_ID}/submit`);

    const call = mockEmit.mock.calls[0][0];
    expect(call.userIds).toContain(USER_ID);
    expect(call.userIds).toContain(extraUser.id);
    expect(call.userIds).toHaveLength(2);
  });

  // ── N-03: approve ──────────────────────────────────────────────────────────
  it("N-03: POST /:id/approve emits journal_entry.approved with correct entityId", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockUnderReview);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockUnderReview, status: "APPROVED" });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/approve`);

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
      event:      "journal_entry.approved",
      entityId:   ENTRY_ID,
      entityType: "JournalEntry",
    }));
  });

  // ── N-04: reject ───────────────────────────────────────────────────────────
  it("N-04: POST /:id/reject emits journal_entry.rejected with correct entityId", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockUnderReview);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "DRAFT" });

    const res = await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/reject`)
      .send({ comment: "Needs correction" });

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
      event:      "journal_entry.rejected",
      entityId:   ENTRY_ID,
      entityType: "JournalEntry",
    }));
  });

  // ── N-05: reject — comment appears in body ─────────────────────────────────
  it("N-05: POST /:id/reject — reject comment is included in bodyEn and bodyAr", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockUnderReview);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "DRAFT" });

    await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/reject`)
      .send({ comment: "Needs correction" });

    const call = mockEmit.mock.calls[0][0];
    expect(call.bodyEn).toContain("Needs correction");
    expect(call.bodyAr).toContain("Needs correction");
  });

  // ── N-06: post ─────────────────────────────────────────────────────────────
  it("N-06: POST /:id/post emits journal_entry.posted with correct entityId", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue({
      ...mockPostedLines,
      status: "APPROVED",
      fiscalYear: mockOpenFY,
    });
    (prisma.journalEntry.update as any).mockResolvedValue({ ...mockDraft, status: "POSTED" });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/post`);

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
      event:      "journal_entry.posted",
      entityId:   ENTRY_ID,
      entityType: "JournalEntry",
    }));
  });

  // ── N-07: lock ─────────────────────────────────────────────────────────────
  it("N-07: POST /:id/lock emits journal_entry.locked with correct entityId", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockPosted);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockPosted, status: "LOCKED" });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/lock`);

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
      event:      "journal_entry.locked",
      entityId:   ENTRY_ID,
      entityType: "JournalEntry",
    }));
  });

  // ── N-08: void ─────────────────────────────────────────────────────────────
  it("N-08: POST /:id/void emits journal_entry.voided with correct entityId", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockPosted);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockPosted, status: "VOIDED" });

    const res = await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/void`)
      .send({ reason: "Duplicate entry" });

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
      event:      "journal_entry.voided",
      entityId:   ENTRY_ID,
      entityType: "JournalEntry",
    }));
  });

  // ── N-09: void — reason appears in body ───────────────────────────────────
  it("N-09: POST /:id/void — void reason is included in bodyEn and bodyAr", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockPosted);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockPosted, status: "VOIDED" });

    await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/void`)
      .send({ reason: "Duplicate entry" });

    const call = mockEmit.mock.calls[0][0];
    expect(call.bodyEn).toContain("Duplicate entry");
    expect(call.bodyAr).toContain("Duplicate entry");
  });

  // ── N-10: reverse ──────────────────────────────────────────────────────────
  it("N-10: POST /:id/reverse emits journal_entry.reversed with correct entityId", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue({ ...mockPosted, lines: twoLines });
    (prisma.journalEntry.create    as any).mockResolvedValue({ ...mockDraft, number: "JE-2026-0002", id: "rev-id-001" });
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockPosted, status: "REVERSED" });
    (prisma.journalEntry.findMany  as any).mockResolvedValue([{ number: "JE-2026-0001" }]);

    const res = await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/reverse`)
      .send({ reason: "Correction required" });

    expect(res.status).toBe(200);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
      event:      "journal_entry.reversed",
      entityId:   ENTRY_ID,
      entityType: "JournalEntry",
    }));
  });

  // ── N-11: notification failure does not fail the response ─────────────────
  it("N-11: notification emit failure does not cause a 500 response", async () => {
    mockEmit.mockRejectedValueOnce(new Error("DB connection lost"));
    // getOrgUserIds itself will throw due to user.findMany mock returning normally,
    // but emit throws — the try/catch in emitNotification swallows it
    (prisma.user as any).findMany.mockResolvedValue(orgUsers);

    const entryWithLines = { ...mockDraft, lines: twoLines };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(entryWithLines);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "UNDER_REVIEW" });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/submit`);

    expect(res.status).toBe(200);
  });

  // ── N-12: notification not emitted on validation failure ──────────────────
  it("N-12: emit is NOT called when submit fails validation (wrong status)", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue({ ...mockPosted, lines: twoLines });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/submit`);

    expect(res.status).toBe(400);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
