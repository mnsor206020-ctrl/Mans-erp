import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { createSchema } from "../lib/petty-cash-utils";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

// ─── GET /api/petty-cash ──────────────────────────────────────────────────────

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { cashBoxId, type, dateFrom, dateTo } = req.query;

    const cashBoxFilter: Record<string, unknown> = {
      organizationId: user.organizationId,
      deletedAt:      null,
    };

    const where: Record<string, unknown> = {
      deletedAt: null,
      cashBox:   cashBoxFilter,
    };

    if (cashBoxId) where.cashBoxId         = String(cashBoxId);
    if (type)      where.type              = String(type);

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) dateFilter.gte = new Date(String(dateFrom));
      if (dateTo)   dateFilter.lte = new Date(String(dateTo));
      where.transactionDate = dateFilter;
    }

    const entries = await (prisma.pettyCash as any).findMany({
      where,
      include: {
        cashBox: {
          select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ data: entries });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch petty cash entries" });
  }
});

// ─── POST /api/petty-cash ─────────────────────────────────────────────────────

router.post("/", requireAuth(), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const data = parsed.data;

    const cashBox = await (prisma.cashBox as any).findFirst({
      where: {
        id:             data.cashBoxId,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
    });
    if (!cashBox) return res.status(404).json({ error: "Cash box not found in this organization" });
    if (!cashBox.isActive) return res.status(400).json({ error: "Cash box is inactive" });

    const [entry] = await prisma.$transaction(async (tx) => {
      const newEntry = await (tx.pettyCash as any).create({
        data: {
          cashBoxId:       data.cashBoxId,
          type:            data.type,
          transactionDate: new Date(data.transactionDate),
          amount:          data.amount,
          descriptionEn:   data.descriptionEn,
          descriptionAr:   data.descriptionAr,
          reference:       data.reference    ?? null,
          receiptNumber:   data.receiptNumber ?? null,
          categoryId:      data.categoryId   ?? null,
          glAccountId:     data.glAccountId  ?? null,
          costCenterId:    data.costCenterId  ?? null,
          createdByUserId: user.id,
        },
        include: {
          cashBox: {
            select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
          },
        },
      });

      const delta = data.type === "IN" ? data.amount : -data.amount;
      await (tx.cashBox as any).update({
        where: { id: data.cashBoxId },
        data:  { currentBalance: { increment: delta } },
      });

      return [newEntry];
    });

    return res.status(201).json(entry);
  } catch (err) {
    return res.status(500).json({ error: "Failed to create petty cash entry" });
  }
});

// ─── GET /api/petty-cash/:id ──────────────────────────────────────────────────

router.get("/:id", requireAuth(), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const entry = await (prisma.pettyCash as any).findFirst({
      where: {
        id:        req.params.id,
        deletedAt: null,
        cashBox:   { organizationId: user.organizationId, deletedAt: null },
      },
      include: {
        cashBox: {
          select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
        },
      },
    });

    if (!entry) return res.status(404).json({ error: "Petty cash entry not found" });

    return res.json(entry);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch petty cash entry" });
  }
});

// ─── DELETE /api/petty-cash/:id ───────────────────────────────────────────────

router.delete("/:id", requireAuth(), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.pettyCash as any).findFirst({
      where: {
        id:        req.params.id,
        deletedAt: null,
        cashBox:   { organizationId: user.organizationId, deletedAt: null },
      },
    });
    if (!existing) return res.status(404).json({ error: "Petty cash entry not found" });

    const reversalDelta = existing.type === "IN" ? -Number(existing.amount) : Number(existing.amount);

    await prisma.$transaction(async (tx) => {
      await (tx.pettyCash as any).update({
        where: { id: req.params.id },
        data:  { deletedAt: new Date() },
      });

      await (tx.cashBox as any).update({
        where: { id: existing.cashBoxId },
        data:  { currentBalance: { increment: reversalDelta } },
      });
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete petty cash entry" });
  }
});

export default router;
