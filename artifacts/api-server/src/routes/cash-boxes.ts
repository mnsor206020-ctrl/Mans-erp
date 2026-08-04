import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { createSchema, updateSchema } from "../lib/cash-box-utils";
import { requirePermission } from "../lib/authorize";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

function parseBoolean(val: unknown): boolean | undefined {
  if (val === "true") return true;
  if (val === "false") return false;
  return undefined;
}

// ─── Reference validators ─────────────────────────────────────────────────────

async function validateReferences(params: {
  organizationId: string;
  currencyCode?: string;
  branchId?: string | null;
  glAccountId?: string | null;
}): Promise<string | null> {
  const { currencyCode, branchId, glAccountId, organizationId } = params;

  if (currencyCode) {
    const currency = await prisma.currency.findFirst({
      where: { code: currencyCode, status: "ACTIVE" },
    });
    if (!currency) return "Currency not found or inactive";
  }

  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organizationId, deletedAt: null },
    });
    if (!branch) return "Branch not found in this organization";
  }

  if (glAccountId) {
    const account = await (prisma.chartOfAccount as any).findFirst({
      where: { id: glAccountId, organizationId, deletedAt: null },
    });
    if (!account) return "GL account not found in this organization";
  }

  return null;
}

// ─── GET /api/cash-boxes ──────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const isActive    = parseBoolean(req.query.isActive);
    const { currencyCode } = req.query;

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      deletedAt:      null,
    };

    if (isActive !== undefined) where.isActive     = isActive;
    if (currencyCode)           where.currencyCode = String(currencyCode);

    const cashBoxes = await (prisma.cashBox as any).findMany({
      where,
      include: { branch: true },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ data: cashBoxes });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch cash boxes" });
  }
});

// ─── POST /api/cash-boxes ─────────────────────────────────────────────────────

router.post("/", requirePermission("cash_boxes", "create"), async (req, res) => {
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

    const refError = await validateReferences({
      organizationId: user.organizationId!,
      currencyCode:   data.currencyCode,
      branchId:       data.branchId,
      glAccountId:    data.glAccountId,
    });
    if (refError) return res.status(400).json({ error: refError });

    const cashBox = await (prisma.cashBox as any).create({
      data: {
        organizationId: user.organizationId,
        currencyCode:   data.currencyCode,
        nameEn:         data.nameEn,
        nameAr:         data.nameAr,
        code:           data.code,
        openingBalance: data.openingBalance,
        currentBalance: data.openingBalance,
        glAccountId:    data.glAccountId ?? null,
        branchId:       data.branchId   ?? null,
      },
      include: { branch: true },
    });

    return res.status(201).json(cashBox);
  } catch (err: any) {
    if (err?.code === "P2002" && err?.meta?.target?.includes("code")) {
      return res.status(409).json({ error: "Code already exists in this organization" });
    }
    return res.status(500).json({ error: "Failed to create cash box" });
  }
});

// ─── GET /api/cash-boxes/:id ──────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const cashBox = await (prisma.cashBox as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
      include: { branch: true },
    });

    if (!cashBox) return res.status(404).json({ error: "Cash box not found" });

    return res.json(cashBox);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch cash box" });
  }
});

// ─── PATCH /api/cash-boxes/:id ────────────────────────────────────────────────

router.patch("/:id", requirePermission("cash_boxes", "update"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.cashBox as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Cash box not found" });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const data = parsed.data;

    const refError = await validateReferences({
      organizationId: user.organizationId!,
      branchId:       data.branchId,
      glAccountId:    data.glAccountId,
    });
    if (refError) return res.status(400).json({ error: refError });

    const updated = await (prisma.cashBox as any).update({
      where: { id: req.params.id },
      data: {
        ...(data.nameEn      !== undefined && { nameEn:      data.nameEn }),
        ...(data.nameAr      !== undefined && { nameAr:      data.nameAr }),
        ...(data.glAccountId !== undefined && { glAccountId: data.glAccountId }),
        ...(data.branchId    !== undefined && { branchId:    data.branchId }),
      },
      include: { branch: true },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update cash box" });
  }
});

// ─── DELETE /api/cash-boxes/:id ───────────────────────────────────────────────

router.delete("/:id", requirePermission("cash_boxes", "delete"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.cashBox as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Cash box not found" });

    const balance = Number(existing.currentBalance);
    if (balance !== 0) {
      return res.status(409).json({
        error:          "Cannot delete cash box with a non-zero balance",
        currentBalance: balance,
      });
    }

    await (prisma.cashBox as any).update({
      where: { id: req.params.id },
      data:  { deletedAt: new Date() },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete cash box" });
  }
});

// ─── POST /api/cash-boxes/:id/toggle-active ───────────────────────────────────

router.post("/:id/toggle-active", requirePermission("cash_boxes", "update"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.cashBox as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Cash box not found" });

    const updated = await (prisma.cashBox as any).update({
      where: { id: req.params.id },
      data:  { isActive: !existing.isActive },
      include: { branch: true },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to toggle cash box status" });
  }
});

export default router;
