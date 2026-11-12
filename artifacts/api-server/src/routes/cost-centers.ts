import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

router.get("/", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { isActive } = req.query;
    const orgId = user.organizationId || undefined;

    const centers = await prisma.costCenter.findMany({
      where: {
        deletedAt: null,
        ...(orgId ? { organizationId: orgId } : {}),
        ...(isActive !== undefined ? { isActive: isActive === "true" } : {}),
      },
      orderBy: [{ code: "asc" }],
    });

    res.json(centers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch cost centers" });
  }
  return undefined;
});

export default router;
