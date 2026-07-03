import { Router } from "express";
import { getAuth, requireAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { z } from "zod";
import { getCurrentUserWithRoles, requirePermission } from "../lib/authorize";

const router = Router();

router.get("/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      // Bootstrap: the very first user in a fresh system becomes Super Admin
      // so there is always someone able to assign roles to everyone else.
      const existingUserCount = await prisma.user.count();
      const superAdminRole = existingUserCount === 0
        ? await prisma.role.findFirst({ where: { nameEn: "Super Admin", deletedAt: null } })
        : null;

      user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: { clerkId: userId, email: "" },
        });

        if (superAdminRole) {
          await tx.userRole.create({
            data: { userId: createdUser.id, roleId: superAdminRole.id },
          });
        }

        return createdUser;
      });
    }

    const userWithRoles = await getCurrentUserWithRoles(userId);
    res.json(userWithRoles ?? user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.patch("/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { firstNameEn, lastNameEn, firstNameAr, lastNameAr, avatarUrl } = req.body;
    const user = await prisma.user.update({
      where: { clerkId: userId },
      data:  { firstNameEn, lastNameEn, firstNameAr, lastNameAr, avatarUrl },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.get("/", requireAuth(), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where:   { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to list users" });
  }
});

const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});

// Only Super Admin (the only role with `users:update`) can assign roles to a user.
router.patch("/:id/roles", requireAuth(), requirePermission("users", "update"), async (req, res) => {
  try {
    const parsed = assignRolesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    const roles = await prisma.role.findMany({
      where: { id: { in: parsed.data.roleIds }, deletedAt: null },
    });
    if (roles.length !== parsed.data.roleIds.length) {
      return res.status(400).json({ error: "One or more roles not found" });
    }

    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: targetUser.id } }),
      prisma.userRole.createMany({
        data: parsed.data.roleIds.map((roleId) => ({ userId: targetUser.id, roleId })),
      }),
    ]);

    const updated = await getCurrentUserWithRoles(targetUser.clerkId);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update user roles" });
  }
});

export default router;
