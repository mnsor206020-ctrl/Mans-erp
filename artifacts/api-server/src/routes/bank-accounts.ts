import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { createSchema, updateSchema } from "../lib/bank-account-utils";
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
  bankId?: string;
  currencyCode?: string;
  branchId?: string | null;
  glAccountId?: string | null;
}): Promise<string | null> {
  const { bankId, currencyCode, branchId, glAccountId, organizationId } = params;

  if (bankId) {
    const bank = await prisma.bank.findFirst({
      where: { id: bankId, deletedAt: null, isActive: true },
    });
    if (!bank) return "Bank not found or inactive";
  }

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

// ─── GET /api/bank-accounts ───────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const isActive = parseBoolean(req.query.isActive);
    const { currencyCode, type } = req.query;

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      deletedAt: null,
    };

    if (isActive !== undefined) where.isActive = isActive;
    if (currencyCode) where.currencyCode = String(currencyCode);
    if (type) where.type = String(type);

    const accounts = await (prisma.bankAccount as any).findMany({
      where,
      include: {
        bank: true,
        branch: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ data: accounts });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch bank accounts" });
  }
});

// ─── POST /api/bank-accounts ──────────────────────────────────────────────────

router.post("/", requirePermission("bank_accounts", "create"), async (req, res) => {
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
      bankId: data.bankId,
      currencyCode: data.currencyCode,
      branchId: data.branchId,
      glAccountId: data.glAccountId,
    });
    if (refError) return res.status(400).json({ error: refError });

    const account = await (prisma.bankAccount as any).create({
      data: {
        organizationId: user.organizationId,
        bankId: data.bankId,
        currencyCode: data.currencyCode,
        accountNumber: data.accountNumber,
        iban: data.iban ?? null,
        accountNameEn: data.accountNameEn,
        accountNameAr: data.accountNameAr,
        type: data.type,
        openingBalance: data.openingBalance,
        currentBalance: data.openingBalance,
        glAccountId: data.glAccountId ?? null,
        branchId: data.branchId ?? null,
      },
      include: {
        bank: true,
        branch: true,
      },
    });

    return res.status(201).json(account);
  } catch (err: any) {
    if (
      err?.code === "P2002" &&
      err?.meta?.target?.includes("account_number")
    ) {
      return res.status(409).json({ error: "Account number already exists in this organization" });
    }
    return res.status(500).json({ error: "Failed to create bank account" });
  }
});

// ─── GET /api/bank-accounts/:id ──────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const account = await (prisma.bankAccount as any).findFirst({
      where: {
        id: req.params.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        bank: true,
        branch: true,
      },
    });

    if (!account) return res.status(404).json({ error: "Bank account not found" });

    return res.json(account);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch bank account" });
  }
});

// ─── PATCH /api/bank-accounts/:id ────────────────────────────────────────────

router.patch("/:id", requirePermission("bank_accounts", "update"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.bankAccount as any).findFirst({
      where: {
        id: req.params.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Bank account not found" });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const data = parsed.data;

    const refError = await validateReferences({
      organizationId: user.organizationId!,
      branchId: data.branchId,
      glAccountId: data.glAccountId,
    });
    if (refError) return res.status(400).json({ error: refError });

    const updated = await (prisma.bankAccount as any).update({
      where: { id: req.params.id },
      data: {
        ...(data.iban !== undefined && { iban: data.iban }),
        ...(data.accountNameEn !== undefined && { accountNameEn: data.accountNameEn }),
        ...(data.accountNameAr !== undefined && { accountNameAr: data.accountNameAr }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.glAccountId !== undefined && { glAccountId: data.glAccountId }),
        ...(data.branchId !== undefined && { branchId: data.branchId }),
      },
      include: {
        bank: true,
        branch: true,
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update bank account" });
  }
});

// ─── DELETE /api/bank-accounts/:id ───────────────────────────────────────────

router.delete("/:id", requirePermission("bank_accounts", "delete"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.bankAccount as any).findFirst({
      where: {
        id: req.params.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Bank account not found" });

    const balance = Number(existing.currentBalance);
    if (balance !== 0) {
      return res.status(409).json({
        error: "Cannot delete bank account with a non-zero balance",
        currentBalance: balance,
      });
    }

    await (prisma.bankAccount as any).update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete bank account" });
  }
});

// ─── POST /api/bank-accounts/:id/toggle-active ───────────────────────────────

router.post("/:id/toggle-active", requirePermission("bank_accounts", "update"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.bankAccount as any).findFirst({
      where: {
        id: req.params.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Bank account not found" });

    const updated = await (prisma.bankAccount as any).update({
      where: { id: req.params.id },
      data: { isActive: !existing.isActive },
      include: {
        bank: true,
        branch: true,
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to toggle bank account status" });
  }
});

export default router;
