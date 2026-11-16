import { getAuth } from "@clerk/express";
import { prisma as basePrisma } from "@workspace/prisma";
import { afterAccountingCommit, createAccountingRouter, inAccountingTransaction } from "../lib/accounting-transaction";
import { computeIntegrityHash } from "../services/integrity-hash";
import {
  formatJENumber,
  generateJournalNumber as generateJournalNumberUtil,
  createHeaderSchema as createSchema,
  updateHeaderSchema as updateSchema,
  validateBalance,
  validateAccounts,
  computeDuration,
  rejectCommentSchema,
} from "../lib/journal-entry-utils";
import attachmentsRouter from "./journal-entry-attachments";
import { notificationService } from "../services/notification";
import { requirePermission } from "../lib/authorize";
import { routeParam } from "../lib/route-param";

const { router, prisma } = createAccountingRouter("journals", basePrisma);

// Fail closed for every journal route, including attachments. Never infer a
// financial organization from a body/query parameter or an empty user scope.
router.use(async (req, res, next): Promise<void> => {
  try {
    const user = await getUser(getAuth(req).userId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }
    if (!user.organizationId) { res.status(400).json({ error: "User has no organization" }); return; }
    next();
  } catch {
    res.status(500).json({ error: "Failed to resolve organization" });
  }
});

router.use("/:id/attachments", attachmentsRouter);

// Also exclude legacy inconsistent links; ownership of the entry alone is
// insufficient when a fiscal year or one of its accounts belongs elsewhere.
function journalOrganizationScope(organizationId: string | null) {
  const orgId = organizationId ?? "";
  return {
    organizationId: orgId,
    fiscalYear: { organizationId: orgId },
    lines: { every: { account: { organizationId: orgId } } },
  };
}

async function getUser(clerkId: string | null | undefined) {
  if (!clerkId) return null;
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
  } catch (error) {
    if (inAccountingTransaction()) throw error;
  }
}

async function writeApprovalRecord(params: {
  journalEntryId: string;
  userId: string;
  action: string;
  comment?: string;
  fromStatus: string;
  toStatus: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    const now = new Date();
    const last = await prisma.journalEntryApproval.findFirst({
      where: { journalEntryId: params.journalEntryId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const durationSeconds = computeDuration(last?.createdAt ?? null, now);
    await prisma.journalEntryApproval.create({
      data: {
        journalEntryId:  params.journalEntryId,
        userId:          params.userId,
        action:          params.action,
        comment:         params.comment,
        fromStatus:      params.fromStatus,
        toStatus:        params.toStatus,
        durationSeconds,
        ipAddress:       params.ipAddress,
        userAgent:       params.userAgent,
      },
    });
  } catch (error) {
    if (inAccountingTransaction()) throw error;
  }
}

async function generateJournalNumber(orgId: string, year: number): Promise<string> {
  return generateJournalNumberUtil(orgId, year, prisma);
}

// ── Notification helpers ───────────────────────────────────────────────────────

async function getOrgUserIds(orgId: string): Promise<string[]> {
  const users = await (prisma.user as any).findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  return users.map((u: { id: string }) => u.id);
}

async function emitNotification(params: {
  organizationId: string;
  event: string;
  entityId: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
}): Promise<void> {
  if (afterAccountingCommit(() => emitNotification(params))) return;
  try {
    const userIds = await getOrgUserIds(params.organizationId);
    await notificationService.emit({ ...params, entityType: "JournalEntry", userIds });
  } catch (err) {
    console.error("Notification emit failed:", err);
  }
}

// ── LIST ──────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { search, status, type, fiscalYearId, page = "1", pageSize = "20" } = req.query as Record<string, string>;
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const pageSz   = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const skip     = (pageNum - 1) * pageSz;

    const where: Record<string, unknown> = {
      ...journalOrganizationScope(user.organizationId),
      deletedAt: null,
    };

    if (status)      where.status      = status;
    if (type)        where.type        = type;
    if (fiscalYearId) where.fiscalYearId = fiscalYearId;
    if (search) {
      where.OR = [
        { number:      { contains: search, mode: "insensitive" } },
        { descriptionEn: { contains: search, mode: "insensitive" } },
        { descriptionAr: { contains: search, mode: "insensitive" } },
        { reference:   { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        skip,
        take: pageSz,
        orderBy: [{ entryDate: "desc" }, { number: "desc" }],
        include: {
          createdBy:  { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } },
          fiscalYear: { select: { id: true, nameEn: true, nameAr: true, status: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.journalEntry.count({ where }),
    ]);

    res.json({
      data,
      total,
      page:     pageNum,
      pageSize: pageSz,
      pageCount: Math.ceil(total / pageSz),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch journal entries" });
  }
  return undefined;
});

// ── GET ONE ─────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null },
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
  return undefined;
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post("/", requirePermission("journal_entries", "create"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });

    const data = parsed.data;
    const orgId = user.organizationId;
    if (!orgId) return res.status(400).json({ error: "organizationId is required" });

    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: data.fiscalYearId, organizationId: orgId, deletedAt: null },
    });
    if (!fiscalYear) return res.status(400).json({ error: "Fiscal year not found" });
    if (fiscalYear.status !== "OPEN") return res.status(400).json({ error: "Fiscal year is not open" });

    const lines = data.lines;
    const { totalDebit, totalCredit, balanced } = validateBalance(lines);
    if (!balanced) {
      return res.status(400).json({
        error: `Entry is not balanced — Debit: ${totalDebit.toFixed(4)}, Credit: ${totalCredit.toFixed(4)}`,
      });
    }
    const accountErrors = await validateAccounts(lines, orgId, prisma);
    if (accountErrors.length > 0) return res.status(400).json({ error: accountErrors.join("; ") });

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
        lines: {
          create: lines.map((l) => ({
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
      },
      include: { lines: true },
    });

    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "CREATE",
      entityType: "journal_entry",
      entityId:   entry.id,
      newValues:  { number, status: "DRAFT", lineCount: lines.length },
      description: `Created journal entry ${number} with ${lines.length} lines`,
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create journal entry" });
  }
  return undefined;
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
router.patch("/:id", requirePermission("journal_entries", "update"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await prisma.journalEntry.findFirst({ where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null } });
    if (!existing) return res.status(404).json({ error: "Journal entry not found" });
    if (!["DRAFT", "UNDER_REVIEW"].includes(existing.status)) {
      return res.status(400).json({ error: `Cannot edit a ${existing.status} journal entry` });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    const data = parsed.data;

    if (data.fiscalYearId) {
      const fiscalYear = await prisma.fiscalYear.findFirst({
        where: { id: data.fiscalYearId, organizationId: user.organizationId!, deletedAt: null },
      });
      if (!fiscalYear) return res.status(400).json({ error: "Fiscal year not found" });
    }

    let newTotals: { totalDebit: number; totalCredit: number } | undefined;

    if (data.lines) {
      if (data.lines.length < 2) {
        return res.status(400).json({ error: "At least 2 lines required" });
      }

      const { totalDebit, totalCredit, balanced } = validateBalance(data.lines);
      if (!balanced) {
        return res.status(400).json({
          error: `Entry is not balanced — Dr: ${totalDebit.toFixed(4)}, Cr: ${totalCredit.toFixed(4)}`,
        });
      }
      const accountErrors = await validateAccounts(data.lines, existing.organizationId, prisma);
      if (accountErrors.length > 0) return res.status(400).json({ error: accountErrors.join("; ") });

      const exchangeRate = data.exchangeRate || parseFloat(existing.exchangeRate.toString()) || 1;

      // Atomic replace: delete all existing lines then create the new set in one transaction.
      await prisma.$transaction(async (tx) => {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: routeParam(req.params.id) } });
        await tx.journalEntryLine.createMany({
          data: data.lines!.map((l) => ({
            journalEntryId: routeParam(req.params.id),
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
      });

      newTotals = { totalDebit, totalCredit };
    }

    const updated = await prisma.journalEntry.update({
      where: { id: routeParam(req.params.id) },
      data: {
        ...(data.fiscalYearId  ? { fiscalYearId: data.fiscalYearId }     : {}),
        ...(data.entryDate     ? { entryDate:    new Date(data.entryDate) } : {}),
        ...(data.type          ? { type:         data.type }               : {}),
        ...(data.currencyCode  ? { currencyCode: data.currencyCode }       : {}),
        ...(data.exchangeRate  ? { exchangeRate: data.exchangeRate }       : {}),
        ...(data.descriptionEn !== undefined ? { descriptionEn: data.descriptionEn } : {}),
        ...(data.descriptionAr !== undefined ? { descriptionAr: data.descriptionAr } : {}),
        ...(data.reference     !== undefined ? { reference:     data.reference }     : {}),
        ...(newTotals ? { totalDebit: newTotals.totalDebit, totalCredit: newTotals.totalCredit } : {}),
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });

    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "UPDATE",
      entityType: "journal_entry",
      entityId:   routeParam(req.params.id),
      description: `Updated journal entry ${existing.number}`,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update journal entry" });
  }
  return undefined;
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete("/:id", requirePermission("journal_entries", "delete"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "DRAFT") return res.status(400).json({ error: "Only DRAFT journal entries can be deleted" });

    await prisma.journalEntry.update({ where: { id: routeParam(req.params.id) }, data: { deletedAt: new Date() } });
    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "DELETE",
      entityType: "journal_entry",
      entityId:   routeParam(req.params.id),
      description: `Deleted draft ${entry.number}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete journal entry" });
  }
  return undefined;
});

// ── SUBMIT (DRAFT → UNDER_REVIEW) ──────────────────────────────────────────
router.post("/:id/submit", requirePermission("journal_entries", "update"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null },
      include: { lines: true },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "DRAFT") return res.status(400).json({ error: `Cannot submit a ${entry.status} entry` });
    if (entry.lines.length < 2) return res.status(400).json({ error: "At least 2 lines required" });

    const { balanced } = validateBalance(entry.lines.map((l) => ({
      debit: Number(l.debit),
      credit: Number(l.credit),
    })));
    if (!balanced) return res.status(400).json({ error: "Entry is not balanced" });

    const updated = await prisma.journalEntry.update({
      where: { id: routeParam(req.params.id) },
      data: { status: "UNDER_REVIEW", submittedAt: new Date(), submittedByUserId: user.id },
    });
    await writeApprovalRecord({
      journalEntryId: routeParam(req.params.id),
      userId: user.id,
      action: "SUBMIT",
      comment: req.body?.comment,
      fromStatus: "DRAFT",
      toStatus: "UNDER_REVIEW",
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "APPROVE",
      entityType: "journal_entry",
      entityId:   routeParam(req.params.id),
      description: `Submitted ${entry.number} for review`,
    });

    await emitNotification({
      organizationId: entry.organizationId,
      event:          "journal_entry.submitted",
      entityId:       entry.id,
      titleEn:        "Entry submitted for review",
      titleAr:        "تم تقديم القيد للمراجعة",
      bodyEn:         `${entry.number} has been submitted for review.`,
      bodyAr:         `تم تقديم القيد ${entry.number} للمراجعة.`,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit journal entry" });
  }
  return undefined;
});

// ── APPROVE (UNDER_REVIEW → APPROVED) ────────────────────────────────────
router.post("/:id/approve", requirePermission("journal_entries", "approve"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "UNDER_REVIEW") return res.status(400).json({ error: `Cannot approve a ${entry.status} entry` });

    const updated = await prisma.journalEntry.update({
      where: { id: routeParam(req.params.id) },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: user.id },
    });
    await writeApprovalRecord({
      journalEntryId: routeParam(req.params.id),
      userId: user.id,
      action: "APPROVE",
      comment: req.body?.comment,
      fromStatus: "UNDER_REVIEW",
      toStatus: "APPROVED",
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "APPROVE",
      entityType: "journal_entry",
      entityId:   routeParam(req.params.id),
      description: `Approved ${entry.number}`,
    });

    await emitNotification({
      organizationId: entry.organizationId,
      event:          "journal_entry.approved",
      entityId:       entry.id,
      titleEn:        "Entry approved",
      titleAr:        "تمت الموافقة على القيد",
      bodyEn:         `${entry.number} has been approved.`,
      bodyAr:         `تمت الموافقة على القيد ${entry.number}.`,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve journal entry" });
  }
  return undefined;
});

// ── REJECT (UNDER_REVIEW|APPROVED → DRAFT) ───────────────────────────────
router.post("/:id/reject", requirePermission("journal_entries", "approve"), async (req, res) => {
  try {
    const bodyParse = rejectCommentSchema.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ error: bodyParse.error.issues[0].message });
    }
    const { comment: rejectComment } = bodyParse.data;

    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (!["UNDER_REVIEW", "APPROVED"].includes(entry.status)) {
      return res.status(400).json({ error: `Cannot reject a ${entry.status} entry` });
    }

    const fromStatus = entry.status;
    const updated = await prisma.journalEntry.update({
      where: { id: routeParam(req.params.id) },
      data: {
        status: "DRAFT",
        submittedAt: null,
        submittedByUserId: null,
        approvedAt: null,
        approvedByUserId: null,
      },
    });
    await writeApprovalRecord({
      journalEntryId: routeParam(req.params.id),
      userId: user.id,
      action: "REJECT",
      comment: rejectComment,
      fromStatus,
      toStatus: "DRAFT",
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "REJECT",
      entityType: "journal_entry",
      entityId:   routeParam(req.params.id),
      description: `Rejected ${entry.number}: ${rejectComment}`,
    });

    await emitNotification({
      organizationId: entry.organizationId,
      event:          "journal_entry.rejected",
      entityId:       entry.id,
      titleEn:        "Entry rejected",
      titleAr:        "تم رفض القيد",
      bodyEn:         `${entry.number} has been rejected: ${rejectComment}`,
      bodyAr:         `تم رفض القيد ${entry.number}: ${rejectComment}`,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reject journal entry" });
  }
  return undefined;
});

// ── POST (APPROVED → POSTED) ──────────────────────────────────────────────
router.post("/:id/post", requirePermission("journal_entries", "approve"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null },
      include: {
        lines: { include: { account: true } },
        fiscalYear: true,
      },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "APPROVED") {
      return res.status(400).json({ error: `Cannot post a ${entry.status} entry — must be APPROVED first` });
    }
    if (entry.lines.length < 2) return res.status(400).json({ error: "At least 2 lines required" });

    const { balanced } = validateBalance(entry.lines.map((l) => ({
      debit: Number(l.debit),
      credit: Number(l.credit),
    })));
    if (!balanced) return res.status(400).json({ error: "Entry is not balanced" });
    if (entry.fiscalYear.status !== "OPEN") {
      return res.status(400).json({ error: "Fiscal year is no longer open" });
    }

    for (const line of entry.lines) {
      if (!line.account.isActive) {
        return res.status(400).json({ error: `Account ${line.account.code} is no longer active` });
      }
      if (line.account.isGroup) {
        return res.status(400).json({ error: `Account ${line.account.code} is a group account` });
      }
    }

    const postedAt = new Date();
    const hash = computeIntegrityHash(
      {
        id:             entry.id,
        number:         entry.number,
        organizationId: entry.organizationId,
        fiscalYearId:   entry.fiscalYearId,
        entryDate:      entry.entryDate,
        type:           entry.type,
        currencyCode:   entry.currencyCode,
        exchangeRate:   entry.exchangeRate,
        totalDebit:     entry.totalDebit,
        totalCredit:    entry.totalCredit,
        postedAt,
        postedByUserId: user.id,
      },
      entry.lines,
    );

    const updated = await prisma.journalEntry.update({
      where: { id: routeParam(req.params.id) },
      data: {
        status:         "POSTED",
        postedAt,
        postedByUserId: user.id,
        integrityHash:  hash,
        hashAlgorithm:  "SHA-256",
        hashedAt:       postedAt,
      },
    });
    await writeApprovalRecord({
      journalEntryId: routeParam(req.params.id),
      userId: user.id,
      action: "POST",
      fromStatus: "APPROVED",
      toStatus: "POSTED",
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "POST",
      entityType: "journal_entry",
      entityId:   routeParam(req.params.id),
      description: `Posted ${entry.number}`,
    });

    await emitNotification({
      organizationId: entry.organizationId,
      event:          "journal_entry.posted",
      entityId:       entry.id,
      titleEn:        "Entry posted",
      titleAr:        "تم ترحيل القيد",
      bodyEn:         `${entry.number} has been posted to the general ledger.`,
      bodyAr:         `تم ترحيل القيد ${entry.number} إلى دفتر الأستاذ.`,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to post journal entry" });
  }
  return undefined;
});

// Retired action: keep authentication/RBAC and reject old clients without writes.
router.post("/:id/lock", requirePermission("journal_entries", "approve"), (_req, res) => {
  res.status(410).json({ error: "تم إيقاف قفل القيود. القيود المقفلة سابقًا محفوظة وتحتسب ماليًا." });
});

// ── REVERSE (create reversal + mark REVERSED) ────────────────────────────
router.post("/:id/reverse", requirePermission("journal_entries", "void"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null },
      include: { lines: true },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (!["POSTED", "LOCKED"].includes(entry.status)) {
      return res.status(400).json({ error: "Only POSTED or LOCKED entries can be reversed" });
    }
    if (entry.reversedByEntryId) {
      return res.status(400).json({ error: "This entry has already been reversed" });
    }

    const { reverseDate, reason } = req.body;
    const reversalDate = reverseDate ? new Date(reverseDate) : new Date();
    const entryYear = reversalDate.getFullYear();
    const reversalNumber = await generateJournalNumber(entry.organizationId, entryYear);
    const exchangeRate = parseFloat(entry.exchangeRate.toString());

    const reversal = await prisma.$transaction(async (tx) => {
      const createdReversal = await tx.journalEntry.create({
        data: {
          organizationId:    entry.organizationId,
          fiscalYearId:      entry.fiscalYearId,
          number:            reversalNumber,
          entryDate:         reversalDate,
          type:              "ADJUSTMENT",
          status:            "DRAFT",
          currencyCode:      entry.currencyCode,
          exchangeRate:      entry.exchangeRate,
          totalDebit:        entry.totalCredit,
          totalCredit:       entry.totalDebit,
          descriptionEn:     `Reversal of ${entry.number}${reason ? `: ${reason}` : ""}`,
          descriptionAr:     `عكس قيد ${entry.number}${reason ? `: ${reason}` : ""}`,
          reference:         entry.number,
          createdByUserId:   user.id,
          isReversal:        true,
          reversalOfEntryId: entry.id,
          lines: {
            create: entry.lines.map((l) => ({
              accountId:     l.accountId,
              costCenterId:  l.costCenterId,
              lineNumber:    l.lineNumber,
              descriptionEn: l.descriptionEn,
              descriptionAr: l.descriptionAr,
              debit:         l.credit,
              credit:        l.debit,
              debitBase:     parseFloat(l.credit.toString()) * exchangeRate,
              creditBase:    parseFloat(l.debit.toString())  * exchangeRate,
              reference:     l.reference,
            })),
          },
        },
      });

      await tx.journalEntry.update({
        where: { id: routeParam(req.params.id) },
        data: { status: "REVERSED", reversedByEntryId: createdReversal.id },
      });

      return createdReversal;
    });

    await writeApprovalRecord({
      journalEntryId: routeParam(req.params.id),
      userId: user.id,
      action: "REVERSE",
      comment: reason,
      fromStatus: entry.status,
      toStatus: "REVERSED",
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "VOID",
      entityType: "journal_entry",
      entityId:   routeParam(req.params.id),
      description: `Reversed ${entry.number} → ${reversalNumber}`,
    });

    await emitNotification({
      organizationId: entry.organizationId,
      event:          "journal_entry.reversed",
      entityId:       entry.id,
      titleEn:        "Entry reversed",
      titleAr:        "تم عكس القيد",
      bodyEn:         `${entry.number} has been reversed. Reversal entry: ${reversalNumber}`,
      bodyAr:         `تم عكس القيد ${entry.number}. رقم قيد العكس: ${reversalNumber}`,
    });

    res.json(reversal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reverse journal entry" });
  }
  return undefined;
});

// ── COPY ─────────────────────────────────────────────────────────────────
router.post("/:id/copy", requirePermission("journal_entries", "create"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null },
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
          create: entry.lines.map((l) => ({
            accountId:     l.accountId,
            costCenterId:  l.costCenterId,
            lineNumber:    l.lineNumber,
            descriptionEn: l.descriptionEn,
            descriptionAr: l.descriptionAr,
            debit:         l.debit,
            credit:        l.credit,
            debitBase:     parseFloat(l.debit.toString())  * exchangeRate,
            creditBase:    parseFloat(l.credit.toString()) * exchangeRate,
            reference:     l.reference,
          })),
        },
      },
    });

    res.json(copy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to copy journal entry" });
  }
  return undefined;
});

// ── VOID (POSTED → VOIDED with reason) ──────────────────────────────────
router.post("/:id/void", requirePermission("journal_entries", "void"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({ where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null } });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (entry.status !== "POSTED") return res.status(400).json({ error: "Only POSTED entries can be voided" });

    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: "Void reason is required" });

    const updated = await prisma.$transaction(async (tx) => {
      return tx.journalEntry.update({
        where: { id: routeParam(req.params.id) },
        data: { status: "VOIDED", voidedAt: new Date(), voidedByUserId: user.id, voidReason: reason },
      });
    });
    await writeApprovalRecord({
      journalEntryId: routeParam(req.params.id),
      userId: user.id,
      action: "VOID",
      comment: reason,
      fromStatus: "POSTED",
      toStatus: "VOIDED",
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    await writeAuditLog({
      userId:     user.id,
      userEmail:  user.email,
      action:     "VOID",
      entityType: "journal_entry",
      entityId:   routeParam(req.params.id),
      description: `Voided ${entry.number}: ${reason}`,
    });

    await emitNotification({
      organizationId: entry.organizationId,
      event:          "journal_entry.voided",
      entityId:       entry.id,
      titleEn:        "Entry voided",
      titleAr:        "تم إلغاء القيد",
      bodyEn:         `${entry.number} has been voided: ${reason}`,
      bodyAr:         `تم إلغاء القيد ${entry.number}: ${reason}`,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to void journal entry" });
  }
  return undefined;
});

// ── GET /:id/approvals — ordered approval history ─────────────────────────
// ── VERIFY HASH ───────────────────────────────────────────────────────────────
router.get("/:id/verify-hash", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null },
      include: { lines: true },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    if (!entry.integrityHash || !entry.postedAt || !entry.postedByUserId) {
      return res.status(400).json({ error: "Entry has not been posted — no integrity hash stored" });
    }

    const computedHash = computeIntegrityHash(
      {
        id:             entry.id,
        number:         entry.number,
        organizationId: entry.organizationId,
        fiscalYearId:   entry.fiscalYearId,
        entryDate:      entry.entryDate,
        type:           entry.type,
        currencyCode:   entry.currencyCode,
        exchangeRate:   entry.exchangeRate,
        totalDebit:     entry.totalDebit,
        totalCredit:    entry.totalCredit,
        postedAt:       entry.postedAt,
        postedByUserId: entry.postedByUserId,
      },
      entry.lines,
    );

    res.json({
      entryId:      entry.id,
      number:       entry.number,
      storedHash:   entry.integrityHash,
      computedHash,
      isValid:      entry.integrityHash === computedHash,
      verifiedAt:   new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to verify integrity hash" });
  }
  return undefined;
});

router.get("/:id/approvals", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await prisma.journalEntry.findFirst({
      where: { id: routeParam(req.params.id), ...journalOrganizationScope(user.organizationId), deletedAt: null },
      select: { id: true },
    });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });

    const approvals = await prisma.journalEntryApproval.findMany({
      where: { journalEntryId: routeParam(req.params.id) },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, firstNameEn: true, lastNameEn: true, email: true } },
      },
    });

    res.json({ data: approvals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch approval history" });
  }
  return undefined;
});

export default router;
