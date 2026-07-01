import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService, type EmitParams } from "../services/notification";

// ── Mock Prisma client (DI — passed directly to constructor) ───────────────────

const mockCreateMany  = vi.fn();
const mockFindMany    = vi.fn();
const mockUpdateMany  = vi.fn();

const mockDb = {
  notification: {
    createMany: mockCreateMany,
    findMany:   mockFindMany,
    updateMany: mockUpdateMany,
  },
} as any;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ORG_ID   = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_A   = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_B   = "cccccccc-0000-0000-0000-000000000003";
const ENTRY_ID = "dddddddd-0000-0000-0000-000000000004";
const NOTIF_ID = "eeeeeeee-0000-0000-0000-000000000005";

const BASE_EMIT: EmitParams = {
  organizationId: ORG_ID,
  userIds:        [USER_A, USER_B],
  event:          "journal_entry.submitted",
  entityType:     "JournalEntry",
  entityId:       ENTRY_ID,
  titleEn:        "Entry submitted",
  titleAr:        "تم تقديم القيد",
  bodyEn:         "JE-2026-0001 has been submitted for review.",
  bodyAr:         "تم تقديم القيد JE-2026-0001 للمراجعة.",
};

const UNREAD_ROW = {
  id:             NOTIF_ID,
  organizationId: ORG_ID,
  userId:         USER_A,
  event:          "journal_entry.submitted",
  entityType:     "JournalEntry",
  entityId:       ENTRY_ID,
  titleEn:        "Entry submitted",
  titleAr:        "تم تقديم القيد",
  bodyEn:         "JE-2026-0001 has been submitted for review.",
  bodyAr:         "تم تقديم القيد JE-2026-0001 للمراجعة.",
  isRead:         false,
  readAt:         null,
  createdAt:      new Date("2026-07-01T10:00:00Z"),
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("NotificationService", () => {
  let svc: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new NotificationService(mockDb);
  });

  // ── emit() ─────────────────────────────────────────────────────────────────

  describe("emit()", () => {
    it("calls createMany with one row per userId", async () => {
      mockCreateMany.mockResolvedValue({ count: 2 });

      await svc.emit(BASE_EMIT);

      expect(mockCreateMany).toHaveBeenCalledTimes(1);
      const { data } = mockCreateMany.mock.calls[0][0];
      expect(data).toHaveLength(2);
      expect(data[0].userId).toBe(USER_A);
      expect(data[1].userId).toBe(USER_B);
    });

    it("writes the correct event name in every row", async () => {
      mockCreateMany.mockResolvedValue({ count: 2 });

      await svc.emit(BASE_EMIT);

      const { data } = mockCreateMany.mock.calls[0][0];
      for (const row of data) {
        expect(row.event).toBe("journal_entry.submitted");
      }
    });

    it("includes organizationId, entityType, entityId, and both title/body locales", async () => {
      mockCreateMany.mockResolvedValue({ count: 2 });

      await svc.emit(BASE_EMIT);

      const { data } = mockCreateMany.mock.calls[0][0];
      const row = data[0];
      expect(row.organizationId).toBe(ORG_ID);
      expect(row.entityType).toBe("JournalEntry");
      expect(row.entityId).toBe(ENTRY_ID);
      expect(row.titleEn).toBe("Entry submitted");
      expect(row.titleAr).toBe("تم تقديم القيد");
      expect(row.bodyEn).toContain("JE-2026-0001");
      expect(row.bodyAr).toContain("JE-2026-0001");
    });

    it("skips createMany when userIds is empty", async () => {
      await svc.emit({ ...BASE_EMIT, userIds: [] });

      expect(mockCreateMany).not.toHaveBeenCalled();
    });

    it("emits a single row when only one userId is provided", async () => {
      mockCreateMany.mockResolvedValue({ count: 1 });

      await svc.emit({ ...BASE_EMIT, userIds: [USER_A] });

      const { data } = mockCreateMany.mock.calls[0][0];
      expect(data).toHaveLength(1);
      expect(data[0].userId).toBe(USER_A);
    });

    it("resolves without throwing on all recognised event types", async () => {
      const events = [
        "journal_entry.created",
        "journal_entry.submitted",
        "journal_entry.approved",
        "journal_entry.rejected",
        "journal_entry.posted",
        "journal_entry.locked",
        "journal_entry.voided",
        "journal_entry.reversed",
      ];
      mockCreateMany.mockResolvedValue({ count: 1 });

      for (const event of events) {
        await expect(svc.emit({ ...BASE_EMIT, userIds: [USER_A], event })).resolves.toBeUndefined();
      }
    });
  });

  // ── getUnread() ────────────────────────────────────────────────────────────

  describe("getUnread()", () => {
    it("returns only unread notifications for the user", async () => {
      mockFindMany.mockResolvedValue([UNREAD_ROW]);

      const result = await svc.getUnread(USER_A);

      expect(result).toHaveLength(1);
      expect(result[0].isRead).toBe(false);
      expect(result[0].id).toBe(NOTIF_ID);
    });

    it("queries with isRead: false scoped to the correct userId", async () => {
      mockFindMany.mockResolvedValue([]);

      await svc.getUnread(USER_A);

      const query = mockFindMany.mock.calls[0][0];
      expect(query.where.userId).toBe(USER_A);
      expect(query.where.isRead).toBe(false);
    });

    it("orders results newest-first", async () => {
      mockFindMany.mockResolvedValue([]);

      await svc.getUnread(USER_A);

      const query = mockFindMany.mock.calls[0][0];
      expect(query.orderBy.createdAt).toBe("desc");
    });

    it("returns an empty array when all notifications are read", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await svc.getUnread(USER_A);

      expect(result).toEqual([]);
    });
  });

  // ── markRead() ─────────────────────────────────────────────────────────────

  describe("markRead()", () => {
    it("calls updateMany scoped to both id and userId", async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      await svc.markRead(NOTIF_ID, USER_A);

      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      const call = mockUpdateMany.mock.calls[0][0];
      expect(call.where.id).toBe(NOTIF_ID);
      expect(call.where.userId).toBe(USER_A);
    });

    it("sets isRead=true and a non-null readAt Date", async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const before = new Date();
      await svc.markRead(NOTIF_ID, USER_A);
      const after = new Date();

      const call = mockUpdateMany.mock.calls[0][0];
      expect(call.data.isRead).toBe(true);
      expect(call.data.readAt).toBeInstanceOf(Date);
      expect((call.data.readAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect((call.data.readAt as Date).getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("does NOT update a notification that belongs to a different user", async () => {
      // updateMany with where.userId = USER_B will naturally match 0 rows,
      // but we verify the WHERE is correctly scoped to the requested user
      mockUpdateMany.mockResolvedValue({ count: 0 });

      await svc.markRead(NOTIF_ID, USER_B);

      const call = mockUpdateMany.mock.calls[0][0];
      expect(call.where.userId).toBe(USER_B);
      // USER_A's notification would not be in scope
    });
  });

  // ── markAllRead() ──────────────────────────────────────────────────────────

  describe("markAllRead()", () => {
    it("calls updateMany for all unread notifications of the user", async () => {
      mockUpdateMany.mockResolvedValue({ count: 3 });

      await svc.markAllRead(USER_A);

      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      const call = mockUpdateMany.mock.calls[0][0];
      expect(call.where.userId).toBe(USER_A);
      expect(call.where.isRead).toBe(false);
    });

    it("sets isRead=true and a non-null readAt on all matched rows", async () => {
      mockUpdateMany.mockResolvedValue({ count: 5 });

      const before = new Date();
      await svc.markAllRead(USER_A);
      const after  = new Date();

      const call = mockUpdateMany.mock.calls[0][0];
      expect(call.data.isRead).toBe(true);
      expect(call.data.readAt).toBeInstanceOf(Date);
      expect((call.data.readAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect((call.data.readAt as Date).getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("is a no-op (no error) when the user has no unread notifications", async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });

      await expect(svc.markAllRead(USER_A)).resolves.toBeUndefined();
    });
  });
});
