import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { z } from "zod";
import { requirePermission } from "../lib/authorize";

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

router.get("/", requireAuth(), async (req, res) => {
  try {
    const orgs = await prisma.organization.findMany({
      where:   { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

router.post("/", requireAuth(), requirePermission("organizations", "create"), async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const org = await prisma.organization.create({
      data: parsed.data,
    });
    return res.status(201).json(org);
  } catch (err) {
    return res.status(500).json({ error: "Failed to create organization" });
  }
});

router.get("/:id", requireAuth(), async (req, res) => {
  try {
    const org = await prisma.organization.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!org) return res.status(404).json({ error: "Not found" });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch organization" });
  }
});

router.patch("/:id", requireAuth(), requirePermission("organizations", "update"), async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data:  parsed.data,
    });
    return res.json(org);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update organization" });
  }
});

export default router;
