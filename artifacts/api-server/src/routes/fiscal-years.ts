import { requireAuth, getAuth } from "@clerk/express";
import { prisma as basePrisma } from "@workspace/prisma";
import { createAccountingRouter } from "../lib/accounting-transaction";
import { z } from "zod";
import {
  generateJournalNumber as generateJournalNumberUtil,
} from "../lib/journal-entry-utils";
import { requirePermission } from "../lib/authorize";
import { financialJournalStatusFilter } from "../lib/financial-journal-status";
import { fiscalYearWindowError } from "../lib/accounting-period";
import { Prisma } from "@prisma/client";

const { router, prisma } = createAccountingRouter("years", basePrisma);

const isoDate = z.string().refine((v) => !isNaN(new Date(v).getTime()), {
  message: "must be a valid date",
});

const createSchema = z.object({
  organizationId: z.string().min(1).optional(),
  nameEn:         z.string().min(1),
  nameAr:         z.string().min(1),
  startDate:      isoDate,
  endDate:        isoDate,
  isDefault:      z.boolean().optional(),
});
const updateSchema = createSchema.partial().strict();

const closeSchema = z.object({
  retainedEarningsAccountId: z.string().min(1),
});

const rolloverSchema = z.object({
  nameEn:    z.string().min(1).optional(),
  nameAr:    z.string().min(1).optional(),
  startDate: isoDate.optional(),
  endDate:   isoDate.optional(),
});

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

router.get("/", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    if (!user.organizationId) return res.status(400).json({ error: "User has no organization" });
    const { status } = req.query;
    const orgId = user.organizationId;

    const fiscalYears = await prisma.fiscalYear.findMany({
      where: {
        deletedAt: null,
        organizationId: orgId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: [{ startDate: "desc" }],
    });

    res.json(fiscalYears);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fiscal years" });
  }
  return undefined;
});

router.post("/", requirePermission("fiscal_years", "create"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (!user.organizationId) return res.status(400).json({ error: "User has no organization" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const { organizationId, nameEn, nameAr, startDate, endDate, isDefault } = parsed.data;
    const orgId = user.organizationId;
    if (organizationId && organizationId !== orgId) {
      return res.status(403).json({ error: "Forbidden: organization does not match the authenticated user" });
    }

    const windowError = await fiscalYearWindowError(prisma, orgId, new Date(startDate), new Date(endDate));
    if (windowError) return res.status(400).json({ error: windowError });

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
  return undefined;
});

// Date/name edits only. Closing/reopening cannot be requested through PATCH.
router.patch("/:id", requirePermission("fiscal_years", "update"), async (req, res): Promise<void> => {
  try {
    const user = req.currentUser!;
    const id = req.params.id as string;
    const existing = await prisma.fiscalYear.findFirst({
      where: { id, organizationId: user.organizationId!, deletedAt: null },
    });
    if (!existing) { res.status(404).json({ error: "السنة المالية غير موجودة ضمن منظمتك." }); return; }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "بيانات تعديل السنة المالية غير صالحة.", details: parsed.error.flatten() }); return; }
    const data = parsed.data;
    if (data.organizationId && data.organizationId !== user.organizationId) {
      res.status(403).json({ error: "لا يمكن نقل السنة المالية إلى منظمة أخرى." }); return;
    }
    const startDate = data.startDate ? new Date(data.startDate) : existing.startDate;
    const endDate = data.endDate ? new Date(data.endDate) : existing.endDate;
    const error = await fiscalYearWindowError(prisma, user.organizationId!, startDate, endDate, id);
    if (error) { res.status(400).json({ error }); return; }
    if (existing.previousFiscalYearId) {
      const previous = await prisma.fiscalYear.findFirst({
        where: { id: existing.previousFiscalYearId, organizationId: user.organizationId!, deletedAt: null },
      });
      if (!previous || startDate <= previous.endDate) {
        res.status(400).json({ error: "تواريخ السنة يجب أن تظل بعد السنة المالية السابقة المرتبطة بها." }); return;
      }
    }
    const successor = await prisma.fiscalYear.findFirst({
      where: { previousFiscalYearId: id, organizationId: user.organizationId!, deletedAt: null },
    });
    if (successor && endDate >= successor.startDate) {
      res.status(400).json({ error: "تواريخ السنة يجب أن تظل قبل السنة المالية التالية المرتبطة بها." }); return;
    }
    const outsideEntry = await prisma.journalEntry.findFirst({
      where: {
        organizationId: user.organizationId!, fiscalYearId: id,
        OR: [{ entryDate: { lt: startDate } }, { entryDate: { gt: endDate } }],
      },
    });
    if (outsideEntry) {
      res.status(400).json({ error: "لا يمكن تغيير حدود السنة المالية بما يستبعد قيودًا مرتبطة بها." }); return;
    }
    const updated = await prisma.fiscalYear.update({
      where: { id },
      data: {
        startDate, endDate,
        ...(data.nameEn !== undefined ? { nameEn: data.nameEn } : {}),
        ...(data.nameAr !== undefined ? { nameAr: data.nameAr } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      },
    });
    await prisma.auditLog.create({ data: {
      userId: user.id, userEmail: user.email, action: "UPDATE", entityType: "fiscal_year", entityId: id,
      oldValues: { startDate: existing.startDate.toISOString(), endDate: existing.endDate.toISOString() },
      newValues: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      description: "Updated fiscal year definition",
    } });
    res.json(updated);
  } catch (error) {
    req.log?.error({ err: error }, "Fiscal year update failed");
    res.status(500).json({ error: "تعذر تعديل السنة المالية؛ لم تُحفظ أي تغييرات." });
  }
});

// ── POST /:id/close — create closing entries and mark fiscal year CLOSED ───────
router.post("/:id/close", requirePermission("fiscal_years", "update"), async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }
    if (!user.organizationId) { res.status(400).json({ error: "User has no organization" }); return; }

    const parsedClose = closeSchema.safeParse(req.body);
    if (!parsedClose.success) {
      res.status(400).json({
        error: parsedClose.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ") || "retainedEarningsAccountId is required",
        details: parsedClose.error.flatten(),
      });
      return;
    }
    const { retainedEarningsAccountId } = parsedClose.data;

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
      where: { organizationId: user.organizationId, fiscalYearId: fy.id, type: "CLOSING", deletedAt: null },
    });
    if (existingClosing) {
      res.status(400).json({ error: "Closing entries already exist for this fiscal year." });
      return;
    }

    // Includes draft reversals: never strand unfinished work in an immutable year.
    const pendingEntry = await prisma.journalEntry.findFirst({
      where: {
        organizationId: user.organizationId, fiscalYearId: fy.id, deletedAt: null,
        status: { in: ["DRAFT", "UNDER_REVIEW", "APPROVED"] },
      },
      select: { id: true, number: true },
    });
    if (pendingEntry) {
      res.status(400).json({ error: `لا يمكن إقفال السنة لوجود قيود غير مرحلة، منها ${pendingEntry.number}. استكمل اعتمادها وترحيلها أو احذف المسودات غير المطلوبة، بما فيها القيود العكسية.` });
      return;
    }
    const organization = await prisma.organization.findFirst({
      where: { id: user.organizationId, deletedAt: null },
      select: { baseCurrencyCode: true },
    });
    if (!organization) { res.status(400).json({ error: "المنظمة غير متاحة." }); return; }

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

    // ── 4. Aggregate recognized journal lines for REVENUE & EXPENSE accounts ─
    const postedLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: { organizationId: user.organizationId, fiscalYearId: fy.id, status: financialJournalStatusFilter(), deletedAt: null },
        account: { type: { in: ["REVENUE", "EXPENSE"] }, organizationId: user.organizationId },
      },
      include: {
        account: { select: { id: true, code: true, nameEn: true, nameAr: true, type: true, nature: true } },
      },
    });

    // ── 5. Group by account ────────────────────────────────────────────────────
    const accountMap = new Map<string, {
      accountId:   string;
      totalDebit:  Prisma.Decimal;
      totalCredit: Prisma.Decimal;
    }>();
    for (const line of postedLines) {
      const existing = accountMap.get(line.accountId);
      if (existing) {
        existing.totalDebit  = existing.totalDebit.plus(line.debitBase);
        existing.totalCredit = existing.totalCredit.plus(line.creditBase);
      } else {
        accountMap.set(line.accountId, {
          accountId:   line.accountId,
          totalDebit:  new Prisma.Decimal(line.debitBase.toString()),
          totalCredit: new Prisma.Decimal(line.creditBase.toString()),
        });
      }
    }

    // ── 6. Build closing entry lines (zero out each account's net position) ────
    const closingLines: { accountId: string; lineNumber: number; debit: Prisma.Decimal; credit: Prisma.Decimal }[] = [];
    let lineNumber = 1;
    let totalClosingDebits  = new Prisma.Decimal(0);
    let totalClosingCredits = new Prisma.Decimal(0);

    for (const acc of accountMap.values()) {
      const netDebit = acc.totalDebit.minus(acc.totalCredit).toDecimalPlaces(4);
      if (netDebit.isZero()) continue;
      if (netDebit.isPositive()) {
        // Net debit balance → close with a credit
        closingLines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: new Prisma.Decimal(0), credit: netDebit });
        totalClosingCredits = totalClosingCredits.plus(netDebit);
      } else {
        // Net credit balance → close with a debit
        closingLines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: netDebit.negated(), credit: new Prisma.Decimal(0) });
        totalClosingDebits = totalClosingDebits.minus(netDebit);
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
    const imbalance = totalClosingDebits.minus(totalClosingCredits).toDecimalPlaces(4);
    if (imbalance.isPositive()) {
      closingLines.push({ accountId: retainedEarningsAccountId, lineNumber: lineNumber++, debit: new Prisma.Decimal(0), credit: imbalance });
      totalClosingCredits = totalClosingCredits.plus(imbalance);
    } else if (imbalance.isNegative()) {
      closingLines.push({ accountId: retainedEarningsAccountId, lineNumber: lineNumber++, debit: imbalance.negated(), credit: new Prisma.Decimal(0) });
      totalClosingDebits = totalClosingDebits.minus(imbalance);
    }

    if (!totalClosingDebits.equals(totalClosingCredits)) {
      res.status(400).json({ error: "قيد الإقفال غير متوازن بدقة أربع منازل عشرية؛ لم تُحفظ أي تغييرات." });
      return;
    }

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
          currencyCode:    organization.baseCurrencyCode,
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
      netIncome:             imbalance.toNumber(),
      closedAt:              result.closedFY.closedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to close fiscal year" });
  }
});

// ── POST /:id/rollover — create next fiscal year with opening balances ────────
router.post("/:id/rollover", requirePermission("fiscal_years", "update"), async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }
    if (!user.organizationId) { res.status(400).json({ error: "User has no organization" }); return; }

    // ── 1. Resolve and guard the source fiscal year ────────────────────────────
    const sourceFY = await prisma.fiscalYear.findFirst({
      where: { id: req.params.id as string, organizationId: user.organizationId, deletedAt: null },
    });
    if (!sourceFY) { res.status(404).json({ error: "Fiscal year not found" }); return; }
    if (sourceFY.status !== "CLOSED") {
      res.status(400).json({ error: `Fiscal year must be CLOSED before it can be rolled over. Current status: ${sourceFY.status}.` });
      return;
    }
    const organization = await prisma.organization.findFirst({
      where: { id: user.organizationId, deletedAt: null },
      select: { baseCurrencyCode: true },
    });
    if (!organization) { res.status(400).json({ error: "المنظمة غير متاحة." }); return; }

    // ── 2. Prevent duplicate rollovers ──────────────────────────────────────────
    const existingNext = await prisma.fiscalYear.findFirst({
      where: { organizationId: user.organizationId, previousFiscalYearId: sourceFY.id, deletedAt: null },
    });
    if (existingNext) {
      res.status(400).json({ error: "This fiscal year has already been rolled over." });
      return;
    }

    // ── 3. Compute new fiscal year dates & names (auto-derived if not provided) ─
    const parsedRollover = rolloverSchema.safeParse(req.body ?? {});
    if (!parsedRollover.success) {
      res.status(400).json({ error: "Validation failed", details: parsedRollover.error.flatten() });
      return;
    }
    const { nameEn, nameAr, startDate, endDate } = parsedRollover.data;

    const newStartDate = startDate ? new Date(startDate) : (() => {
      const d = new Date(sourceFY.endDate);
      d.setDate(d.getDate() + 1);
      return d;
    })();
    const newEndDate = endDate ? new Date(endDate) : (() => {
      const d = new Date(newStartDate);
      d.setFullYear(d.getFullYear() + 1);
      d.setDate(d.getDate() - 1);
      return d;
    })();
    const newYearLabel = newStartDate.getFullYear();
    const newNameEn = nameEn || `FY ${newYearLabel}`;
    const newNameAr = nameAr || `السنة المالية ${newYearLabel}`;

    const windowError = await fiscalYearWindowError(prisma, user.organizationId, newStartDate, newEndDate);
    if (windowError) { res.status(400).json({ error: windowError }); return; }
    if (newStartDate <= sourceFY.endDate) {
      res.status(400).json({ error: "يجب أن تبدأ السنة الجديدة بعد نهاية السنة المالية المصدر." }); return;
    }
    const previousYear = await prisma.fiscalYear.findFirst({
      where: { organizationId: user.organizationId, deletedAt: null, endDate: { lt: newStartDate } },
      orderBy: { endDate: "desc" },
    });
    if (!previousYear || previousYear.id !== sourceFY.id) {
      res.status(400).json({ error: "يجب ترحيل الأرصدة من السنة المالية السابقة مباشرة ضمن المنظمة نفسها." }); return;
    }

    // Source-year balances already include its opening entry. Historical years
    // must not be added again when carrying that balance into the next year.
    const postedLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: user.organizationId,
          fiscalYearId: sourceFY.id,
          fiscalYear: { organizationId: user.organizationId },
          status:  financialJournalStatusFilter(),
          entryDate: { lte: sourceFY.endDate },
          deletedAt: null,
        },
        account: { type: { in: ["ASSET", "LIABILITY", "EQUITY"] }, organizationId: user.organizationId },
      },
      include: {
        account: { select: { id: true, code: true, nameEn: true, nameAr: true, type: true, nature: true } },
      },
    });

    // ── 6. Group by account ─────────────────────────────────────────────────────
    const accountMap = new Map<string, { accountId: string; totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal }>();
    for (const line of postedLines) {
      const existing = accountMap.get(line.accountId);
      if (existing) {
        existing.totalDebit  = existing.totalDebit.plus(line.debitBase);
        existing.totalCredit = existing.totalCredit.plus(line.creditBase);
      } else {
        accountMap.set(line.accountId, {
          accountId:   line.accountId,
          totalDebit:  new Prisma.Decimal(line.debitBase.toString()),
          totalCredit: new Prisma.Decimal(line.creditBase.toString()),
        });
      }
    }

    // ── 7. Build opening entry lines (carry forward each account's balance) ────
    const openingLines: { accountId: string; lineNumber: number; debit: Prisma.Decimal; credit: Prisma.Decimal }[] = [];
    let lineNumber = 1;
    let totalOpeningDebits  = new Prisma.Decimal(0);
    let totalOpeningCredits = new Prisma.Decimal(0);

    for (const acc of accountMap.values()) {
      const netDebit = acc.totalDebit.minus(acc.totalCredit).toDecimalPlaces(4);
      if (netDebit.isZero()) continue;
      if (netDebit.isPositive()) {
        openingLines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: netDebit, credit: new Prisma.Decimal(0) });
        totalOpeningDebits = totalOpeningDebits.plus(netDebit);
      } else {
        openingLines.push({ accountId: acc.accountId, lineNumber: lineNumber++, debit: new Prisma.Decimal(0), credit: netDebit.negated() });
        totalOpeningCredits = totalOpeningCredits.minus(netDebit);
      }
    }

    if (openingLines.length === 0) {
      res.status(400).json({ error: "No balance sheet account balances found to roll forward." });
      return;
    }
    if (!totalOpeningDebits.equals(totalOpeningCredits)) {
      res.status(400).json({ error: "الأرصدة الافتتاحية غير متوازنة؛ لم تُنشأ السنة الجديدة أو القيد الافتتاحي." });
      return;
    }

    // ── 8. Create new fiscal year + opening JE — all in one transaction ────────
    const result = await prisma.$transaction(async (tx) => {
      const newFY = await tx.fiscalYear.create({
        data: {
          organizationId:       user.organizationId!,
          nameEn:               newNameEn,
          nameAr:               newNameAr,
          startDate:            newStartDate,
          endDate:              newEndDate,
          status:               "OPEN",
          previousFiscalYearId: sourceFY.id,
          rolledOverAt:         new Date(),
        },
      });

      const number = await generateJournalNumberUtil(user.organizationId!, newStartDate.getFullYear(), tx as any);

      const openingEntry = await tx.journalEntry.create({
        data: {
          organizationId:  user.organizationId!,
          fiscalYearId:    newFY.id,
          number,
          entryDate:       newStartDate,
          type:            "OPENING",
          status:          "POSTED",
          currencyCode:    organization.baseCurrencyCode,
          exchangeRate:    1,
          totalDebit:      totalOpeningDebits,
          totalCredit:     totalOpeningCredits,
          descriptionEn:   `Opening balances rolled over from ${sourceFY.nameEn}`,
          descriptionAr:   `أرصدة افتتاحية مرحّلة من ${sourceFY.nameAr}`,
          postedAt:        new Date(),
          postedByUserId:  user.id,
          createdByUserId: user.id,
          lines: {
            create: openingLines.map((l) => ({
              accountId:    l.accountId,
              lineNumber:   l.lineNumber,
              debit:        l.debit,
              credit:       l.credit,
              debitBase:    l.debit,
              creditBase:   l.credit,
              descriptionEn: `Opening balance`,
              descriptionAr: `رصيد افتتاحي`,
            })),
          },
        },
      });

      return { newFY, openingEntry };
    });

    res.status(201).json({
      fiscalYearId:          result.newFY.id,
      previousFiscalYearId:  sourceFY.id,
      status:                "OPEN",
      openingJournalEntryId: result.openingEntry.id,
      startDate:             result.newFY.startDate,
      endDate:               result.newFY.endDate,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to roll over fiscal year" });
  }
});

export default router;
