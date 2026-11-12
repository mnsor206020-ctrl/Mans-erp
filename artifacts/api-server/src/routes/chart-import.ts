import { Router } from "express";
import { prisma } from "@workspace/prisma";
import type { AccountType, AccountNature } from "@prisma/client";
import { z } from "zod";
import { requirePermission } from "../lib/authorize";
import { validateChartImport } from "../lib/chart-import";

const router = Router();
const inputSchema = z.object({
  confirm: z.boolean(),
  rows: z.array(z.object({
    rowNumber: z.number().int().min(2),
    code: z.string().max(200), parentCode: z.string().max(200),
    name: z.string().max(1000).optional(),
    nameAr: z.string().max(1000).optional(), nameEn: z.string().max(1000).optional(),
    type: z.string().max(100), nature: z.string().max(100),
    notes: z.string().max(10000).optional(),
  })).min(1).max(2000),
});

router.post("/", requirePermission("chart_of_accounts", "create"), async (req, res) => {
  const user = req.currentUser;
  if (!user?.organizationId) return res.status(403).json({ error: "يجب ربط حسابك بمنظمة قبل الاستيراد." });
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الاستيراد غير صالحة؛ الحد الأقصى 2000 حساب.", details: parsed.error.flatten() });
  const orgId = user.organizationId;
  try {
    if (!parsed.data.confirm) {
      const existing = await prisma.chartOfAccount.findMany({ where: { organizationId: orgId } });
      return res.json(validateChartImport(parsed.data.rows, existing));
    }
    const result = await prisma.$transaction(async (tx) => {
      // Protect referenced existing parents from concurrent edits during validation/save.
      await tx.$queryRaw`SELECT id FROM chart_of_accounts WHERE organization_id = ${orgId}::uuid FOR SHARE`;
      const existing = await tx.chartOfAccount.findMany({ where: { organizationId: orgId } });
      const preview = validateChartImport(parsed.data.rows, existing);
      if (!preview.valid) return preview;
      const ids = new Map(existing.map((a) => [a.code, a.id]));
      for (const row of preview.rows) {
        const created = await tx.chartOfAccount.create({
          data: {
            organizationId: orgId, code: row.code,
            nameAr: row.nameAr, nameEn: row.nameEn,
            parentId: row.parentCode ? ids.get(row.parentCode)! : null,
            type: row.type as AccountType, nature: row.nature as AccountNature,
            level: row.level, isGroup: row.isGroup, allowDirectEntry: !row.isGroup,
            notes: row.notes || null,
          },
        });
        ids.set(row.code, created.id);
      }
      await tx.auditLog.create({
        data: {
          userId: user.id, action: "CREATE", entityType: "chart_of_accounts_import",
          description: `Imported ${preview.total} accounts`,
          newValues: { codes: preview.rows.map((r) => r.code), count: preview.total },
        },
      });
      return { ...preview, imported: preview.total };
    }, { timeout: 60000, isolationLevel: "Serializable" });
    return res.json(result);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002" || code === "P2034") {
      return res.status(409).json({ error: "تغيرت الحسابات أثناء الاستيراد. لم يتم حفظ أي حساب؛ أعد المعاينة والمحاولة." });
    }
    return res.status(500).json({ error: "فشل الاستيراد وتم التراجع عن جميع التغييرات." });
  }
});

export default router;
