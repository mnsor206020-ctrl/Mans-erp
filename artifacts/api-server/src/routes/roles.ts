import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { requirePermission } from "../lib/authorize";

const router = Router();

router.get("/", requireAuth(), requirePermission("roles", "read"), async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      where:   { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

export default router;
