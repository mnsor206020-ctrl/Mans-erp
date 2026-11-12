import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { z } from "zod";
import { getCurrentUserWithRoles, isPlatformAdmin, requirePermission } from "../lib/authorize";
import { routeParam } from "../lib/route-param";

const router = Router();

const ORG_TYPES = ["CHARITY", "FOUNDATION", "NGO", "ASSOCIATION", "GOVERNMENT", "OTHER"] as const;

const createSchema = z.object({
  nameEn:             z.string().min(1),
  nameAr:             z.string().min(1),
  type:               z.enum(ORG_TYPES),
  registrationNumber: z.string().optional(),
  email:              z.string().email().optional(),
  phone:              z.string().optional(),
  city:               z.string().optional(),
});

const updateSchema = z.object({
  nameEn:             z.string().min(1).optional(),
  nameAr:             z.string().min(1).optional(),
  type:               z.enum(ORG_TYPES).optional(),
  registrationNumber: z.string().nullish(),
  email:              z.string().email().nullish(),
  phone:              z.string().nullish(),
  city:               z.string().nullish(),
});

router.get("/", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });
    const currentUser = await getCurrentUserWithRoles(clerkId);
    if (!currentUser) return res.status(401).json({ error: "User not found" });

    if (!isPlatformAdmin(currentUser) && !currentUser.organizationId) {
      return res.json([]);
    }

    const orgs = await prisma.organization.findMany({
      where: {
        deletedAt: null,
        ...(isPlatformAdmin(currentUser) ? {} : { id: currentUser.organizationId! }),
      },
      orderBy: { createdAt: "asc" },
    });
    return res.json(orgs);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

router.post("/", requirePermission("organizations", "create"), async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const creator = req.currentUser;
    const linkCreator = creator?.organizationId === null;
    const org = await prisma.$transaction(async (tx) => {
      const organizationAdmin = linkCreator
        ? await tx.role.findFirst({
            where: { nameEn: "Organization Admin", deletedAt: null },
            select: { id: true },
          })
        : null;

      if (linkCreator && !organizationAdmin) {
        throw new Error("Organization Admin role is not configured");
      }

      const created = await tx.organization.create({ data: parsed.data });
      if (creator && organizationAdmin) {
        await tx.user.update({
          where: { id: creator.id },
          data: { organizationId: created.id },
        });
        await tx.userRole.upsert({
          where: {
            userId_roleId: {
              userId: creator.id,
              roleId: organizationAdmin.id,
            },
          },
          create: { userId: creator.id, roleId: organizationAdmin.id },
          update: {},
        });
      }
      return created;
    });
    return res.status(201).json(org);
  } catch (err) {
    return res.status(500).json({ error: "Failed to create organization" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });
    const currentUser = await getCurrentUserWithRoles(clerkId);
    if (!currentUser) return res.status(401).json({ error: "User not found" });

    if (!isPlatformAdmin(currentUser) && currentUser.organizationId !== routeParam(req.params.id)) {
      return res.status(404).json({ error: "Not found" });
    }

    const org = await prisma.organization.findFirst({
      where: { id: routeParam(req.params.id), deletedAt: null },
    });
    if (!org) return res.status(404).json({ error: "Not found" });
    return res.json(org);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch organization" });
  }
});

router.patch("/:id", requirePermission("organizations", "update"), async (req, res) => {
  try {
    if (!isPlatformAdmin(req.currentUser) && req.currentUser?.organizationId !== routeParam(req.params.id)) {
      return res.status(404).json({ error: "Not found" });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const org = await prisma.organization.update({
      where: { id: routeParam(req.params.id) },
      data:  parsed.data,
    });
    return res.json(org);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update organization" });
  }
});

export default router;
