import { Router } from "express";
import { getAuth, requireAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { z } from "zod";
import { getCurrentUserWithRoles, isPlatformAdmin, requirePermission } from "../lib/authorize";
import { routeParam } from "../lib/route-param";

const router = Router();

// ── Shared audit helper ───────────────────────────────────────────────────────

async function audit(
  actor: { id: string; email: string },
  action: "CREATE" | "UPDATE" | "DELETE",
  entityType: string,
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
        entityType,
        entityId,
        oldValues: oldValues ?? undefined,
        newValues: newValues ?? undefined,
        description,
      },
    });
  } catch {
    // Audit failures must never break business logic
  }
}

// ── Role-removal safety guards ────────────────────────────────────────────────

function isAdminRole(roleNameEn: string): boolean {
  return roleNameEn === "Super Admin" || roleNameEn === "Organization Admin";
}

/** Pass the already-loaded role to avoid a duplicate DB fetch. */
async function assertRoleRemovalSafe(
  targetUserId: string,
  role: { id: string; nameEn: string },
  actorId: string,
) {
  // Self-demotion: cannot remove your own last admin role
  if (targetUserId === actorId && isAdminRole(role.nameEn)) {
    const remainingAdminRoles = await prisma.userRole.count({
      where: {
        userId: targetUserId,
        roleId: { not: role.id },
        role: { nameEn: { in: ["Super Admin", "Organization Admin"] } },
      },
    });
    if (remainingAdminRoles === 0) {
      throw Object.assign(
        new Error("You cannot remove your own last admin role"),
        { status: 409 },
      );
    }
  }

  // Last Super Admin guard (unchanged — role.id is used below)
  if (role.nameEn === "Super Admin") {
    const otherSuperAdmins = await prisma.userRole.count({
      where: {
        userId: { not: targetUserId },
        role: { nameEn: "Super Admin" },
        user: { deletedAt: null },
      },
    });
    if (otherSuperAdmins === 0) {
      throw Object.assign(
        new Error("Cannot remove the last Super Admin in the system"),
        { status: 409 },
      );
    }
  }

  // Last Organization Admin guard
  if (role.nameEn === "Organization Admin") {
    const targetUser = await prisma.user.findFirst({ where: { id: targetUserId } });
    if (targetUser?.organizationId) {
      const otherOrgAdmins = await prisma.userRole.count({
        where: {
          userId: { not: targetUserId },
          role: { nameEn: "Organization Admin" },
          user: { organizationId: targetUser.organizationId, deletedAt: null },
        },
      });
      if (otherOrgAdmins === 0) {
        throw Object.assign(
          new Error("Cannot remove the last Organization Admin for this organization"),
          { status: 409 },
        );
      }
    }
  }
}

// ── GET /users/me ─────────────────────────────────────────────────────────────

router.get("/me", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let user = await prisma.user.findUnique({ where: { clerkId: userId } });

    if (!user) {
      // Bootstrap: very first user in a fresh system becomes Super Admin
      const existingUserCount = await prisma.user.count();
      const superAdminRole =
        existingUserCount === 0
          ? await prisma.role.findFirst({ where: { nameEn: "Super Admin", deletedAt: null } })
          : null;

      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { clerkId: userId, email: "" } });
        if (superAdminRole) {
          await tx.userRole.create({ data: { userId: created.id, roleId: superAdminRole.id } });
        }
        return created;
      });
    }

    const userWithRoles = await getCurrentUserWithRoles(userId);
    return res.json(userWithRoles ?? user);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ── PATCH /users/me ───────────────────────────────────────────────────────────

router.patch("/me", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { firstNameEn, lastNameEn, firstNameAr, lastNameAr, avatarUrl } = req.body;
    const user = await prisma.user.update({
      where: { clerkId: userId },
      data: { firstNameEn, lastNameEn, firstNameAr, lastNameAr, avatarUrl },
    });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update user" });
  }
});

// ── GET /users — list with search / filter / pagination ───────────────────────

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  roleId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  "/",
  requirePermission("users", "read"),
  async (req, res) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ error: "Invalid query params", details: parsed.error.flatten() });
      }

      const { search, status, roleId, page, limit } = parsed.data;
      const actor = req.currentUser!;
      const orgFilter = isPlatformAdmin(actor) ? {} : { organizationId: actor.organizationId };

      const where: Record<string, unknown> = {
        deletedAt: null,
        ...orgFilter,
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { firstNameEn: { contains: search, mode: "insensitive" } },
                { lastNameEn: { contains: search, mode: "insensitive" } },
                { firstNameAr: { contains: search, mode: "insensitive" } },
                { lastNameAr: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(roleId ? { userRoles: { some: { roleId } } } : {}),
      };

      const [users, total] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          include: {
            userRoles: { include: { role: true } },
            organization: { select: { id: true, nameEn: true, nameAr: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count({ where }),
      ]);

      return res.json({ data: users, total, page, limit });
    } catch (err) {
      return res.status(500).json({ error: "Failed to list users" });
    }
  },
);

// ── GET /users/:id — user detail ──────────────────────────────────────────────

router.get("/:id", requirePermission("users", "read"), async (req, res) => {
  try {
    const actor = req.currentUser!;
    const orgFilter = isPlatformAdmin(actor) ? {} : { organizationId: actor.organizationId };

    const user = await prisma.user.findFirst({
      where: { id: routeParam(req.params.id), deletedAt: null, ...orgFilter },
      include: {
        userRoles: { include: { role: true } },
        organization: { select: { id: true, nameEn: true, nameAr: true } },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ── PATCH /users/:id/status — activate / deactivate ──────────────────────────

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

router.patch(
  "/:id/status",
  requirePermission("users", "update"),
  async (req, res) => {
    try {
      const actor = req.currentUser!;

      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ error: "Validation failed", details: parsed.error.flatten() });
      }

      if (routeParam(req.params.id) === actor.id) {
        return res.status(409).json({ error: "You cannot change your own account status" });
      }

      const orgFilter = isPlatformAdmin(actor) ? {} : { organizationId: actor.organizationId };
      const targetUser = await prisma.user.findFirst({
        where: { id: routeParam(req.params.id), deletedAt: null, ...orgFilter },
      });
      if (!targetUser) return res.status(404).json({ error: "User not found" });

      const oldStatus = targetUser.status;
      const updated = await prisma.user.update({
        where: { id: targetUser.id },
        data: { status: parsed.data.status },
        include: { userRoles: { include: { role: true } } },
      });

      await audit(
        { id: actor.id, email: actor.email },
        "UPDATE",
        "user",
        targetUser.id,
        { status: oldStatus },
        { status: parsed.data.status },
        `User ${targetUser.email} status changed from ${oldStatus} to ${parsed.data.status}`,
      );

      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "Failed to update user status" });
    }
  },
);

// ── PATCH /users/:id/roles — replace all roles (with safety guards) ───────────

const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});

router.patch(
  "/:id/roles",
  requirePermission("users", "update"),
  async (req, res) => {
    try {
      const actor = req.currentUser!;
      const parsed = assignRolesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ error: "Validation failed", details: parsed.error.flatten() });
      }

      const orgFilter = isPlatformAdmin(actor) ? {} : { organizationId: actor.organizationId };
      const targetUser = await prisma.user.findFirst({
        where: { id: routeParam(req.params.id), deletedAt: null, ...orgFilter },
        include: { userRoles: { include: { role: true } } },
      });
      if (!targetUser) return res.status(404).json({ error: "User not found" });

      const roles = await prisma.role.findMany({
        where: { id: { in: parsed.data.roleIds }, deletedAt: null },
      });
      if (roles.length !== parsed.data.roleIds.length) {
        return res.status(400).json({ error: "One or more roles not found" });
      }

      // Safety: check each role being removed
      const removedRoleIds = (targetUser.userRoles ?? [])
        .map((ur) => ur.roleId)
        .filter((id) => !parsed.data.roleIds.includes(id));

      // Build a lookup map for the roles being removed
      const existingRoleMap = new Map(
        (targetUser.userRoles ?? []).map((ur) => [ur.roleId, ur.role as { id: string; nameEn: string }]),
      );

      for (const removedRoleId of removedRoleIds) {
        const removedRole = existingRoleMap.get(removedRoleId);
        if (!removedRole) continue; // should not happen but be safe
        try {
          await assertRoleRemovalSafe(targetUser.id, removedRole, actor.id);
        } catch (err: unknown) {
          const e = err as { status?: number; message: string };
          return res.status(e.status ?? 409).json({ error: e.message });
        }
      }

      const oldRoles = (targetUser.userRoles ?? []).map((ur) => ur.role.nameEn);

      await prisma.$transaction([
        prisma.userRole.deleteMany({ where: { userId: targetUser.id } }),
        prisma.userRole.createMany({
          data: parsed.data.roleIds.map((roleId) => ({ userId: targetUser.id, roleId })),
        }),
      ]);

      await audit(
        { id: actor.id, email: actor.email },
        "UPDATE",
        "user_roles",
        targetUser.id,
        { roles: oldRoles },
        { roles: roles.map((r) => r.nameEn) },
        `User roles replaced`,
      );

      const updated = await getCurrentUserWithRoles(targetUser.clerkId);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "Failed to update user roles" });
    }
  },
);

// ── POST /users/:id/roles/:roleId — assign a single role ─────────────────────

router.post(
  "/:id/roles/:roleId",
  requirePermission("users", "update"),
  async (req, res) => {
    try {
      const actor = req.currentUser!;
      const orgFilter = isPlatformAdmin(actor) ? {} : { organizationId: actor.organizationId };

      const targetUser = await prisma.user.findFirst({
        where: { id: routeParam(req.params.id), deletedAt: null, ...orgFilter },
      });
      if (!targetUser) return res.status(404).json({ error: "User not found" });

      const role = await prisma.role.findFirst({
        where: { id: routeParam(req.params.roleId), deletedAt: null },
      });
      if (!role) return res.status(404).json({ error: "Role not found" });

      const existing = await prisma.userRole.findFirst({
        where: { userId: targetUser.id, roleId: role.id },
      });
      if (existing) return res.status(409).json({ error: "User already has this role" });

      await prisma.userRole.create({ data: { userId: targetUser.id, roleId: role.id } });

      await audit(
        { id: actor.id, email: actor.email },
        "CREATE",
        "user_roles",
        targetUser.id,
        undefined,
        { roleAdded: role.nameEn },
        `Role "${role.nameEn}" assigned to user ${targetUser.email}`,
      );

      const updated = await getCurrentUserWithRoles(targetUser.clerkId);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "Failed to assign role" });
    }
  },
);

// ── DELETE /users/:id/roles/:roleId — remove a single role ───────────────────

router.delete(
  "/:id/roles/:roleId",
  requirePermission("users", "update"),
  async (req, res) => {
    try {
      const actor = req.currentUser!;
      const orgFilter = isPlatformAdmin(actor) ? {} : { organizationId: actor.organizationId };

      const targetUser = await prisma.user.findFirst({
        where: { id: routeParam(req.params.id), deletedAt: null, ...orgFilter },
      });
      if (!targetUser) return res.status(404).json({ error: "User not found" });

      const role = await prisma.role.findFirst({
        where: { id: routeParam(req.params.roleId), deletedAt: null },
      });
      if (!role) return res.status(404).json({ error: "Role not found" });

      const existing = await prisma.userRole.findFirst({
        where: { userId: targetUser.id, roleId: role.id },
      });
      if (!existing) return res.status(404).json({ error: "User does not have this role" });

      try {
        await assertRoleRemovalSafe(targetUser.id, role, actor.id);
      } catch (err: unknown) {
        const e = err as { status?: number; message: string };
        return res.status(e.status ?? 409).json({ error: e.message });
      }

      await prisma.userRole.delete({ where: { id: existing.id } });

      await audit(
        { id: actor.id, email: actor.email },
        "DELETE",
        "user_roles",
        targetUser.id,
        { roleRemoved: role.nameEn },
        undefined,
        `Role "${role.nameEn}" removed from user ${targetUser.email}`,
      );

      const updated = await getCurrentUserWithRoles(targetUser.clerkId);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "Failed to remove role" });
    }
  },
);

export default router;
