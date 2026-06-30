import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import {
  formatJENumber,
  createHeaderSchema as createSchema,
  updateHeaderSchema as updateSchema,
} from "../lib/journal-entry-utils";

const router = Router();

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

async function writeAuditLog(params: {
  userId?: string;
  userEmail?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT" | "VOID" | "POST" | "EXPORT";
  entityType: string;
  entityId?: string;
  oldValues?: object;
  newValues?: object;
  description?: string;
}) {
  try {
    await (prisma.auditLog as any).create({ data: params });
  } catch {}
}

async function writeApprovalRecord(params: {
  journalEntryId: string;
  userId: string;
  action: string;
  comment?: string;
  fromStatus: string;
  toStatus: string;
}) {
  try {
    await prisma.journalEntryApproval.create({ data: params });
  } catch {}
}

async function generateJournalNumber(orgId: string, year: number): Promise<string> {
  const prefix = `JE-${year}-`;
  const existing = await prisma.journalEntry.findMany({
    where: { organizationId: orgId, number: { startsWith: prefix } },
    select: { number: true },
  });
  let maxNum = 0;
  for (const je of existing) {
    const numStr = je.number.replace(prefix, "");
    const num = parseInt(numStr, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return formatJENumber(year, maxNum + 1);
}

function validateBalance(lines: { debit: number | string; credit: number | string }[]) {
  const totalDebit = lines.reduce((s, l) => s + parseFloat(String(l.debit || 0)), 0);
  const totalCredit = lines.reduce((s, l) => s + parseFloat(String(l.credit || 0)), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  return { totalDebit, totalCredit, balanced };
}

async function validateAccounts(lines: { accountId: string }[], orgId: string) {
  const errors: string[] = [];
  for (const line of lines) {
    const account = await prisma.chartOfAccount.findFirst({
      where: { id: line.accountId, organizationId: orgId, deletedAt: null },
    });
    if (!account) { errors.push(`Account ${line.accountId} not found`); continue; }
    if (!account.isActive) errors.push(`Account ${account.code} (${account.nameEn}) is not active`);
    if (account.isGroup) errors.push(`Account ${account.code} (${account.nameEn}) is a group account — posting not allowed`);
    if (!account.allowDirectEntry) errors.push(`Account ${account.code} (${account.nameEn}) does not allow direct entries`);
  }
  return errors;
}


// ── LIST ────────────────────────────────────────────────────────────────────
router.get("/", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { search, status, type, organizationId, fiscalYearId, startDate, endDate, page = "1", pageSize = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize as string, 10)));
    const orgId = (organizationId as string) || user.organizationId || undefined;

    const where: any = {
      deletedAt: null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...(status && status !== "ALL" ? { status } : {}),
      ...(type ? { type } : {}),
      ...(fiscalYearId ? { fiscalYearId } : {}),
    };

    if (startDate || endDate) {
      where.entryDate = {
        ...(startDate ? { gte: new Date(startDate as string) } : {}),
        ...(endDate ? { lte: new Date(endDate as string) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { number: { contains: search as string, mode: "insensitive" } },
        { descriptionEn: { contains: search as string, mode: "insensitive" } },
        { descriptionAr: { contains: search as string, mode: "insensitive" } },
        { reference: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [total, entries] = await Promise.all([
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } },
          fiscalYear: { select: { id: true, nameEn: true, nameAr: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { entryDate: "desc" },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
    ]);

    res.json({
      data: entries,
      meta: { page: pageNum, pageSize: pageSizeNum, total, totalPages: Math.ceil(total / pageSizeNum) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch journal entries" });
  }
});

// ── GET ONE ─────────────────────────────────────────────────────────────────
router.get("/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        createdBy:   { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } },
        submittedBy: { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } },
        approvedBy:  { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } },
        postedBy:    { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } },
        voidedBy:    { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } },
        fiscalYear:  { select: { id: true, nameEn: true, nameAr: true, startDate: true, endDate: true, status: true } },
        lines: {
          orderBy: { lineNumber: "asc" },
          include: {
            account:    { select: { id: true, code: true, nameEn: true, nameAr: true, type: true, nature: true } },
            costCenter: { select: { id: true, code: true, nameEn: true, nameAr: true } },
          },
        },
        approvals: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } } },
        },
        reversalOf: { select: { id: true, number: true, entryDate: true } },
        reversals:  { select: { id: true, number: true, entryDate: true } },
      },
    });

    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    res.json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch journal entry" });
  }
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post("/", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });

    const data = parsed.data;
    const orgId = data.organizationId || user.organizationId;
    if (!orgId) return res.status(400).json({ error: "organizationId is required" });

    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: data.fiscalYearId, organizationId: orgId, deletedAt: null },
    });
    if (!fiscalYear) return res.status(400).json({ error: "Fiscal year not found" });
    if (fiscalYear.status !== "OPEN") return res.status(400).json({ error: "Fiscal year is not open" });

    // TODO: Sprint 2.2 — remove this guard and enforce min 2 lines, balance,
    // and account eligibility unconditionally on every create.
    const lines = data.lines ?? [];
    let totalDebit = 0;
    let totalCredit = 0;
    if (lines.length > 0) {
      const { totalDebit: dr, totalCredit: cr, balanced } = validateBalance(lines);
      totalDebit = dr;
      totalCredit = cr;
      if (!balanced) return res.status(400).json({ error: `Entry is not balanced — Debit: ${totalDebit.toFixed(4)}, Credit: ${totalCredit.toFixed(4)}` });
      const accountErrors = await validateAccounts(lines, orgId);
      if (accountErrors.length > 0) return res.status(400).json({ error: accountErrors.join("; ") });
    }

    const entryYear = new Date(data.entryDate).getFullYear();
    const number = await generateJournalNumber(orgId, entryYear);
    const exchangeRate = data.exchangeRate || 1;

    const entry = await prisma.journalEntry.create({
      data: {
        organizationId:  orgId,
        fiscalYearId:    data.fiscalYearId,
        number,
        entryDate:       new Date(data.entryDate),
        type:            data.type,
        status:          "DRAFT",
        currencyCode:    data.currencyCode,
        exchangeRate,
        totalDebit,
        totalCredit,
        descriptionEn:   data.descriptionEn || null,
        descriptionAr:   data.descriptionAr || null,
        reference:       data.reference || null,
        createdByUserId: user.id,
        ...(lines.length > 0 ? {
          lines: {
            create: lines.map(l => ({
              accountId:     l.accountId,
              costCenterId:  l.costCenterId || null,
              lineNumber:    l.lineNumber,
              descriptionEn: l.descriptionEn || null,
              descriptionAr: l.descriptionAr || null,
              debit:         l.debit,
              credit:        l.credit,
              debitBase:     l.debit * exchangeRate,
              creditBase:    l.credit * exchangeRate,
              reference:     l.reference || null,
            })),
          },
        } : {}),
      },
      include: { lines: true },
    });

    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "CREATE", entityType: "journal_entry", entityId: entry.id, newValues: { number, status: "DRAFT" }, description: `Created journal entry ${number}` });

    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
router.patch("/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await prisma.journalEntry.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: "Journal entry not found" });
    if (!["DRAFT", "UNDER_REVIEW"].includes(existing.status)) {
      return res.status(400).json({ error: `Cannot edit a ${existing.status} journal entry` });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    const data = parsed.data;

    let newTotals: { totalDebit: number; totalCredit: number } | undefined;

    if (data.lines) {
      const { totalDebit, totalCredit, balanced } = validateBalance(data.lines);
      if (!balanced) return res.status(400).json({ error: `Entry is not balanced — Dr: ${totalDebit.toFixed(4)}, Cr: ${totalCredit.toFixed(4)}` });
      const accountErrors = await validateAccounts(data.lines, existing.organizationId);
      if (accountErrors.length > 0) return res.status(400).json({ error: accountErrors.join("; ") });
      const exchangeRate = data.exchangeRate || parseFloat(existing.exchangeRate.toString()) || 1;

      await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: req.params.id } });
      await prisma.journalEntryLine.createMany({
        data: data.lines.map(l => ({
          journalEntryId: req.params.id,
          accountId:      l.accountId,
          costCenterId:   l.costCenterId || null,
          lineNumber:     l.lineNumber,
          descriptionEn:  l.descriptionEn || null,
          descriptionAr:  l.descriptionAr || null,
          debit:          l.debit,
          credit:         l.credit,
          debitBase:      l.debit * exchangeRate,
          creditBase:     l.credit * exchangeRate,
          reference:      l.reference || null,
        })),
      });
      newTotals = { totalDebit, totalCredit };
    }

    const updated = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: {
        ...(data.fiscalYearId ? { fiscalYearId: data.fiscalYearId } : {}),
        ...(data.entryDate ? { entryDate: new Date(data.entryDate) } : {}),
        ...(data.type ? { type: data.type } : {}),
        ...(data.currencyCode ? { currencyCode: data.currencyCode } : {}),
        ...(data.exchangeRate ? { exchangeRate: data.exchangeRate } : {}),
        ...(data.descriptionEn !== undefined ? { descriptionEn: data.descriptionEn } : {}),
        ...(data.descriptionAr !== undefined ? { descriptionAr: data.descriptionAr } : {}),
        ...(data.reference !== undefined ? { reference: data.reference } : {}),
        ...(newTotals ? { totalDebit: newTotals.totalDebit, totalCredit: newTotals.totalCredit } : {}),
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });

    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "UPDATE", entityType: "journal_entry", entityId: req.params.id, description: `Updated journal entry ${existing.number}` });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update journal entry" });
  }
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "DRAFT") return res.status(400).json({ error: "Only DRAFT journal entries can be deleted" });

    await prisma.journalEntry.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "DELETE", entityType: "journal_entry", entityId: req.params.id, description: `Deleted draft ${entry.number}` });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete journal entry" });
  }
});

// ── SUBMIT (DRAFT → UNDER_REVIEW) ──────────────────────────────────────────
router.post("/:id/submit", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { lines: true },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "DRAFT") return res.status(400).json({ error: `Cannot submit a ${entry.status} entry` });
    if (entry.lines.length < 2) return res.status(400).json({ error: "At least 2 lines required" });

    const { balanced } = validateBalance(entry.lines.map(l => ({ debit: l.debit, credit: l.credit })));
    if (!balanced) return res.status(400).json({ error: "Entry is not balanced" });

    const updated = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "UNDER_REVIEW", submittedAt: new Date(), submittedByUserId: user.id },
    });
    await writeApprovalRecord({ journalEntryId: req.params.id, userId: user.id, action: "SUBMIT", comment: req.body.comment, fromStatus: "DRAFT", toStatus: "UNDER_REVIEW" });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit journal entry" });
  }
});

// ── APPROVE (UNDER_REVIEW → APPROVED) ────────────────────────────────────
router.post("/:id/approve", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "UNDER_REVIEW") return res.status(400).json({ error: `Cannot approve a ${entry.status} entry` });

    const updated = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: user.id },
    });
    await writeApprovalRecord({ journalEntryId: req.params.id, userId: user.id, action: "APPROVE", comment: req.body.comment, fromStatus: "UNDER_REVIEW", toStatus: "APPROVED" });
    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "APPROVE", entityType: "journal_entry", entityId: req.params.id, description: `Approved ${entry.number}` });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve journal entry" });
  }
});

// ── REJECT (UNDER_REVIEW|APPROVED → DRAFT) ───────────────────────────────
router.post("/:id/reject", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (!["UNDER_REVIEW", "APPROVED"].includes(entry.status)) return res.status(400).json({ error: `Cannot reject a ${entry.status} entry` });

    const fromStatus = entry.status;
    const updated = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "DRAFT", submittedAt: null, submittedByUserId: null, approvedAt: null, approvedByUserId: null },
    });
    await writeApprovalRecord({ journalEntryId: req.params.id, userId: user.id, action: "REJECT", comment: req.body.comment, fromStatus, toStatus: "DRAFT" });
    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "REJECT", entityType: "journal_entry", entityId: req.params.id, description: `Rejected ${entry.number}: ${req.body.comment || ""}` });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reject journal entry" });
  }
});

// ── POST (APPROVED → POSTED) ──────────────────────────────────────────────
router.post("/:id/post", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        lines: { include: { account: true } },
        fiscalYear: true,
      },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "APPROVED") return res.status(400).json({ error: `Cannot post a ${entry.status} entry — must be APPROVED first` });
    if (entry.lines.length < 2) return res.status(400).json({ error: "At least 2 lines required" });

    const { balanced } = validateBalance(entry.lines.map(l => ({ debit: l.debit, credit: l.credit })));
    if (!balanced) return res.status(400).json({ error: "Entry is not balanced" });
    if ((entry.fiscalYear as any).status !== "OPEN") return res.status(400).json({ error: "Fiscal year is no longer open" });

    for (const line of entry.lines) {
      if (!line.account.isActive) return res.status(400).json({ error: `Account ${line.account.code} is no longer active` });
      if (line.account.isGroup) return res.status(400).json({ error: `Account ${line.account.code} is a group account` });
    }

    const updated = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "POSTED", postedAt: new Date(), postedByUserId: user.id },
    });
    await writeApprovalRecord({ journalEntryId: req.params.id, userId: user.id, action: "POST", fromStatus: "APPROVED", toStatus: "POSTED" });
    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "POST", entityType: "journal_entry", entityId: req.params.id, description: `Posted ${entry.number}` });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to post journal entry" });
  }
});

// ── LOCK (POSTED → LOCKED) ────────────────────────────────────────────────
router.post("/:id/lock", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "POSTED") return res.status(400).json({ error: "Only POSTED entries can be locked" });

    const updated = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "LOCKED" },
    });
    await writeApprovalRecord({ journalEntryId: req.params.id, userId: user.id, action: "LOCK", fromStatus: "POSTED", toStatus: "LOCKED" });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to lock journal entry" });
  }
});

// ── REVERSE (create reversal + mark REVERSED) ────────────────────────────
router.post("/:id/reverse", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { lines: true },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (!["POSTED", "LOCKED"].includes(entry.status)) return res.status(400).json({ error: "Only POSTED or LOCKED entries can be reversed" });
    if (entry.reversedByEntryId) return res.status(400).json({ error: "This entry has already been reversed" });

    const { reverseDate, reason } = req.body;
    const reversalDate = reverseDate ? new Date(reverseDate) : new Date();
    const entryYear = reversalDate.getFullYear();
    const reversalNumber = await generateJournalNumber(entry.organizationId, entryYear);
    const exchangeRate = parseFloat(entry.exchangeRate.toString());

    const reversal = await prisma.journalEntry.create({
      data: {
        organizationId:   entry.organizationId,
        fiscalYearId:     entry.fiscalYearId,
        number:           reversalNumber,
        entryDate:        reversalDate,
        type:             "ADJUSTMENT",
        status:           "DRAFT",
        currencyCode:     entry.currencyCode,
        exchangeRate:     entry.exchangeRate,
        totalDebit:       entry.totalCredit,
        totalCredit:      entry.totalDebit,
        descriptionEn:    `Reversal of ${entry.number}${reason ? `: ${reason}` : ""}`,
        descriptionAr:    `عكس قيد ${entry.number}${reason ? `: ${reason}` : ""}`,
        reference:        entry.number,
        createdByUserId:  user.id,
        isReversal:       true,
        reversalOfEntryId: entry.id,
        lines: {
          create: entry.lines.map(l => ({
            accountId:    l.accountId,
            costCenterId: l.costCenterId,
            lineNumber:   l.lineNumber,
            descriptionEn: l.descriptionEn,
            descriptionAr: l.descriptionAr,
            debit:        l.credit,
            credit:       l.debit,
            debitBase:    parseFloat(l.credit.toString()) * exchangeRate,
            creditBase:   parseFloat(l.debit.toString()) * exchangeRate,
            reference:    l.reference,
          })),
        },
      },
    });

    await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "REVERSED", reversedByEntryId: reversal.id },
    });

    await writeApprovalRecord({ journalEntryId: req.params.id, userId: user.id, action: "REVERSE", comment: reason, fromStatus: entry.status, toStatus: "REVERSED" });
    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "VOID", entityType: "journal_entry", entityId: req.params.id, description: `Reversed ${entry.number} → ${reversalNumber}` });

    res.json(reversal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reverse journal entry" });
  }
});

// ── COPY ─────────────────────────────────────────────────────────────────
router.post("/:id/copy", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { lines: true },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });

    const copyDate = req.body.entryDate ? new Date(req.body.entryDate) : new Date();
    const number = await generateJournalNumber(entry.organizationId, copyDate.getFullYear());
    const exchangeRate = parseFloat(entry.exchangeRate.toString());

    const copy = await prisma.journalEntry.create({
      data: {
        organizationId:  entry.organizationId,
        fiscalYearId:    entry.fiscalYearId,
        number,
        entryDate:       copyDate,
        type:            entry.type,
        status:          "DRAFT",
        currencyCode:    entry.currencyCode,
        exchangeRate:    entry.exchangeRate,
        totalDebit:      entry.totalDebit,
        totalCredit:     entry.totalCredit,
        descriptionEn:   entry.descriptionEn ? `Copy of ${entry.descriptionEn}` : `Copy of ${entry.number}`,
        descriptionAr:   entry.descriptionAr ? `نسخة من ${entry.descriptionAr}` : `نسخة من ${entry.number}`,
        reference:       entry.reference,
        createdByUserId: user.id,
        lines: {
          create: entry.lines.map(l => ({
            accountId:    l.accountId,
            costCenterId: l.costCenterId,
            lineNumber:   l.lineNumber,
            descriptionEn: l.descriptionEn,
            descriptionAr: l.descriptionAr,
            debit:        l.debit,
            credit:       l.credit,
            debitBase:    parseFloat(l.debit.toString()) * exchangeRate,
            creditBase:   parseFloat(l.credit.toString()) * exchangeRate,
            reference:    l.reference,
          })),
        },
      },
    });

    res.json(copy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to copy journal entry" });
  }
});

// ── VOID (POSTED → VOIDED with reason) ──────────────────────────────────
router.post("/:id/void", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "POSTED") return res.status(400).json({ error: "Only POSTED entries can be voided" });

    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: "Void reason is required" });

    const updated = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidedByUserId: user.id, voidReason: reason },
    });
    await writeApprovalRecord({ journalEntryId: req.params.id, userId: user.id, action: "VOID", comment: reason, fromStatus: "POSTED", toStatus: "VOIDED" });
    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "VOID", entityType: "journal_entry", entityId: req.params.id, description: `Voided ${entry.number}: ${reason}` });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to void journal entry" });
  }
});

export default router;
