import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import {
  generateJournalNumber as generateJournalNumberUtil,
} from "../lib/journal-entry-utils";

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

// ── POST /:id/close — create closing entries and mark fiscal year CLOSED ───────
router.post("/:id/close", requireAuth(), async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }
    if (!user.organizationId) { res.status(400).json({ error: "User has no organization" }); return; }

    const { retainedEarningsAccountId } = req.body;
    if (!retainedEarningsAccountId) {
      res.status(400).json({ error: "retainedEarningsAccountId is required" });
      return;
    }

    // ── 1. Resolve and guard the fiscal year ──────────────────────────────────
    const fy = await prisma.fiscalYear.findFirst({
      where: { id: req.params.id as string, organizationId: user.organizationId, deletedAt: null },
    });
    if (!fy) { res.status(404).json({ error: "Fiscal year not found" }); return; }
    if (fy.status !== "OPEN") {
      res.status(400).json({ error: `Fiscal year is already ${fy.status}. Closing entries cannot be created.` });
      return;
    }

    // ── 2. Check for existing CLOSING entries (idempotency guard) ─────────────
    const existingClosing = await prisma.journalEntry.findFirst({
      where: { fiscalYearId: fy.id, type: "CLOSING", deletedAt: null },
    });
    if (existingClosing) {
      res.status(400).json({ error: "Closing entries already exist for this fiscal year." });
      return;
    }

    // ── 3. Validate retained earnings account ─────────────────────────────────
    const reAccount = await prisma.chartOfAccount.findFirst({
      where: {
        id: retainedEarningsAccountId,
        organizationId: user.organizationId,
        type: "EQUITY",
        isActive: true,
        deletedAt: null,
      },
    });
    if (!reAccount) {
      res.status(400).json({ error: "Retained earnings account not found or is not an active EQUITY account." });
      return;
    }

    // ── 4. Aggregate POSTED journal entry lines for REVENUE & EXPENSE accounts ─
    const postedLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: { fiscalYearId: fy.id, status: "POSTED", deletedAt: null },
        account: { type: { in: ["REVENUE", "EXPENSE"] }, organizationId: user.organizationId },
      },
      include: {
        account: { select: { id: true, code: true, nameEn: true, nameAr: true, type: true, nature: true } },
      },
    });

    // ── 5. Group by account ────────────────────────────────────────────────────
    const accountMap = new Map<string, {
      accountId:   string;
      totalDebit:  number;
      totalCredit: number;
    }>();
    for (const line of postedLines) {
      const existing = accountMap.get(line.accountId);
      if (existing) {
        existing.totalDebit  += Number(line.debit);
        existing.totalCredit += Number(line.credit);
      } else {
        accountMap.set(line.accountId, {
          accountId:   line.accountId,
          totalDebit:  Number(line.debit),
          totalCredit: Number(line.credit),
        });
      }
    }

    // ── 6. Build closing entry lines (zero out each account's net position) ────
    const closingLines: { accountId: string; lineNumber: number; debit: number; credit: number }[] = [];
    let lineNumber = 1;
    let totalClosingDebits  = 0;
    let totalClosingCredits = 0;

    for (const acc of accountMap.values()) {
      const netDebit = acc.totalDebit - acc.totalCredit;
      if (netDebit === 0) continue;
      if (netDebit > 0) {
        // Net debit balance → close with a credit
        closingLines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: 0, credit: netDebit });
        totalClosingCredits += netDebit;
      } else {
        // Net credit balance → close with a debit
        closingLines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: -netDebit, credit: 0 });
        totalClosingDebits += -netDebit;
      }
    }

    if (closingLines.length === 0) {
      res.status(400).json({ error: "No revenue or expense balances found to close for this fiscal year." });
      return;
    }

    // ── 7. Add retained earnings line to balance the entry ────────────────────
    // imbalance > 0: closing debits > credits → revenue accounts had more credit
    //   balances (profit) → need Cr RE to balance
    // imbalance < 0: closing credits > debits → expense accounts had more debit
    //   balances (loss) → need Dr RE to balance
    const imbalance = totalClosingDebits - totalClosingCredits;
    if (imbalance > 0) {
      closingLines.push({ accountId: retainedEarningsAccountId, lineNumber: lineNumber++, debit: 0, credit: imbalance });
      totalClosingCredits += imbalance;
    } else if (imbalance < 0) {
      closingLines.push({ accountId: retainedEarningsAccountId, lineNumber: lineNumber++, debit: -imbalance, credit: 0 });
      totalClosingDebits += -imbalance;
    }

    // Net income from the perspective of P&L: revenue credit balances - expense debit balances.
    // In closing terms: closing debits (from revenue) - closing credits (from expenses).
    // When profit: totalClosingDebits (rev) > totalClosingCredits (exp) → net = positive.
    const netIncome = totalClosingDebits - totalClosingCredits + (imbalance > 0 ? -imbalance : (imbalance < 0 ? -imbalance : 0));
    // Simpler: net income = imbalance before RE line was added (positive = profit, negative = loss).
    const netIncomeValue = imbalance; // positive = profit (Cr RE), negative = loss (Dr RE)

    // ── 8. Create closing JE + mark FY closed — all in one transaction ────────
    const entryYear = fy.endDate.getFullYear();
    const number    = await generateJournalNumberUtil(user.organizationId, entryYear, prisma);
    const closingDate = fy.endDate;

    const result = await prisma.$transaction(async (tx) => {
      const closingEntry = await tx.journalEntry.create({
        data: {
          organizationId:  user.organizationId!,
          fiscalYearId:    fy.id,
          number,
          entryDate:       closingDate,
          type:            "CLOSING",
          status:          "POSTED",
          currencyCode:    "SAR",
          exchangeRate:    1,
          totalDebit:      totalClosingDebits,
          totalCredit:     totalClosingCredits,
          descriptionEn:   `Year-end closing entries for ${fy.nameEn}`,
          descriptionAr:   `قيود الإقفال لنهاية العام ${fy.nameAr}`,
          postedAt:        new Date(),
          postedByUserId:  user.id,
          createdByUserId: user.id,
          lines: {
            create: closingLines.map((l) => ({
              accountId:    l.accountId,
              lineNumber:   l.lineNumber,
              debit:        l.debit,
              credit:       l.credit,
              debitBase:    l.debit,
              creditBase:   l.credit,
              descriptionEn: `Closing entry`,
              descriptionAr: `قيد إقفال`,
            })),
          },
        },
        include: { lines: true },
      });

      const closedFY = await tx.fiscalYear.update({
        where: { id: fy.id },
        data: {
          status:        "CLOSED",
          closedAt:      new Date(),
          closedByUserId: user.id,
        },
      });

      return { closingEntry, closedFY };
    });

    res.json({
      fiscalYearId:          fy.id,
      status:                "CLOSED",
      closingJournalEntryId: result.closingEntry.id,
      netIncome:             netIncomeValue,
      closedAt:              result.closedFY.closedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to close fiscal year" });
  }
});

export default router;
