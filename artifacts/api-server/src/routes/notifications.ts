import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { notificationService } from "../services/notification";

const router = Router();

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId } });
}

// ── GET /api/notifications/unread ────────────────────────────────────────────
router.get("/unread", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const notifications = await notificationService.getUnread(user.id);
    res.json({ data: notifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
// Must be registered before /:id/read to avoid "read-all" matching /:id
router.patch("/read-all", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    await notificationService.markAllRead(user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch("/:id/read", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    await notificationService.markRead(req.params.id, user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

export default router;
