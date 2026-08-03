import { Router } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";
import { z } from "zod";
import { requirePermission } from "../lib/authorize";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getCurrentUser(clerkId: string | null | undefined) {
  if (!clerkId) return null;
  return prisma.user.findFirst({
    where: { clerkId, deletedAt: null },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });
}

async function writeAuditLog(params: {
  userId?: string;
  userEmail?: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: string;
  entityId?: string;
  oldValues?: object;
  newValues?: object;
  description?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        userEmail: params.userEmail,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValues: params.oldValues ?? undefined,
        newValues: params.newValues ?? undefined,
        description: params.description,
      },
    });
  } catch {
    // non-blocking — audit failure must not break the main request
  }
}

function defaultNature(type: string): "DEBIT" | "CREDIT" {
  return ["ASSET", "EXPENSE"].includes(type) ? "DEBIT" : "CREDIT";
}

function buildTree(accounts: object[]): object[] {
  const map = new Map<string, any>();
  accounts.forEach((a: any) => map.set(a.id, { ...a, children: [] }));
  const roots: any[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (nodes: any[]): any[] => {
    nodes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    nodes.forEach((n) => sortNodes(n.children));
    return nodes;
  };
  return sortNodes(roots);
}

async function isDescendant(
  targetId: string,
  ancestorId: string
): Promise<boolean> {
  const node = await prisma.chartOfAccount.findFirst({
    where: { id: targetId },
    select: { parentId: true },
  });
  if (!node || !node.parentId) return false;
  if (node.parentId === ancestorId) return true;
  return isDescendant(node.parentId, ancestorId);
}

// ── Validation schemas ───────────────────────────────────────────────────────

const createSchema = z.object({
  organizationId: z.string().uuid().optional(),
  parentId: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(20),
  nameEn: z.string().min(1).max(200),
  nameAr: z.string().min(1).max(200),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  nature: z.enum(["DEBIT", "CREDIT"]).optional(),
  isGroup: z.boolean().optional().default(false),
  currencyCode: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(20).optional(),
  nameEn: z.string().min(1).max(200).optional(),
  nameAr: z.string().min(1).max(200).optional(),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]).optional(),
  nature: z.enum(["DEBIT", "CREDIT"]).optional(),
  isGroup: z.boolean().optional(),
  currencyCode: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ── GET /tree ────────────────────────────────────────────────────────────────

router.get("/tree", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getCurrentUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const organizationId = (req.query.organizationId as string) || user.organizationId || undefined;

    const accounts = await prisma.chartOfAccount.findMany({
      where: {
        deletedAt: null,
        ...(organizationId ? { organizationId } : {}),
      },
      orderBy: [{ level: "asc" }, { code: "asc" }],
    });

    res.json(buildTree(accounts));
  } catch {
    res.status(500).json({ error: "Failed to fetch chart of accounts tree" });
  }
});

// ── GET / (flat, paginated) ──────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getCurrentUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const {
      search,
      type,
      isActive,
      isGroup,
      organizationId,
      page = "1",
      pageSize = "50",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const pageSizeNum = Math.min(200, Math.max(1, parseInt(pageSize as string, 10)));

    const orgId = (organizationId as string) || user.organizationId || undefined;

    const where: any = {
      deletedAt: null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...(type ? { type: type as string } : {}),
      ...(isActive !== undefined ? { isActive: isActive === "true" } : {}),
      ...(isGroup !== undefined ? { isGroup: isGroup === "true" } : {}),
    };

    if (search) {
      where.OR = [
        { code: { contains: search as string, mode: "insensitive" } },
        { nameEn: { contains: search as string, mode: "insensitive" } },
        { nameAr: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const skip = (pageNum - 1) * pageSizeNum;

    const [total, accounts] = await Promise.all([
      prisma.chartOfAccount.count({ where }),
      prisma.chartOfAccount.findMany({
        where,
        orderBy: [{ level: "asc" }, { code: "asc" }],
        skip,
        take: pageSizeNum,
        include: {
          parent: { select: { id: true, code: true, nameEn: true, nameAr: true } },
        },
      }),
    ]);

    res.json({
      data: accounts,
      meta: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum),
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getCurrentUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const account = await prisma.chartOfAccount.findFirst({
      where: { id: req.params.id, organizationId: user.organizationId, deletedAt: null },
      include: {
        parent: { select: { id: true, code: true, nameEn: true, nameAr: true } },
        children: {
          where: { deletedAt: null },
          orderBy: { code: "asc" },
        },
      },
    });

    if (!account) return res.status(404).json({ error: "Account not found" });

    const transactionCount = await prisma.journalEntryLine.count({
      where: { accountId: account.id },
    });

    res.json({ ...account, transactionCount });
  } catch {
    res.status(500).json({ error: "Failed to fetch account" });
  }
});

// ── POST / ───────────────────────────────────────────────────────────────────

router.post("/", requirePermission("chart_of_accounts", "create"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getCurrentUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const orgId = data.organizationId || user.organizationId;
    if (!orgId) return res.status(400).json({ error: "Organization ID is required" });

    // Code uniqueness within org
    const dup = await prisma.chartOfAccount.findFirst({
      where: { organizationId: orgId, code: data.code, deletedAt: null },
    });
    if (dup) return res.status(409).json({ error: `Account code "${data.code}" already exists in this organization` });

    // Validate parent
    let level = 1;
    if (data.parentId) {
      const parent = await prisma.chartOfAccount.findFirst({
        where: { id: data.parentId, organizationId: orgId, deletedAt: null },
      });
      if (!parent) return res.status(400).json({ error: "Parent account not found in this organization" });
      level = parent.level + 1;
    }

    const nature = data.nature || defaultNature(data.type);
    const isGroup = data.isGroup ?? false;
    const allowDirectEntry = !isGroup;

    const account = await prisma.chartOfAccount.create({
      data: {
        organizationId: orgId,
        parentId: data.parentId ?? null,
        code: data.code,
        nameEn: data.nameEn,
        nameAr: data.nameAr,
        type: data.type,
        nature,
        level,
        isGroup,
        allowDirectEntry,
        currencyCode: data.currencyCode ?? null,
        notes: data.notes ?? null,
      },
    });

    // If parent was a leaf account it must become a group now that it has children
    if (data.parentId) {
      const parent = await prisma.chartOfAccount.findUnique({ where: { id: data.parentId } });
      if (parent && !parent.isGroup) {
        await prisma.chartOfAccount.update({
          where: { id: data.parentId },
          data: { isGroup: true, allowDirectEntry: false },
        });
      }
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "CREATE",
      entityType: "chart_of_account",
      entityId: account.id,
      newValues: account as object,
      description: `Created account ${account.code} – ${account.nameEn}`,
    });

    res.status(201).json(account);
  } catch {
    res.status(500).json({ error: "Failed to create account" });
  }
});

// ── PATCH /:id ───────────────────────────────────────────────────────────────

router.patch("/:id", requirePermission("chart_of_accounts", "update"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getCurrentUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await prisma.chartOfAccount.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: "Account not found" });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const data = parsed.data;

    // Code uniqueness
    if (data.code && data.code !== existing.code) {
      const dup = await prisma.chartOfAccount.findFirst({
        where: {
          organizationId: existing.organizationId,
          code: data.code,
          deletedAt: null,
          NOT: { id: req.params.id },
        },
      });
      if (dup) return res.status(409).json({ error: `Account code "${data.code}" already exists` });
    }

    // Parent change — validate and check for circular references
    let level = existing.level;
    if (data.parentId !== undefined) {
      if (data.parentId === req.params.id) {
        return res.status(400).json({ error: "An account cannot be its own parent" });
      }
      if (data.parentId) {
        const newParent = await prisma.chartOfAccount.findFirst({
          where: { id: data.parentId, organizationId: existing.organizationId, deletedAt: null },
        });
        if (!newParent) return res.status(400).json({ error: "Parent account not found" });

        const circular = await isDescendant(data.parentId, req.params.id);
        if (circular) {
          return res.status(400).json({
            error: "Circular reference detected — the chosen parent is a descendant of this account",
          });
        }
        level = newParent.level + 1;
      } else {
        level = 1;
      }
    }

    // isGroup change
    let allowDirectEntry = existing.allowDirectEntry;
    if (data.isGroup !== undefined && data.isGroup !== existing.isGroup) {
      if (!data.isGroup) {
        const childCount = await prisma.chartOfAccount.count({
          where: { parentId: req.params.id, deletedAt: null },
        });
        if (childCount > 0) {
          return res.status(400).json({
            error: "Cannot convert to a leaf account while it has sub-accounts",
          });
        }
      }
      allowDirectEntry = !data.isGroup;
    }

    const updated = await prisma.chartOfAccount.update({
      where: { id: req.params.id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.nameEn !== undefined ? { nameEn: data.nameEn } : {}),
        ...(data.nameAr !== undefined ? { nameAr: data.nameAr } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.nature !== undefined ? { nature: data.nature } : {}),
        ...(data.isGroup !== undefined ? { isGroup: data.isGroup, allowDirectEntry } : {}),
        ...(data.currencyCode !== undefined ? { currencyCode: data.currencyCode } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId, level } : {}),
      },
    });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "UPDATE",
      entityType: "chart_of_account",
      entityId: updated.id,
      oldValues: existing as object,
      newValues: updated as object,
      description: `Updated account ${updated.code} – ${updated.nameEn}`,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update account" });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete("/:id", requirePermission("chart_of_accounts", "delete"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getCurrentUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const account = await prisma.chartOfAccount.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Cannot delete if sub-accounts exist
    const childCount = await prisma.chartOfAccount.count({
      where: { parentId: req.params.id, deletedAt: null },
    });
    if (childCount > 0) {
      return res.status(400).json({
        error: `Cannot delete an account with ${childCount} sub-account(s). Delete or reassign them first.`,
      });
    }

    // Cannot delete if it has journal entry lines
    const txCount = await prisma.journalEntryLine.count({
      where: { accountId: req.params.id },
    });
    if (txCount > 0) {
      return res.status(400).json({
        error: `Cannot delete an account with ${txCount} transaction(s). Consider deactivating it instead.`,
      });
    }

    await prisma.chartOfAccount.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "DELETE",
      entityType: "chart_of_account",
      entityId: req.params.id,
      oldValues: account as object,
      description: `Deleted account ${account.code} – ${account.nameEn}`,
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// ── POST /:id/toggle-active ──────────────────────────────────────────────────

router.post("/:id/toggle-active", requirePermission("chart_of_accounts", "update"), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await getCurrentUser(userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const account = await prisma.chartOfAccount.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Deactivating: block if active children exist
    if (account.isActive) {
      const activeChildCount = await prisma.chartOfAccount.count({
        where: { parentId: req.params.id, deletedAt: null, isActive: true },
      });
      if (activeChildCount > 0) {
        return res.status(400).json({
          error: `Cannot deactivate an account with ${activeChildCount} active sub-account(s). Deactivate them first.`,
        });
      }
    }

    const updated = await prisma.chartOfAccount.update({
      where: { id: req.params.id },
      data: { isActive: !account.isActive },
    });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "UPDATE",
      entityType: "chart_of_account",
      entityId: updated.id,
      oldValues: { isActive: account.isActive },
      newValues: { isActive: updated.isActive },
      description: `${updated.isActive ? "Activated" : "Deactivated"} account ${updated.code} – ${updated.nameEn}`,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to toggle account status" });
  }
});

export default router;
