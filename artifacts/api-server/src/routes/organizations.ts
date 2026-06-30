import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

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

router.post("/", requireAuth(), async (req, res) => {
  try {
    const { nameEn, nameAr, type, registrationNumber, email, phone, city } = req.body;
    if (!nameEn || !nameAr || !type) {
      return res.status(400).json({ error: "nameEn, nameAr, and type are required" });
    }
    const org = await prisma.organization.create({
      data: { nameEn, nameAr, type, registrationNumber, email, phone, city },
    });
    res.status(201).json(org);
  } catch (err) {
    res.status(500).json({ error: "Failed to create organization" });
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

router.patch("/:id", requireAuth(), async (req, res) => {
  try {
    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: "Failed to update organization" });
  }
});

export default router;
