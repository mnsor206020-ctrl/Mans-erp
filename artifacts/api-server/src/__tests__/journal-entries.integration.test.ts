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
    auditLog: {
      create: vi.fn(),
    },
    journalEntryApproval: {
      create: vi.fn(),
    },
  },
}));

// ── Import router (gets mocked dependencies) ──────────────────────────────────
import journalEntriesRouter from "../routes/journal-entries";
import { prisma } from "@workspace/prisma";

// ── Test fixtures ─────────────────────────────────────────────────────────────
const ORG_ID   = "aaaaaaaa-0000-0000-0000-000000000001";
const FY_ID    = "bbbbbbbb-0000-0000-0000-000000000002";
const ENTRY_ID = "cccccccc-0000-0000-0000-000000000003";
const USER_ID  = "dddddddd-0000-0000-0000-000000000004";

const mockUser  = { id: USER_ID,  organizationId: ORG_ID, email: "test@example.com", clerkId: "test-clerk-id" };
const mockFY    = { id: FY_ID,    organizationId: ORG_ID, status: "OPEN" };
const mockEntry = { id: ENTRY_ID, organizationId: ORG_ID, number: "JE-2026-0001", status: "DRAFT", fiscalYearId: FY_ID };

// ── Minimal Express app for route testing ─────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/journal-entries", journalEntriesRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Journal Entries API — Integration (Sprint 2.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst       as any).mockResolvedValue(mockUser);
    (prisma.auditLog.create      as any).mockResolvedValue({});
    (prisma.journalEntryApproval.create as any).mockResolvedValue({});
  });

  it("POST — valid header-only payload → 201 with JE-YYYY-NNNN number", async () => {
    (prisma.fiscalYear.findFirst   as any).mockResolvedValue(mockFY);
    (prisma.journalEntry.findMany  as any).mockResolvedValue([]);
    (prisma.journalEntry.create    as any).mockResolvedValue({ ...mockEntry, lines: [] });

    const res = await request(app)
      .post("/api/journal-entries")
      .send({ fiscalYearId: FY_ID, entryDate: "2026-06-30", type: "MANUAL" });

    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^JE-\d{4}-\d{4}$/);
  });

  it("POST — closed fiscal year → 400 with 'not open' error", async () => {
    (prisma.fiscalYear.findFirst as any).mockResolvedValue({ ...mockFY, status: "CLOSED" });

    const res = await request(app)
      .post("/api/journal-entries")
      .send({ fiscalYearId: FY_ID, entryDate: "2026-06-30" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not open/i);
  });

  it("PATCH — edit DRAFT entry → 200 with updated field values", async () => {
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
      _count: { lines: 0 },
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
});
