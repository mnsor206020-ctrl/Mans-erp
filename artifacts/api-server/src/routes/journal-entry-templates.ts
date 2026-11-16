import { getAuth } from "@clerk/express";
import { prisma as basePrisma } from "@workspace/prisma";
import { createAccountingRouter } from "../lib/accounting-transaction";
import { z } from "zod";
import { requirePermission } from "../lib/authorize";
import { routeParam } from "../lib/route-param";

const { router, prisma } = createAccountingRouter("templates", basePrisma);

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

async function generateJournalNumber(orgId: string, year: number): Promise<string> {
  const prefix = `JE-${year}-`;
  const existing = await prisma.journalEntry.findMany({
    where: { organizationId: orgId, number: { startsWith: prefix } },
    select: { number: true },
  });
  let maxNum = 0;
  for (const je of existing) {
    const num = parseInt(je.number.replace(prefix, ""), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
}

const templateLineSchema = z.object({
  accountId:     z.string().uuid(),
  costCenterId:  z.string().uuid().nullish(),
  lineNumber:    z.number().int().positive(),
  descriptionEn: z.string().nullish(),
  descriptionAr: z.string().nullish(),
  debit:         z.number().min(0).default(0),
  credit:        z.number().min(0).default(0),
});

const createSchema = z.object({
  nameEn:        z.string().min(1),
  nameAr:        z.string().min(1),
  descriptionEn: z.string().nullish(),
  descriptionAr: z.string().nullish(),
  type:          z.enum(["MANUAL", "AUTOMATIC", "OPENING", "CLOSING", "ADJUSTMENT"]).default("MANUAL"),
  currencyCode:  z.string().default("SAR"),
  lines:         z.array(templateLineSchema).optional().default([]),
});

const updateSchema = z.object({
  nameEn:        z.string().min(1).optional(),
  nameAr:        z.string().min(1).optional(),
  descriptionEn: z.string().nullish(),
  descriptionAr: z.string().nullish(),
  type:          z.enum(["MANUAL", "AUTOMATIC", "OPENING", "CLOSING", "ADJUSTMENT"]).optional(),
  currencyCode:  z.string().optional(),
  isActive:      z.boolean().optional(),
  lines:         z.array(templateLineSchema).optional(),
});

// ─── GET / ─── list templates scoped to user's org ────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const user = await getUser(userId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    // If user has no org, return empty list — every template belongs to an org
    if (!user.organizationId) {
      res.json([]);
      return;
    }

    const templates = await prisma.journalEntryTemplate.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, isActive: true },
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          include: {
            account:    { select: { id: true, code: true, nameEn: true, nameAr: true } },
            costCenter: { select: { id: true, code: true, nameEn: true, nameAr: true } },
          },
        },
        _count: { select: { lines: true } },
      },
      orderBy: { nameEn: "asc" },
    });

    res.json(templates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

// ─── GET /:id ─── fetch single template scoped to user's org ──────────────────

router.get("/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const user = await getUser(userId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const template = await prisma.journalEntryTemplate.findFirst({
      where: {
        id:             routeParam(req.params.id),
        organizationId: user.organizationId ?? undefined,
        deletedAt:      null,
      },
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          include: {
            account:    { select: { id: true, code: true, nameEn: true, nameAr: true, type: true } },
            costCenter: { select: { id: true, code: true, nameEn: true, nameAr: true } },
          },
        },
      },
    });
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(template);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

// ─── POST / ─── create template ───────────────────────────────────────────────

router.post("/", requirePermission("journal_entries", "create"), async (req, res) => {
  try {
    const user = req.currentUser!;

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const data   = parsed.data;
    const orgId  = user.organizationId;
    if (!orgId) { res.status(400).json({ error: "User has no organization" }); return; }

    const template = await prisma.journalEntryTemplate.create({
      data: {
        organizationId: orgId,
        nameEn:         data.nameEn,
        nameAr:         data.nameAr,
        descriptionEn:  data.descriptionEn || null,
        descriptionAr:  data.descriptionAr || null,
        type:           data.type,
        currencyCode:   data.currencyCode,
        lines: {
          create: data.lines.map((l) => ({
            accountId:     l.accountId,
            costCenterId:  l.costCenterId || null,
            lineNumber:    l.lineNumber,
            descriptionEn: l.descriptionEn || null,
            descriptionAr: l.descriptionAr || null,
            debit:         l.debit,
            credit:        l.credit,
          })),
        },
      },
      include: { lines: true },
    });

    res.status(201).json(template);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

// ─── PATCH /:id ─── update template ──────────────────────────────────────────

router.patch("/:id", requirePermission("journal_entries", "update"), async (req, res) => {
  try {
    const user = req.currentUser!;

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    const existing = await prisma.journalEntryTemplate.findFirst({
      where: { id: routeParam(req.params.id), organizationId: user.organizationId ?? undefined, deletedAt: null },
    });
    if (!existing) { res.status(404).json({ error: "Template not found" }); return; }

    if (data.lines !== undefined) {
      await prisma.journalEntryTemplateLine.deleteMany({ where: { templateId: routeParam(req.params.id) } });
      if (data.lines.length > 0) {
        await prisma.journalEntryTemplateLine.createMany({
          data: data.lines.map((l) => ({
            templateId:    routeParam(req.params.id),
            accountId:     l.accountId,
            costCenterId:  l.costCenterId || null,
            lineNumber:    l.lineNumber,
            descriptionEn: l.descriptionEn || null,
            descriptionAr: l.descriptionAr || null,
            debit:         l.debit,
            credit:        l.credit,
          })),
        });
      }
    }

    const updated = await prisma.journalEntryTemplate.update({
      where: { id: routeParam(req.params.id) },
      data: {
        ...(data.nameEn        !== undefined ? { nameEn:        data.nameEn }        : {}),
        ...(data.nameAr        !== undefined ? { nameAr:        data.nameAr }        : {}),
        ...(data.descriptionEn !== undefined ? { descriptionEn: data.descriptionEn } : {}),
        ...(data.descriptionAr !== undefined ? { descriptionAr: data.descriptionAr } : {}),
        ...(data.type          !== undefined ? { type:          data.type }          : {}),
        ...(data.currencyCode  !== undefined ? { currencyCode:  data.currencyCode }  : {}),
        ...(data.isActive      !== undefined ? { isActive:      data.isActive }      : {}),
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// ─── DELETE /:id ─── soft delete ──────────────────────────────────────────────

router.delete("/:id", requirePermission("journal_entries", "delete"), async (req, res) => {
  try {
    const user = req.currentUser!;

    const existing = await prisma.journalEntryTemplate.findFirst({
      where: { id: routeParam(req.params.id), organizationId: user.organizationId ?? undefined, deletedAt: null },
    });
    if (!existing) { res.status(404).json({ error: "Template not found" }); return; }

    await prisma.journalEntryTemplate.update({
      where: { id: routeParam(req.params.id) },
      data:  { deletedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ─── POST /:id/use ─── create journal entry from template ────────────────────

router.post("/:id/use", requirePermission("journal_entries", "create"), async (req, res) => {
  try {
    const user = req.currentUser!;

    const template = await prisma.journalEntryTemplate.findFirst({
      where: { id: routeParam(req.params.id), organizationId: user.organizationId ?? undefined, deletedAt: null },
      include: { lines: true },
    });
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    if (!template.isActive) { res.status(400).json({ error: "Template is inactive" }); return; }

    const { fiscalYearId, entryDate, exchangeRate = 1 } = req.body;
    if (!fiscalYearId) { res.status(400).json({ error: "fiscalYearId is required" }); return; }

    // Validate the fiscal year belongs to the user's organisation
    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId: user.organizationId ?? undefined, deletedAt: null },
    });
    if (!fiscalYear) { res.status(400).json({ error: "Fiscal year not found" }); return; }

    const dateObj = entryDate ? new Date(entryDate) : new Date();
    const number  = await generateJournalNumber(template.organizationId, dateObj.getFullYear());

    const totalDebit  = template.lines.reduce((s, l) => s + parseFloat(l.debit.toString()),  0);
    const totalCredit = template.lines.reduce((s, l) => s + parseFloat(l.credit.toString()), 0);

    const entry = await prisma.journalEntry.create({
      data: {
        organizationId:  template.organizationId,
        fiscalYearId,
        number,
        entryDate:       dateObj,
        type:            template.type,
        status:          "DRAFT",
        currencyCode:    template.currencyCode,
        exchangeRate,
        totalDebit,
        totalCredit,
        descriptionEn:   `From template: ${template.nameEn}`,
        descriptionAr:   `من النموذج: ${template.nameAr}`,
        createdByUserId: user.id,
        lines: {
          create: template.lines.map((l) => ({
            accountId:     l.accountId,
            costCenterId:  l.costCenterId,
            lineNumber:    l.lineNumber,
            descriptionEn: l.descriptionEn,
            descriptionAr: l.descriptionAr,
            debit:         l.debit,
            credit:        l.credit,
            debitBase:     parseFloat(l.debit.toString())  * exchangeRate,
            creditBase:    parseFloat(l.credit.toString()) * exchangeRate,
          })),
        },
      },
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create entry from template" });
  }
});

export default router;
