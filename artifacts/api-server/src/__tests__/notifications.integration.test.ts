import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoist mocks so they are available inside vi.mock() factories ──────────────
const { mockGetUnread, mockMarkRead, mockMarkAllRead } = vi.hoisted(() => ({
  mockGetUnread:   vi.fn(),
  mockMarkRead:    vi.fn().mockResolvedValue(undefined),
  mockMarkAllRead: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock Clerk before router import ───────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "test-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

// ── Mock notificationService before router import ─────────────────────────────
vi.mock("../services/notification", () => ({
  notificationService: {
    getUnread:   mockGetUnread,
    markRead:    mockMarkRead,
    markAllRead: mockMarkAllRead,
  },
}));

// ── Mock Prisma before router import ──────────────────────────────────────────
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

import notificationsRouter from "../routes/notifications";
import { prisma } from "@workspace/prisma";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ORG_ID   = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID  = "bbbbbbbb-0000-0000-0000-000000000002";
const NOTIF_ID = "cccccccc-0000-0000-0000-000000000003";
const ENTRY_ID = "dddddddd-0000-0000-0000-000000000004";

const mockUser = { id: USER_ID, organizationId: ORG_ID, email: "test@example.com", clerkId: "test-clerk-id" };

const unreadRow = {
  id:             NOTIF_ID,
  organizationId: ORG_ID,
  userId:         USER_ID,
  event:          "journal_entry.submitted",
  entityType:     "JournalEntry",
  entityId:       ENTRY_ID,
  titleEn:        "Entry submitted for review",
  titleAr:        "تم تقديم القيد للمراجعة",
  bodyEn:         "JE-2026-0001 has been submitted for review.",
  bodyAr:         "تم تقديم القيد JE-2026-0001 للمراجعة.",
  isRead:         false,
  readAt:         null,
  createdAt:      new Date("2026-07-01T10:00:00Z"),
};

const app = express();
app.use(express.json());
app.use("/api/notifications", notificationsRouter);

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.user.findFirst as any).mockResolvedValue(mockUser);
  mockGetUnread.mockResolvedValue([unreadRow]);
  mockMarkRead.mockResolvedValue(undefined);
  mockMarkAllRead.mockResolvedValue(undefined);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Notifications API — Integration (Milestone 3C)", () => {

  // ── GET /api/notifications/unread ──────────────────────────────────────────

  it("NR-01: GET /unread → 200, returns data array", async () => {
    const res = await request(app).get("/api/notifications/unread");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("NR-02: GET /unread → returns the unread row with correct fields", async () => {
    const res = await request(app).get("/api/notifications/unread");

    expect(res.status).toBe(200);
    const row = res.body.data[0];
    expect(row.id).toBe(NOTIF_ID);
    expect(row.event).toBe("journal_entry.submitted");
    expect(row.entityType).toBe("JournalEntry");
    expect(row.entityId).toBe(ENTRY_ID);
    expect(row.isRead).toBe(false);
    expect(row.titleEn).toBe("Entry submitted for review");
    expect(row.titleAr).toBe("تم تقديم القيد للمراجعة");
  });

  it("NR-03: GET /unread → calls getUnread with the DB userId (not Clerk ID)", async () => {
    await request(app).get("/api/notifications/unread");

    expect(mockGetUnread).toHaveBeenCalledOnce();
    expect(mockGetUnread).toHaveBeenCalledWith(USER_ID);
  });

  it("NR-04: GET /unread → 200 with empty array when no unread notifications", async () => {
    mockGetUnread.mockResolvedValue([]);

    const res = await request(app).get("/api/notifications/unread");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("NR-05: GET /unread → 401 when user is not found in DB", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get("/api/notifications/unread");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("NR-06: GET /unread → 500 when getUnread throws", async () => {
    mockGetUnread.mockRejectedValue(new Error("DB error"));

    const res = await request(app).get("/api/notifications/unread");

    expect(res.status).toBe(500);
  });

  // ── PATCH /api/notifications/:id/read ─────────────────────────────────────

  it("NR-07: PATCH /:id/read → 200, returns { ok: true }", async () => {
    const res = await request(app).patch(`/api/notifications/${NOTIF_ID}/read`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("NR-08: PATCH /:id/read → calls markRead with the notification ID and DB userId", async () => {
    await request(app).patch(`/api/notifications/${NOTIF_ID}/read`);

    expect(mockMarkRead).toHaveBeenCalledOnce();
    expect(mockMarkRead).toHaveBeenCalledWith(NOTIF_ID, USER_ID);
  });

  it("NR-09: PATCH /:id/read → 401 when user is not found in DB", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);

    const res = await request(app).patch(`/api/notifications/${NOTIF_ID}/read`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("NR-10: PATCH /:id/read → 500 when markRead throws", async () => {
    mockMarkRead.mockRejectedValue(new Error("DB error"));

    const res = await request(app).patch(`/api/notifications/${NOTIF_ID}/read`);

    expect(res.status).toBe(500);
  });

  // ── PATCH /api/notifications/read-all ─────────────────────────────────────

  it("NR-11: PATCH /read-all → 200, returns { ok: true }", async () => {
    const res = await request(app).patch("/api/notifications/read-all");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("NR-12: PATCH /read-all → calls markAllRead with the DB userId", async () => {
    await request(app).patch("/api/notifications/read-all");

    expect(mockMarkAllRead).toHaveBeenCalledOnce();
    expect(mockMarkAllRead).toHaveBeenCalledWith(USER_ID);
  });

  it("NR-13: PATCH /read-all → 401 when user is not found in DB", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);

    const res = await request(app).patch("/api/notifications/read-all");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("NR-14: PATCH /read-all → 500 when markAllRead throws", async () => {
    mockMarkAllRead.mockRejectedValue(new Error("DB error"));

    const res = await request(app).patch("/api/notifications/read-all");

    expect(res.status).toBe(500);
  });

  // ── Route ordering: /read-all must not be shadowed by /:id/read ───────────

  it("NR-15: PATCH /read-all calls markAllRead (not markRead) — route ordering is correct", async () => {
    await request(app).patch("/api/notifications/read-all");

    expect(mockMarkAllRead).toHaveBeenCalledOnce();
    expect(mockMarkRead).not.toHaveBeenCalled();
  });
});
