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

    const { organizationId, status } = req.query;
    const orgId = (organizationId as string) || user.organizationId || undefined;

    const fiscalYears = await prisma.fiscalYear.findMany({
      where: {
        deletedAt: null,
        ...(orgId ? { organizationId: orgId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      orderBy: [{ startDate: "desc" }],
    });

    res.json(fiscalYears);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fiscal years" });
  }
});

router.post("/", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { organizationId, nameEn, nameAr, startDate, endDate, isDefault } = req.body;
    const orgId = organizationId || user.organizationId;
    if (!orgId || !nameEn || !nameAr || !startDate || !endDate) {
      return res.status(400).json({ error: "organizationId, nameEn, nameAr, startDate, endDate are required" });
    }

    const fy = await prisma.fiscalYear.create({
      data: {
        organizationId: orgId,
        nameEn,
        nameAr,
        startDate: new Date(startDate),
        endDate:   new Date(endDate),
        isDefault: isDefault ?? false,
        status:    "OPEN",
      },
    });

    res.status(201).json(fy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create fiscal year" });
  }
});

export default router;
