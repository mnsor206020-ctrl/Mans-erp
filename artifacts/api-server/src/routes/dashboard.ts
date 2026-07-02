import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate an ordered list of the last N ISO month strings "YYYY-MM". */
function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${d.getFullYear()}-${mm}`);
  }
  return months;
}

// ─── GET /dashboard/stats ────────────────────────────────────────────────────

router.get("/stats", requireAuth(), async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // System-wide counts (visible regardless of org)
    const [totalUsers, totalOrganizations] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.organization.count({ where: { deletedAt: null } }),
    ]);

    // If no org, return zeros for financial KPIs
    if (!user.organizationId) {
      res.json({
        totalUsers,
        totalOrganizations,
        activeProjects:             0,
        totalBeneficiaries:         0,
        totalDonations:             0,
        monthlyGrowth:              0,
        totalReceipts:              0,
        totalPayments:              0,
        netCash:                    0,
        currentBankBalance:         0,
        currentCashBoxBalance:      0,
        postedJournalEntriesCount:  0,
      });
      return;
    }

    const orgId = user.organizationId;

    const [
      receiptAgg,
      paymentAgg,
      bankBalanceAgg,
      cashBoxBalanceAgg,
      postedJECount,
    ] = await Promise.all([
      prisma.receipt.aggregate({
        where:  { organizationId: orgId, status: "CONFIRMED", deletedAt: null },
        _sum:   { amountBase: true },
      }),
      prisma.payment.aggregate({
        where:  { organizationId: orgId, status: "CONFIRMED", deletedAt: null },
        _sum:   { amountBase: true },
      }),
      prisma.bankAccount.aggregate({
        where:  { organizationId: orgId, isActive: true, deletedAt: null },
        _sum:   { currentBalance: true },
      }),
      prisma.cashBox.aggregate({
        where:  { organizationId: orgId, isActive: true, deletedAt: null },
        _sum:   { currentBalance: true },
      }),
      prisma.journalEntry.count({
        where: { organizationId: orgId, status: "POSTED", deletedAt: null },
      }),
    ]);

    const totalReceipts         = Number(receiptAgg._sum.amountBase     ?? 0);
    const totalPayments         = Number(paymentAgg._sum.amountBase     ?? 0);
    const netCash               = totalReceipts - totalPayments;
    const currentBankBalance    = Number(bankBalanceAgg._sum.currentBalance  ?? 0);
    const currentCashBoxBalance = Number(cashBoxBalanceAgg._sum.currentBalance ?? 0);

    res.json({
      totalUsers,
      totalOrganizations,
      activeProjects:             0,
      totalBeneficiaries:         0,
      totalDonations:             0,
      monthlyGrowth:              0,
      totalReceipts,
      totalPayments,
      netCash,
      currentBankBalance,
      currentCashBoxBalance,
      postedJournalEntriesCount:  postedJECount,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

// ─── GET /dashboard/monthly ───────────────────────────────────────────────────

router.get("/monthly", requireAuth(), async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (!user.organizationId) {
      res.status(400).json({ error: "User has no organization" });
      return;
    }

    const orgId = user.organizationId;

    // Start of the month 11 months ago (inclusive window = last 12 calendar months)
    const now     = new Date();
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    type MonthRow = { month: string; total: string };

    const [receiptRows, paymentRows] = await Promise.all([
      prisma.$queryRaw<MonthRow[]>`
        SELECT
          to_char(date_trunc('month', receipt_date), 'YYYY-MM') AS month,
          COALESCE(SUM(amount_base), 0)::text                   AS total
        FROM receipts
        WHERE organization_id = ${orgId}::uuid
          AND status          = 'CONFIRMED'
          AND deleted_at      IS NULL
          AND receipt_date    >= ${fromDate}::date
        GROUP BY date_trunc('month', receipt_date)
      `,
      prisma.$queryRaw<MonthRow[]>`
        SELECT
          to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
          COALESCE(SUM(amount_base), 0)::text                   AS total
        FROM payments
        WHERE organization_id = ${orgId}::uuid
          AND status          = 'CONFIRMED'
          AND deleted_at      IS NULL
          AND payment_date    >= ${fromDate}::date
        GROUP BY date_trunc('month', payment_date)
      `,
    ]);

    // Build lookup maps
    const receiptByMonth  = new Map(receiptRows.map((r) => [r.month, Number(r.total)]));
    const paymentByMonth  = new Map(paymentRows.map((r) => [r.month, Number(r.total)]));

    // Generate all 12 months in order, filling zeros for missing months
    const months = lastNMonths(12);
    const result = months.map((month) => {
      const receipts = receiptByMonth.get(month)  ?? 0;
      const payments = paymentByMonth.get(month)  ?? 0;
      return { month, receipts, payments, net: receipts - payments };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch monthly financial data" });
  }
});

// ─── GET /dashboard/activity ─────────────────────────────────────────────────

router.get("/activity", requireAuth(), async (req, res): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take:    20,
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
