import { Router } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { z } from "zod";
import { isPlatformAdmin, requirePermission } from "../lib/authorize";
import { routeParam } from "../lib/route-param";

const router = Router();

const INVITATION_EXPIRY_DAYS = parseInt(process.env.INVITATION_EXPIRY_DAYS ?? "7", 10);

function buildExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITATION_EXPIRY_DAYS);
  return d;
}

async function audit(
  actor: { id: string; email: string },
  action: "CREATE" | "UPDATE" | "DELETE",
  entityId: string,
  oldValues?: object,
  newValues?: object,
  description?: string,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        userEmail: actor.email,
        action,
        entityType: "invitation",
        entityId,
        oldValues: oldValues ?? undefined,
        newValues: newValues ?? undefined,
        description,
      },
    });
  } catch {
    // Non-blocking
  }
}

const invitationInclude = {
  role: { select: { id: true, nameEn: true, nameAr: true } },
  invitedBy: {
    select: { id: true, email: true, firstNameEn: true, lastNameEn: true },
  },
} as const;

// ── GET /invitations ──────────────────────────────────────────────────────────

router.get("/", requirePermission("invitations", "read"), async (req, res) => {
  try {
    const actor = req.currentUser!;
    if (!isPlatformAdmin(actor) && !actor.organizationId) {
      return res.json([]);
    }

    const orgFilter = isPlatformAdmin(actor)
      ? {}
      : { organizationId: actor.organizationId! };

    const invitations = await prisma.invitation.findMany({
      where: { ...orgFilter },
      include: invitationInclude,
      orderBy: { createdAt: "desc" },
    });

    return res.json(invitations);
  } catch (err) {
    return res.status(500).json({ error: "Failed to list invitations" });
  }
});

// ── POST /invitations ─────────────────────────────────────────────────────────

const createSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid(),
});

router.post(
  "/",
  requirePermission("invitations", "create"),
  async (req, res) => {
    try {
      const actor = req.currentUser!;

      if (!actor.organizationId) {
        return res
          .status(422)
          .json({ error: "You must belong to an organization to send invitations" });
      }

      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ error: "Validation failed", details: parsed.error.flatten() });
      }

      const { email, roleId } = parsed.data;
      const organizationId = actor.organizationId!;

      // Prevent inviting users already in the org
      const existingUser = await prisma.user.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          organizationId,
          deletedAt: null,
        },
      });
      if (existingUser) {
        return res
          .status(409)
          .json({ error: "This user is already a member of your organization" });
      }

      // Prevent duplicate active invitations
      const existingInvite = await prisma.invitation.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          organizationId,
          status: "PENDING",
        },
      });
      if (existingInvite) {
        return res
          .status(409)
          .json({ error: "An active invitation already exists for this email" });
      }

      const role = await prisma.role.findFirst({ where: { id: roleId, deletedAt: null } });
      if (!role) return res.status(404).json({ error: "Role not found" });

      const invitation = await prisma.invitation.create({
        data: {
          email,
          organizationId,
          roleId,
          invitedByUserId: actor.id,
          expiresAt: buildExpiresAt(),
        },
        include: invitationInclude,
      });

      await audit(
        { id: actor.id, email: actor.email },
        "CREATE",
        invitation.id,
        undefined,
        { email, roleId, organizationId },
        `Invitation sent to ${email}`,
      );

      return res.status(201).json(invitation);
    } catch (err) {
      return res.status(500).json({ error: "Failed to create invitation" });
    }
  },
);

// ── DELETE /invitations/:id — revoke ─────────────────────────────────────────

router.delete(
  "/:id",
  requirePermission("invitations", "delete"),
  async (req, res) => {
    try {
      const actor = req.currentUser!;
      const orgFilter = isPlatformAdmin(actor)
        ? {}
        : { organizationId: actor.organizationId! };

      const invitation = await prisma.invitation.findFirst({
        where: { id: routeParam(req.params.id), ...orgFilter },
      });
      if (!invitation) return res.status(404).json({ error: "Invitation not found" });
      if (invitation.status !== "PENDING") {
        return res
          .status(409)
          .json({ error: "Only pending invitations can be revoked" });
      }

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "REVOKED", revokedAt: new Date() },
        include: invitationInclude,
      });

      await audit(
        { id: actor.id, email: actor.email },
        "UPDATE",
        invitation.id,
        { status: "PENDING" },
        { status: "REVOKED" },
        `Invitation to ${invitation.email} revoked`,
      );

      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "Failed to revoke invitation" });
    }
  },
);

// ── POST /invitations/:token/accept ──────────────────────────────────────────

router.post("/:token/accept", async (req, res) => {
  try {
    // This endpoint does NOT use requirePermission, so we load the user directly.
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

    const actor = await prisma.user.findFirst({ where: { clerkId } });
    if (!actor) return res.status(401).json({ error: "User not found" });

    const invitation = await prisma.invitation.findFirst({
      where: { token: req.params.token },
      include: { role: true },
    });
    if (!invitation) return res.status(404).json({ error: "Invitation not found" });

    // Expire if past deadline
    if (invitation.status === "PENDING" && invitation.expiresAt < new Date()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return res.status(410).json({ error: "This invitation has expired" });
    }

    if (invitation.status !== "PENDING") {
      const reason =
        invitation.status === "ACCEPTED"
          ? "This invitation has already been accepted"
          : "This invitation is no longer valid";
      return res.status(409).json({ error: reason });
    }

    // Email must match
    if (
      actor.email &&
      actor.email.toLowerCase() !== invitation.email.toLowerCase()
    ) {
      return res
        .status(403)
        .json({ error: "This invitation was sent to a different email address" });
    }

    await prisma.$transaction(async (tx) => {
      // Idempotent role assignment
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: actor.id, roleId: invitation.roleId } },
        create: { userId: actor.id, roleId: invitation.roleId },
        update: {},
      });

      // Set org if not yet assigned
      if (!actor.organizationId && invitation.organizationId) {
        await tx.user.update({
          where: { id: actor.id },
          data: { organizationId: invitation.organizationId },
        });
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
    });

    await audit(
      { id: actor.id, email: actor.email },
      "UPDATE",
      invitation.id,
      { status: "PENDING" },
      { status: "ACCEPTED", acceptedByUserId: actor.id },
      `Invitation accepted by ${actor.email}`,
    );

    const updated = await prisma.user.findFirst({
      where: { id: actor.id },
      include: { userRoles: { include: { role: true } } },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to accept invitation" });
  }
});

export default router;
