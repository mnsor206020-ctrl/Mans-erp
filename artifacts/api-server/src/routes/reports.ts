import { Router } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

// ─── GET /reports/trial-balance ───────────────────────────────────────────────

router.get("/trial-balance", async (req, res): Promise<void> => {
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
      status: { in: ["POSTED", "REVERSED"] },
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

// ─── GET /reports/account-ledger ──────────────────────────────────────────────

router.get("/account-ledger", async (req, res): Promise<void> => {
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

    const { accountId, from, to } = req.query as Record<string, string>;
    if (!accountId || !from || !to) {
      res.status(400).json({ error: "accountId, from, and to are required" });
      return;
    }

    const account = await prisma.chartOfAccount.findFirst({
      where: { id: accountId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    // Reversed originals retain their posted amounts; their reversals offset them.
    // Beginning balance includes both statuses strictly before `from`.
    const priorLines = await prisma.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: {
          organizationId: user.organizationId,
          status:         { in: ["POSTED", "REVERSED"] },
          deletedAt:      null,
          entryDate:      { lt: new Date(from) },
        },
      },
      select: { debit: true, credit: true },
    });
    const beginningBalance = priorLines.reduce(
      (sum, l) => sum + Number(l.debit) - Number(l.credit),
      0,
    );

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: {
          organizationId: user.organizationId,
          status:         { in: ["POSTED", "REVERSED"] },
          deletedAt:      null,
          entryDate:      { gte: new Date(from), lte: new Date(to) },
        },
      },
      include: {
        journalEntry: {
          select: {
            id:            true,
            number:        true,
            entryDate:     true,
            descriptionEn: true,
            descriptionAr: true,
            reference:     true,
          },
        },
      },
      orderBy: [
        { journalEntry: { entryDate: "asc" } },
        { journalEntry: { number:    "asc" } },
        { lineNumber:   "asc" },
      ],
    });

    let runningBalance = beginningBalance;
    let totalDebit     = 0;
    let totalCredit    = 0;
    const rows = lines.map((line) => {
      const debit  = Number(line.debit);
      const credit = Number(line.credit);
      totalDebit  += debit;
      totalCredit += credit;
      runningBalance += debit - credit;
      return {
        journalEntryId: line.journalEntryId,
        journalNumber:  line.journalEntry.number,
        entryDate:      line.journalEntry.entryDate.toISOString().slice(0, 10),
        descriptionEn:  line.journalEntry.descriptionEn ?? null,
        descriptionAr:  line.journalEntry.descriptionAr ?? null,
        reference:      line.journalEntry.reference     ?? null,
        debit,
        credit,
        runningBalance,
      };
    });

    res.json({
      accountId,
      accountCode:      account.code,
      accountNameEn:    account.nameEn,
      accountNameAr:    account.nameAr,
      from,
      to,
      beginningBalance,
      totalDebit,
      totalCredit,
      endingBalance:    beginningBalance + totalDebit - totalCredit,
      lines:            rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate account ledger" });
  }
});

// ─── GET /reports/balance-sheet ───────────────────────────────────────────────

router.get("/balance-sheet", async (req, res): Promise<void> => {
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
    if (!fiscalYearId || !asOf) {
      res.status(400).json({ error: "fiscalYearId and asOf are required" });
      return;
    }

    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!fiscalYear) {
      res.status(404).json({ error: "Fiscal year not found" });
      return;
    }

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        account: {
          type:           { in: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] },
          organizationId: user.organizationId,
          deletedAt:      null,
        },
        journalEntry: {
          fiscalYearId,
          status:    { in: ["POSTED", "REVERSED"] },
          deletedAt: null,
          entryDate: { lte: new Date(asOf) },
        },
      },
      include: {
        account: {
          select: {
            id:      true,
            code:    true,
            nameEn:  true,
            nameAr:  true,
            type:    true,
            nature:  true,
          },
        },
      },
    });

    // Aggregate debit/credit per account
    const accountMap = new Map<string, {
      accountId:     string;
      accountCode:   string;
      accountNameEn: string;
      accountNameAr: string;
      type:          string;
      nature:        string;
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
          type:          line.account.type,
          nature:        line.account.nature,
          totalDebit:    Number(line.debit),
          totalCredit:   Number(line.credit),
        });
      }
    }

    // Balance per nature: DEBIT accounts → debit − credit; CREDIT accounts → credit − debit
    const assets:      { accountId: string; accountCode: string; accountNameEn: string; accountNameAr: string; balance: number }[] = [];
    const liabilities: typeof assets = [];
    const equity:      typeof assets = [];
    let currentYearResult = 0;

    for (const acc of accountMap.values()) {
      const balance =
        acc.nature === "DEBIT"
          ? acc.totalDebit - acc.totalCredit
          : acc.totalCredit - acc.totalDebit;

      const row = {
        accountId:     acc.accountId,
        accountCode:   acc.accountCode,
        accountNameEn: acc.accountNameEn,
        accountNameAr: acc.accountNameAr,
        balance,
      };

      if      (acc.type === "ASSET")     assets.push(row);
      else if (acc.type === "LIABILITY") liabilities.push(row);
      else if (acc.type === "EQUITY")    equity.push(row);
      else if (acc.type === "REVENUE")   currentYearResult += balance;
      else if (acc.type === "EXPENSE")   currentYearResult -= balance;
    }

    // Unclosed income/expense balances belong to equity at the same cutoff.
    // This is a report-only row, not an account or a closing journal entry.
    if (currentYearResult !== 0) {
      equity.push({
        accountId: "current-year-result",
        accountCode: "CURRENT_YEAR_RESULT",
        accountNameEn: "Current year profit / loss",
        accountNameAr: "ربح / خسارة السنة الحالية",
        balance: currentYearResult,
      });
    }

    // Sort each section by account code
    const byCode = (a: { accountCode: string }, b: { accountCode: string }) =>
      a.accountCode.localeCompare(b.accountCode);
    assets.sort(byCode);
    liabilities.sort(byCode);
    equity.sort(byCode);

    const totalAssets      = assets.reduce((s, r) => s + r.balance, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
    const totalEquity      = equity.reduce((s, r) => s + r.balance, 0);
    const isBalanced       = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

    res.json({
      fiscalYearId,
      asOf,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      isBalanced,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate balance sheet" });
  }
});

// ─── GET /reports/income-statement ────────────────────────────────────────────

router.get("/income-statement", async (req, res): Promise<void> => {
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

    const { fiscalYearId, from, to } = req.query as Record<string, string>;
    if (!fiscalYearId || !from || !to) {
      res.status(400).json({ error: "fiscalYearId, from, and to are required" });
      return;
    }

    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!fiscalYear) {
      res.status(404).json({ error: "Fiscal year not found" });
      return;
    }

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        account: {
          type:           { in: ["REVENUE", "EXPENSE"] },
          organizationId: user.organizationId,
          deletedAt:      null,
        },
        journalEntry: {
          fiscalYearId,
          status:    { in: ["POSTED", "REVERSED"] },
          deletedAt: null,
          entryDate: { gte: new Date(from), lte: new Date(to) },
        },
      },
      include: {
        account: {
          select: {
            id:     true,
            code:   true,
            nameEn: true,
            nameAr: true,
            type:   true,
            nature: true,
          },
        },
      },
    });

    // Aggregate debit/credit per account
    const accountMap = new Map<string, {
      accountId:     string;
      accountCode:   string;
      accountNameEn: string;
      accountNameAr: string;
      type:          string;
      nature:        string;
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
          type:          line.account.type,
          nature:        line.account.nature,
          totalDebit:    Number(line.debit),
          totalCredit:   Number(line.credit),
        });
      }
    }

    // Balance per nature: CREDIT → credit − debit; DEBIT → debit − credit
    const revenue:  { accountId: string; accountCode: string; accountNameEn: string; accountNameAr: string; balance: number }[] = [];
    const expenses: typeof revenue = [];

    for (const acc of accountMap.values()) {
      const balance =
        acc.nature === "CREDIT"
          ? acc.totalCredit - acc.totalDebit
          : acc.totalDebit - acc.totalCredit;

      const row = {
        accountId:     acc.accountId,
        accountCode:   acc.accountCode,
        accountNameEn: acc.accountNameEn,
        accountNameAr: acc.accountNameAr,
        balance,
      };

      if      (acc.type === "REVENUE") revenue.push(row);
      else if (acc.type === "EXPENSE") expenses.push(row);
    }

    // Sort each section by account code
    const byCode = (a: { accountCode: string }, b: { accountCode: string }) =>
      a.accountCode.localeCompare(b.accountCode);
    revenue.sort(byCode);
    expenses.sort(byCode);

    const totalRevenue  = revenue.reduce((s, r) => s + r.balance, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0);
    const netIncome     = totalRevenue - totalExpenses;

    res.json({
      fiscalYearId,
      from,
      to,
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate income statement" });
  }
});

export default router;
