import { Router } from "express";
import { db, organizationsTable, usersTable, activityTable } from "@workspace/db";
import { count, desc } from "drizzle-orm";
import { requireAuth } from "@clerk/express";

const router = Router();

router.get("/stats", requireAuth(), async (req, res) => {
  try {
    const [orgCount] = await db.select({ count: count() }).from(organizationsTable);
    const [userCount] = await db.select({ count: count() }).from(usersTable);

    res.json({
      totalUsers: Number(userCount?.count ?? 0),
      totalOrganizations: Number(orgCount?.count ?? 0),
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
    const items = await db
      .select()
      .from(activityTable)
      .orderBy(desc(activityTable.createdAt))
      .limit(20);

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent activity" });
  }
});

export default router;
