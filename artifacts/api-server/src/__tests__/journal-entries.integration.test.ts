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
    // $transaction: simulate interactive transaction by executing the callback with the same mock
    $transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const { prisma } = await import("@workspace/prisma");
      return fn(prisma);
    }),
  },
}));

// ── Import router (gets mocked dependencies) ──────────────────────────────────
import journalEntriesRouter from "../routes/journal-entries";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

// ── Test fixtures ─────────────────────────────────────────────────────────────
const ORG_ID     = "aaaaaaaa-0000-0000-0000-000000000001";
const FY_ID      = "bbbbbbbb-0000-0000-0000-000000000002";
const ENTRY_ID   = "cccccccc-0000-0000-0000-000000000003";
const USER_ID    = "dddddddd-0000-0000-0000-000000000004";
const ACCOUNT_1  = "eeeeeeee-0000-0000-0000-000000000005";
const ACCOUNT_2  = "ffffffff-0000-0000-0000-000000000006";

const mockUser  = { id: USER_ID,  organizationId: ORG_ID, email: "test@example.com", clerkId: "test-clerk-id", userRoles: userRolesGrantingAll("journal_entries") };
const mockFY    = { id: FY_ID,    organizationId: ORG_ID, status: "OPEN" };
const mockEntry = { id: ENTRY_ID, organizationId: ORG_ID, number: "JE-2026-0001", status: "DRAFT", fiscalYearId: FY_ID, exchangeRate: "1" };

const mockLeafAccount = {
  id: ACCOUNT_1,
  code: "1001",
  nameEn: "Cash",
  isActive: true,
  isGroup: false,
  allowDirectEntry: true,
};

const validLines = [
  { accountId: ACCOUNT_1, lineNumber: 1, debit: 500, credit: 0 },
  { accountId: ACCOUNT_2, lineNumber: 2, debit: 0,   credit: 500 },
];

// ── Minimal Express app for route testing ─────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/journal-entries", journalEntriesRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Journal Entries API — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst                   as any).mockResolvedValue(mockUser);
    (prisma.auditLog.create                  as any).mockResolvedValue({});
    (prisma.journalEntryApproval.create      as any).mockResolvedValue({});
    (prisma.journalEntryApproval.findFirst   as any).mockResolvedValue(null);
    (prisma.journalEntryApproval.findMany    as any).mockResolvedValue([]);
    (prisma.journalEntryLine.deleteMany      as any).mockResolvedValue({ count: 0 });
    (prisma.journalEntryLine.createMany      as any).mockResolvedValue({ count: 2 });
    // Restore $transaction implementation after clearAllMocks clears call history
    (prisma.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(prisma));
  });

  // ── Sprint 2.1 tests (updated to include required lines) ──────────────────

  it("POST — 2 balanced lines, open fiscal year → 201 with JE-YYYY-NNNN number", async () => {
    (prisma.fiscalYear.findFirst   as any).mockResolvedValue(mockFY);
    (prisma.journalEntry.findMany  as any).mockResolvedValue([]);
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue(mockLeafAccount);
    (prisma.journalEntry.create    as any).mockResolvedValue({
      ...mockEntry,
      totalDebit: 500,
      totalCredit: 500,
      lines: [
        { id: "l1", journalEntryId: ENTRY_ID, accountId: ACCOUNT_1, lineNumber: 1, debit: 500, credit: 0 },
        { id: "l2", journalEntryId: ENTRY_ID, accountId: ACCOUNT_2, lineNumber: 2, debit: 0,   credit: 500 },
      ],
    });

    const res = await request(app)
      .post("/api/journal-entries")
      .send({ fiscalYearId: FY_ID, entryDate: "2026-06-30", type: "MANUAL", lines: validLines });

    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^JE-\d{4}-\d{4}$/);
    expect(res.body.lines).toHaveLength(2);
  });

  it("POST — closed fiscal year → 400 with 'not open' error", async () => {
    (prisma.fiscalYear.findFirst as any).mockResolvedValue({ ...mockFY, status: "CLOSED" });

    const res = await request(app)
      .post("/api/journal-entries")
      .send({ fiscalYearId: FY_ID, entryDate: "2026-06-30", lines: validLines });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not open/i);
  });

  it("PATCH — edit DRAFT entry without lines → 200 with updated field values", async () => {
    const updated = { ...mockEntry, descriptionEn: "Updated description", lines: [] };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockEntry);
    (prisma.journalEntry.update    as any).mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/journal-entries/${ENTRY_ID}`)
      .send({ descriptionEn: "Updated description" });

    expect(res.status).toBe(200);
    expect(res.body.descriptionEn).toBe("Updated description");
  });

  it("DELETE — DRAFT entry → 200 with { success: true }", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockEntry);
    (prisma.journalEntry.update    as any).mockResolvedValue({ ...mockEntry, deletedAt: new Date() });

    const res = await request(app).delete(`/api/journal-entries/${ENTRY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE — POSTED entry → 400 (only DRAFT entries can be deleted)", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue({ ...mockEntry, status: "POSTED" });

    const res = await request(app).delete(`/api/journal-entries/${ENTRY_ID}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Only DRAFT/i);
  });

  it("GET / — Prisma WHERE clause always contains deletedAt: null (soft-deleted records excluded)", async () => {
    (prisma.journalEntry.findMany as any).mockResolvedValue([]);
    (prisma.journalEntry.count   as any).mockResolvedValue(0);

    await request(app).get("/api/journal-entries");

    const findManyCall = (prisma.journalEntry.findMany as any).mock.calls[0][0];
    expect(findManyCall.where).toHaveProperty("deletedAt", null);

    const countCall = (prisma.journalEntry.count as any).mock.calls[0][0];
    expect(countCall.where).toHaveProperty("deletedAt", null);
  });

  it("GET /?search=JE-2026 — Prisma OR filter is applied and matching entries are returned", async () => {
    const matchingEntry = {
      ...mockEntry,
      number: "JE-2026-0001",
      deletedAt: null,
      createdBy: null,
      fiscalYear: null,
      _count: { lines: 2 },
    };
    (prisma.journalEntry.findMany as any).mockResolvedValue([matchingEntry]);
    (prisma.journalEntry.count   as any).mockResolvedValue(1);

    const res = await request(app).get("/api/journal-entries?search=JE-2026");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].number).toBe("JE-2026-0001");

    const findManyCall = (prisma.journalEntry.findMany as any).mock.calls[0][0];
    expect(findManyCall.where.OR).toBeDefined();
    expect(findManyCall.where.OR[0].number).toMatchObject({ contains: "JE-2026", mode: "insensitive" });
  });

  // ── Sprint 2.2 tests ───────────────────────────────────────────────────────

  it("I-13: POST — 2 balanced lines → 201, totalDebit = totalCredit, lines in response", async () => {
    (prisma.fiscalYear.findFirst     as any).mockResolvedValue(mockFY);
    (prisma.journalEntry.findMany    as any).mockResolvedValue([]);
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue(mockLeafAccount);
    (prisma.journalEntry.create      as any).mockResolvedValue({
      ...mockEntry,
      totalDebit: 500,
      totalCredit: 500,
      lines: [
        { id: "l1", accountId: ACCOUNT_1, lineNumber: 1, debit: 500, credit: 0 },
        { id: "l2", accountId: ACCOUNT_2, lineNumber: 2, debit: 0,   credit: 500 },
      ],
    });

    const res = await request(app)
      .post("/api/journal-entries")
      .send({ fiscalYearId: FY_ID, entryDate: "2026-06-30", lines: validLines });

    expect(res.status).toBe(201);
    expect(res.body.totalDebit).toBe(500);
    expect(res.body.totalCredit).toBe(500);
    expect(res.body.lines).toHaveLength(2);
  });

  it("I-14: POST — unbalanced lines → 400 'not balanced'", async () => {
    (prisma.fiscalYear.findFirst as any).mockResolvedValue(mockFY);
    (prisma.journalEntry.findMany as any).mockResolvedValue([]);

    const res = await request(app)
      .post("/api/journal-entries")
      .send({
        fiscalYearId: FY_ID,
        entryDate: "2026-06-30",
        lines: [
          { accountId: ACCOUNT_1, lineNumber: 1, debit: 500, credit: 0 },
          { accountId: ACCOUNT_2, lineNumber: 2, debit: 0,   credit: 400 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not balanced/i);
  });

  it("I-15: POST — only 1 line → 400 'At least 2 lines required'", async () => {
    const res = await request(app)
      .post("/api/journal-entries")
      .send({
        fiscalYearId: FY_ID,
        entryDate: "2026-06-30",
        lines: [{ accountId: ACCOUNT_1, lineNumber: 1, debit: 500, credit: 0 }],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/at least 2 lines/i);
  });

  it("I-16: POST — 0 lines → 400 'At least 2 lines required'", async () => {
    const res = await request(app)
      .post("/api/journal-entries")
      .send({ fiscalYearId: FY_ID, entryDate: "2026-06-30", lines: [] });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/at least 2 lines/i);
  });

  it("I-17: POST — line references a group account → 400 'group account'", async () => {
    (prisma.fiscalYear.findFirst     as any).mockResolvedValue(mockFY);
    (prisma.journalEntry.findMany    as any).mockResolvedValue([]);
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue({
      ...mockLeafAccount,
      isGroup: true,
      allowDirectEntry: false,
    });

    const res = await request(app)
      .post("/api/journal-entries")
      .send({ fiscalYearId: FY_ID, entryDate: "2026-06-30", lines: validLines });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/group account/i);
  });

  it("I-18: POST — line references an inactive account → 400 'not active'", async () => {
    (prisma.fiscalYear.findFirst     as any).mockResolvedValue(mockFY);
    (prisma.journalEntry.findMany    as any).mockResolvedValue([]);
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue({
      ...mockLeafAccount,
      isActive: false,
    });

    const res = await request(app)
      .post("/api/journal-entries")
      .send({ fiscalYearId: FY_ID, entryDate: "2026-06-30", lines: validLines });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not active/i);
  });

  it("I-19: PATCH — DRAFT entry, 2 balanced lines → 200, lines replaced, totals updated", async () => {
    const patchedEntry = {
      ...mockEntry,
      totalDebit: 750,
      totalCredit: 750,
      lines: [
        { id: "l1", accountId: ACCOUNT_1, lineNumber: 1, debit: 750, credit: 0 },
        { id: "l2", accountId: ACCOUNT_2, lineNumber: 2, debit: 0,   credit: 750 },
      ],
    };
    (prisma.journalEntry.findFirst   as any).mockResolvedValue(mockEntry);
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue(mockLeafAccount);
    (prisma.journalEntry.update      as any).mockResolvedValue(patchedEntry);

    const res = await request(app)
      .patch(`/api/journal-entries/${ENTRY_ID}`)
      .send({
        lines: [
          { accountId: ACCOUNT_1, lineNumber: 1, debit: 750, credit: 0 },
          { accountId: ACCOUNT_2, lineNumber: 2, debit: 0,   credit: 750 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.totalDebit).toBe(750);
    expect(res.body.totalCredit).toBe(750);

    // Verify lines were replaced atomically via $transaction
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.journalEntryLine.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: ENTRY_ID },
    });
    expect(prisma.journalEntryLine.createMany).toHaveBeenCalled();
  });

  it("I-20: PATCH — lines provided but only 1 line → 400 'At least 2 lines required'", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockEntry);

    const res = await request(app)
      .patch(`/api/journal-entries/${ENTRY_ID}`)
      .send({
        lines: [{ accountId: ACCOUNT_1, lineNumber: 1, debit: 500, credit: 0 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 2 lines/i);
  });

  it("I-21: GET /:id — entry with lines → 200, lines included with account sub-objects", async () => {
    const entryWithLines = {
      ...mockEntry,
      lines: [
        {
          id: "l1",
          lineNumber: 1,
          debit: 500,
          credit: 0,
          account: { id: ACCOUNT_1, code: "1001", nameEn: "Cash", nameAr: "نقدية", type: "ASSET", nature: "DEBIT" },
          costCenter: null,
        },
        {
          id: "l2",
          lineNumber: 2,
          debit: 0,
          credit: 500,
          account: { id: ACCOUNT_2, code: "4001", nameEn: "Revenue", nameAr: "الإيرادات", type: "REVENUE", nature: "CREDIT" },
          costCenter: null,
        },
      ],
      approvals: [],
      createdBy: null,
      submittedBy: null,
      approvedBy: null,
      postedBy: null,
      voidedBy: null,
      fiscalYear: { id: FY_ID, nameEn: "FY2026", nameAr: "السنة المالية 2026", startDate: "2026-01-01", endDate: "2026-12-31", status: "OPEN" },
      reversalOf: null,
      reversals: [],
    };
    (prisma.journalEntry.findFirst as any).mockResolvedValue(entryWithLines);

    const res = await request(app).get(`/api/journal-entries/${ENTRY_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0].account).toHaveProperty("code", "1001");
    expect(res.body.lines[1].account).toHaveProperty("code", "4001");
  });

  it("I-22: GET /:id — entry belongs to a different organization → 404, org-scoped in query", async () => {
    // The DB is the source of truth for org scoping: it only returns a row
    // when the where-clause's organizationId matches. A route that forgot to
    // scope by organizationId would still pass id+deletedAt through and get
    // a false positive here.
    (prisma.journalEntry.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get(`/api/journal-entries/${ENTRY_ID}`);

    expect(res.status).toBe(404);
    expect(prisma.journalEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ENTRY_ID, organizationId: ORG_ID, deletedAt: null }),
      }),
    );
  });
});
