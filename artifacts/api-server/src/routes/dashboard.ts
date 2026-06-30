import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

router.get("/stats", requireAuth(), async (req, res) => {
  try {
    const [totalUsers, totalOrganizations, totalBankAccounts] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.organization.count({ where: { deletedAt: null } }),
      prisma.bankAccount.count({ where: { deletedAt: null } }),
    ]);

    res.json({
      totalUsers,
      totalOrganizations,
      activeProjects: 0,
      totalBeneficiaries: 0,
      totalDonations: 0,
      monthlyGrowth: 12.5,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

router.get("/activity", requireAuth(), async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { email: true, firstNameEn: true, lastNameEn: true } } },
    });

    const items = logs.map((log, i) => ({
      id:            i + 1,
      type:          log.action.toLowerCase(),
      description:   log.description ?? `${log.action} on ${log.entityType}`,
      descriptionAr: log.description ?? `${log.action} على ${log.entityType}`,
      userName:      log.userEmail ?? log.user?.email ?? "System",
      createdAt:     log.createdAt.toISOString(),
    }));

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent activity" });
  }
});

export default router;
