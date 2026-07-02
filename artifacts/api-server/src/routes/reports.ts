import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

// ─── GET /reports/trial-balance ───────────────────────────────────────────────

router.get("/trial-balance", requireAuth(), async (req, res): Promise<void> => {
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

    const { fiscalYearId, asOf } = req.query as Record<string, string>;
    if (!fiscalYearId) {
      res.status(400).json({ error: "fiscalYearId is required" });
      return;
    }

    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!fiscalYear) {
      res.status(404).json({ error: "Fiscal year not found" });
      return;
    }

    const jeWhere: Record<string, unknown> = {
      fiscalYearId,
      status: "POSTED",
      deletedAt: null,
    };
    if (asOf) {
      jeWhere.entryDate = { lte: new Date(asOf) };
    }

    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntry: jeWhere },
      include: {
        account: { select: { id: true, code: true, nameEn: true, nameAr: true } },
      },
    });

    const accountMap = new Map<string, {
      accountId:     string;
      accountCode:   string;
      accountNameEn: string;
      accountNameAr: string;
      totalDebit:    number;
      totalCredit:   number;
    }>();

    for (const line of lines) {
      const key      = line.accountId;
      const existing = accountMap.get(key);
      if (existing) {
        existing.totalDebit  += Number(line.debit);
        existing.totalCredit += Number(line.credit);
      } else {
        accountMap.set(key, {
          accountId:     line.accountId,
          accountCode:   line.account.code,
          accountNameEn: line.account.nameEn,
          accountNameAr: line.account.nameAr,
          totalDebit:    Number(line.debit),
          totalCredit:   Number(line.credit),
        });
      }
    }

    const reportLines = Array.from(accountMap.values())
      .map(row => ({ ...row, balance: row.totalDebit - row.totalCredit }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalDebit  = reportLines.reduce((sum, r) => sum + r.totalDebit,  0);
    const totalCredit = reportLines.reduce((sum, r) => sum + r.totalCredit, 0);

    res.json({
      fiscalYearId,
      asOf:         asOf ?? null,
      lines:        reportLines,
      totalDebit,
      totalCredit,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate trial balance" });
  }
});

export default router;
