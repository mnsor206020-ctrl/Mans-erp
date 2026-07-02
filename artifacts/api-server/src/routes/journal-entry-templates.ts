import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { z } from "zod";
import { requirePermission } from "../lib/authorize";

const router = Router();

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
  accountId:    z.string().uuid(),
  costCenterId: z.string().uuid().nullish(),
  lineNumber:   z.number().int().positive(),
  descriptionEn: z.string().nullish(),
  descriptionAr: z.string().nullish(),
  debit:        z.number().min(0).default(0),
  credit:       z.number().min(0).default(0),
});

const createSchema = z.object({
  organizationId: z.string().uuid().optional(),
  nameEn:         z.string().min(1),
  nameAr:         z.string().min(1),
  descriptionEn:  z.string().nullish(),
  descriptionAr:  z.string().nullish(),
  type:           z.enum(["MANUAL", "AUTOMATIC", "OPENING", "CLOSING", "ADJUSTMENT"]).default("MANUAL"),
  currencyCode:   z.string().default("SAR"),
  lines:          z.array(templateLineSchema).optional().default([]),
});

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const orgId = (req.query.organizationId as string) || user.organizationId || undefined;

    const templates = await prisma.journalEntryTemplate.findMany({
      where: { deletedAt: null, ...(orgId ? { organizationId: orgId } : {}), isActive: true },
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

router.get("/:id", requireAuth(), async (req, res) => {
  try {
    const template = await prisma.journalEntryTemplate.findFirst({
      where: { id: req.params.id, deletedAt: null },
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
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

router.post("/", requireAuth(), requirePermission("journal_entries", "create"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });

    const data = parsed.data;
    const orgId = data.organizationId || user.organizationId;
    if (!orgId) return res.status(400).json({ error: "organizationId is required" });

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
          create: data.lines.map(l => ({
            accountId:    l.accountId,
            costCenterId: l.costCenterId || null,
            lineNumber:   l.lineNumber,
            descriptionEn: l.descriptionEn || null,
            descriptionAr: l.descriptionAr || null,
            debit:        l.debit,
            credit:       l.credit,
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

router.patch("/:id", requireAuth(), requirePermission("journal_entries", "update"), async (req, res) => {
  try {
    const { nameEn, nameAr, descriptionEn, descriptionAr, type, currencyCode, isActive, lines } = req.body;

    const existing = await prisma.journalEntryTemplate.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: "Template not found" });

    if (lines !== undefined) {
      await prisma.journalEntryTemplateLine.deleteMany({ where: { templateId: req.params.id } });
      if (lines.length > 0) {
        await prisma.journalEntryTemplateLine.createMany({
          data: lines.map((l: any) => ({
            templateId:   req.params.id,
            accountId:    l.accountId,
            costCenterId: l.costCenterId || null,
            lineNumber:   l.lineNumber,
            descriptionEn: l.descriptionEn || null,
            descriptionAr: l.descriptionAr || null,
            debit:        l.debit || 0,
            credit:       l.credit || 0,
          })),
        });
      }
    }

    const updated = await prisma.journalEntryTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(nameEn !== undefined ? { nameEn } : {}),
        ...(nameAr !== undefined ? { nameAr } : {}),
        ...(descriptionEn !== undefined ? { descriptionEn } : {}),
        ...(descriptionAr !== undefined ? { descriptionAr } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(currencyCode !== undefined ? { currencyCode } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/:id", requireAuth(), requirePermission("journal_entries", "delete"), async (req, res) => {
  try {
    const existing = await prisma.journalEntryTemplate.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: "Template not found" });
    await prisma.journalEntryTemplate.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// Create JE from template
router.post("/:id/use", requireAuth(), requirePermission("journal_entries", "create"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const template = await prisma.journalEntryTemplate.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { lines: true },
    });
    if (!template) return res.status(404).json({ error: "Template not found" });

    const { fiscalYearId, entryDate, exchangeRate = 1 } = req.body;
    if (!fiscalYearId) return res.status(400).json({ error: "fiscalYearId is required" });

    const dateObj = entryDate ? new Date(entryDate) : new Date();
    const number = await generateJournalNumber(template.organizationId, dateObj.getFullYear());

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
          create: template.lines.map(l => ({
            accountId:    l.accountId,
            costCenterId: l.costCenterId,
            lineNumber:   l.lineNumber,
            descriptionEn: l.descriptionEn,
            descriptionAr: l.descriptionAr,
            debit:        l.debit,
            credit:       l.credit,
            debitBase:    parseFloat(l.debit.toString()) * exchangeRate,
            creditBase:   parseFloat(l.credit.toString()) * exchangeRate,
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
