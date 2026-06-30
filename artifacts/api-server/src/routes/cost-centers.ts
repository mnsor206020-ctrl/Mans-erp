import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { organizationId, isActive } = req.query;
    const orgId = (organizationId as string) || user.organizationId || undefined;

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
});

export default router;
