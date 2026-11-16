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
import { userRolesGrantingAll } from "./helpers/rbac";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ORG_ID   = "aaaaaaaa-0000-0000-0000-000000000001";
const FY_ID    = "bbbbbbbb-0000-0000-0000-000000000002";
const ENTRY_ID = "cccccccc-0000-0000-0000-000000000003";
const USER_ID  = "dddddddd-0000-0000-0000-000000000004";
const ACCT_1   = "eeeeeeee-0000-0000-0000-000000000005";
const ACCT_2   = "ffffffff-0000-0000-0000-000000000006";

const mockUser  = { id: USER_ID, organizationId: ORG_ID, email: "test@example.com", clerkId: "test-clerk-id", userRoles: userRolesGrantingAll("journal_entries") };
const mockDraft = { id: ENTRY_ID, organizationId: ORG_ID, number: "JE-2026-0001", status: "DRAFT", fiscalYearId: FY_ID, exchangeRate: "1" };

const twoLines = [
  { accountId: ACCT_1, lineNumber: 1, debit: "500.0000", credit: "0.0000" },
  { accountId: ACCT_2, lineNumber: 2, debit: "0.0000",   credit: "500.0000" },
];

const app = express();
app.use(express.json());
app.use("/api/journal-entries", journalEntriesRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────
describe("Journal Entries Workflow API — Integration (Sprint 2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst                 as any).mockResolvedValue(mockUser);
    (prisma.auditLog.create                as any).mockResolvedValue({});
    (prisma.journalEntryApproval.create    as any).mockResolvedValue({});
    (prisma.journalEntryApproval.findFirst as any).mockResolvedValue(null);
    (prisma.journalEntryApproval.findMany  as any).mockResolvedValue([]);
    (prisma.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(prisma));
  });

  // ── W-01: Submit DRAFT → 200, status = UNDER_REVIEW ──────────────────────
  it("W-01: POST /:id/submit from DRAFT → 200, status = UNDER_REVIEW", async () => {
    const entryWithLines = { ...mockDraft, lines: twoLines };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(entryWithLines);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "UNDER_REVIEW" });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/submit`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("UNDER_REVIEW");
    expect(prisma.journalEntryApproval.create).toHaveBeenCalledOnce();
  });

  // ── W-02: Submit from POSTED → 400 ────────────────────────────────────────
  it("W-02: POST /:id/submit from POSTED → 400", async () => {
    const postedEntry = { ...mockDraft, status: "POSTED", lines: twoLines };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(postedEntry);

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/submit`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot submit/i);
  });

  // ── W-03: Submit with unbalanced lines → 400 ──────────────────────────────
  it("W-03: POST /:id/submit with unbalanced lines → 400", async () => {
    const unbalancedLines = [
      { accountId: ACCT_1, lineNumber: 1, debit: "500.0000", credit: "0.0000" },
      { accountId: ACCT_2, lineNumber: 2, debit: "0.0000",   credit: "400.0000" },
    ];
    (prisma.journalEntry.findFirst as any).mockResolvedValue({ ...mockDraft, lines: unbalancedLines });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/submit`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not balanced/i);
  });

  // ── W-04: Approve UNDER_REVIEW → 200, status = APPROVED ──────────────────
  it("W-04: POST /:id/approve from UNDER_REVIEW → 200, status = APPROVED", async () => {
    const underReview = { ...mockDraft, status: "UNDER_REVIEW" };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(underReview);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "APPROVED" });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/approve`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(prisma.journalEntryApproval.create).toHaveBeenCalledOnce();
  });

  // ── W-05: Approve from DRAFT → 400 ────────────────────────────────────────
  it("W-05: POST /:id/approve from DRAFT → 400", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockDraft);

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/approve`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot approve/i);
  });

  // ── W-06: Reject UNDER_REVIEW with valid comment → 200, status = DRAFT ────
  it("W-06: POST /:id/reject from UNDER_REVIEW with comment → 200, status = DRAFT", async () => {
    const underReview = { ...mockDraft, status: "UNDER_REVIEW" };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(underReview);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "DRAFT" });

    const res = await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/reject`)
      .send({ comment: "Missing supporting documents" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DRAFT");
    expect(prisma.journalEntryApproval.create).toHaveBeenCalledOnce();
    const createCall = (prisma.journalEntryApproval.create as any).mock.calls[0][0];
    expect(createCall.data.comment).toBe("Missing supporting documents");
  });

  // ── W-07: Reject without comment → 400 ───────────────────────────────────
  it("W-07: POST /:id/reject without comment → 400", async () => {
    const res = await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/reject`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
    expect(prisma.journalEntry.findFirst).not.toHaveBeenCalled();
  });

  // ── W-08: Reject with short comment → 400 ────────────────────────────────
  it("W-08: POST /:id/reject with comment shorter than 10 chars → 400", async () => {
    const res = await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/reject`)
      .send({ comment: "Too short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10 characters/i);
  });

  // ── W-09: Reject from POSTED → 400 ───────────────────────────────────────
  it("W-09: POST /:id/reject from POSTED → 400", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue({ ...mockDraft, status: "POSTED" });

    const res = await request(app)
      .post(`/api/journal-entries/${ENTRY_ID}/reject`)
      .send({ comment: "Reversing this entry instead" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot reject/i);
  });

  // ── W-10: GET /:id/approvals — ordered list with durationSeconds ──────────
  it("W-10: GET /:id/approvals → 200, ordered list with user and durationSeconds", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockDraft);
    const approvalRecords = [
      {
        id: "a1",
        action: "SUBMIT",
        fromStatus: "DRAFT",
        toStatus: "UNDER_REVIEW",
        comment: null,
        durationSeconds: null,
        createdAt: "2026-07-01T09:00:00Z",
        user: { id: USER_ID, firstNameEn: "Sara", lastNameEn: "Ahmed", email: "sara@org.sa" },
      },
      {
        id: "a2",
        action: "APPROVE",
        fromStatus: "UNDER_REVIEW",
        toStatus: "APPROVED",
        comment: "Looks good",
        durationSeconds: 3720,
        createdAt: "2026-07-01T10:02:00Z",
        user: { id: USER_ID, firstNameEn: "Khalid", lastNameEn: "Ali", email: "khalid@org.sa" },
      },
    ];
    (prisma.journalEntryApproval.findMany as any).mockResolvedValue(approvalRecords);

    const res = await request(app).get(`/api/journal-entries/${ENTRY_ID}/approvals`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].action).toBe("SUBMIT");
    expect(res.body.data[0].durationSeconds).toBeNull();
    expect(res.body.data[1].action).toBe("APPROVE");
    expect(res.body.data[1].durationSeconds).toBe(3720);
    expect(res.body.data[1].user.firstNameEn).toBe("Khalid");

    const findManyCall = (prisma.journalEntryApproval.findMany as any).mock.calls[0][0];
    expect(findManyCall.orderBy).toMatchObject({ createdAt: "asc" });
  });

  // ── W-11: writeApprovalRecord stores durationSeconds on second action ─────
  it("W-11: writeApprovalRecord queries last approval to compute durationSeconds", async () => {
    const prevRecord = { createdAt: new Date("2026-07-01T10:00:00Z") };
    (prisma.journalEntryApproval.findFirst as any).mockResolvedValue(prevRecord);
    const underReview = { ...mockDraft, status: "UNDER_REVIEW" };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(underReview);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockDraft, status: "APPROVED" });

    await request(app).post(`/api/journal-entries/${ENTRY_ID}/approve`);

    expect(prisma.journalEntryApproval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { journalEntryId: ENTRY_ID } })
    );
    const createCall = (prisma.journalEntryApproval.create as any).mock.calls[0][0];
    expect(typeof createCall.data.durationSeconds).toBe("number");
  });

  // ── W-12 (RBAC): approve requires journal_entries:approve, not just :update ─
  it("W-12: POST /:id/approve returns 403 for a user who can only update journal entries", async () => {
    (prisma.user.findFirst as any).mockResolvedValue({
      ...mockUser,
      userRoles: [{ role: { rolePermissions: [{ permission: { resource: "journal_entries", action: "update" } }] } }],
    });

    const res = await request(app).post(`/api/journal-entries/${ENTRY_ID}/approve`);

    expect(res.status).toBe(403);
    expect(prisma.journalEntry.update).not.toHaveBeenCalled();
  });
});
