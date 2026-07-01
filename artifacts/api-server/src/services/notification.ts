import { PrismaClient } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EmitParams {
  organizationId: string;
  userIds: string[];
  event: string;
  entityType: string;
  entityId: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
}

export interface NotificationRow {
  id: string;
  organizationId: string;
  userId: string;
  event: string;
  entityType: string;
  entityId: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

// ── Interface ──────────────────────────────────────────────────────────────────

export interface INotificationService {
  /**
   * Fan-out: creates one Notification row per userId.
   * Callers should treat this as fire-and-forget and catch/log errors
   * so notification failures never block the API response.
   */
  emit(params: EmitParams): Promise<void>;

  /** Returns all unread notifications for a user, newest first. */
  getUnread(userId: string): Promise<NotificationRow[]>;

  /**
   * Mark a single notification as read.
   * Scoped to userId so users cannot mark each other's notifications.
   */
  markRead(id: string, userId: string): Promise<void>;

  /** Mark every unread notification as read for the given user. */
  markAllRead(userId: string): Promise<void>;
}

// ── Implementation ─────────────────────────────────────────────────────────────

export class NotificationService implements INotificationService {
  constructor(private readonly db: PrismaClient) {}

  async emit(params: EmitParams): Promise<void> {
    if (params.userIds.length === 0) return;

    const { userIds, ...shared } = params;
    await (this.db.notification as any).createMany({
      data: userIds.map((userId) => ({ ...shared, userId })),
      skipDuplicates: false,
    });
  }

  async getUnread(userId: string): Promise<NotificationRow[]> {
    return (this.db.notification as any).findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: "desc" },
    });
  }

  async markRead(id: string, userId: string): Promise<void> {
    await (this.db.notification as any).updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await (this.db.notification as any).updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

import { prisma } from "@workspace/prisma";

export const notificationService: INotificationService = new NotificationService(prisma);
