import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    if (!user.organizationId) {
      return res.json({ data: [] });
    }

    const branches = await prisma.branch.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
      },
      orderBy: { nameEn: "asc" },
    });

    return res.json({ data: branches });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch branches" });
  }
});

export default router;
