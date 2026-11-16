import { AccountingPeriodError } from "../lib/accounting-period";
import { requireAuth, getAuth } from "@clerk/express";
import { prisma as basePrisma } from "@workspace/prisma";
import { createAccountingRouter, withJournalAccountingState } from "../lib/accounting-transaction";
import { createSchema, updateSchema, voidSchema, formatPaymentNumber } from "../lib/payment-utils";
import {
  createAutoPostedJE,
  createReversalJE,
  resolveOpenFiscalYear,
} from "../lib/auto-journal-utils";
import { requirePermission } from "../lib/authorize";

const { router, prisma } = createAccountingRouter("payments", basePrisma);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getUser(clerkId: string) {
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

// ─── Number generation ────────────────────────────────────────────────────────

async function generatePaymentNumber(orgId: string, year: number): Promise<string> {
  const prefix = `PMT-${year}-`;
  const existing = await (prisma.payment as any).findMany({
    where: { organizationId: orgId, number: { startsWith: prefix } },
    select: { number: true },
  });
  let maxNum = 0;
  for (const p of existing) {
    const numStr = (p.number as string).replace(prefix, "");
    const num = parseInt(numStr, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return formatPaymentNumber(year, maxNum + 1);
}

// ─── Reference validators ─────────────────────────────────────────────────────

async function validateReferences(params: {
  organizationId: string;
  currencyCode?: string;
  bankAccountId?: string | null;
  cashBoxId?: string | null;
  branchId?: string | null;
}): Promise<string | null> {
  const { organizationId, currencyCode, bankAccountId, cashBoxId, branchId } = params;

  if (currencyCode) {
    const currency = await prisma.currency.findFirst({
      where: { code: currencyCode, status: "ACTIVE" },
    });
    if (!currency) return "Currency not found or inactive";
  }

  if (bankAccountId) {
    const account = await (prisma.bankAccount as any).findFirst({
      where: { id: bankAccountId, organizationId, deletedAt: null },
    });
    if (!account) return "Bank account not found in this organization";
    if (!account.isActive) return "Bank account is inactive";
  }

  if (cashBoxId) {
    const cashBox = await (prisma.cashBox as any).findFirst({
      where: { id: cashBoxId, organizationId, deletedAt: null },
    });
    if (!cashBox) return "Cash box not found in this organization";
    if (!cashBox.isActive) return "Cash box is inactive";
  }

  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organizationId, deletedAt: null },
    });
    if (!branch) return "Branch not found in this organization";
  }

  return null;
}

// ─── GET /api/payments ────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const { status, paymentMethod, bankAccountId, cashBoxId, dateFrom, dateTo } = req.query;

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      deletedAt:      null,
    };

    if (status)        where.status        = String(status);
    if (paymentMethod) where.paymentMethod = String(paymentMethod);
    if (bankAccountId) where.bankAccountId = String(bankAccountId);
    if (cashBoxId)     where.cashBoxId     = String(cashBoxId);

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) dateFilter.gte = new Date(String(dateFrom));
      if (dateTo)   dateFilter.lte = new Date(String(dateTo));
      where.paymentDate = dateFilter;
    }

    const payments = await (prisma.payment as any).findMany({
      where,
      include: {
        bankAccount: {
          select: { id: true, accountNameEn: true, accountNameAr: true, accountNumber: true, currencyCode: true },
        },
        cashBox: {
          select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ data: await withJournalAccountingState(prisma, user.organizationId!, payments) });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ─── POST /api/payments ───────────────────────────────────────────────────────

router.post("/", requirePermission("payments", "create"), async (req, res) => {
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

    if (data.paymentMethod === "CASH" && !data.cashBoxId) {
      return res.status(400).json({ error: "cashBoxId is required when paymentMethod is CASH" });
    }
    if (data.paymentMethod !== "CASH" && !data.bankAccountId) {
      return res.status(400).json({ error: "bankAccountId is required when paymentMethod is not CASH" });
    }

    const refError = await validateReferences({
      organizationId: user.organizationId!,
      currencyCode:   data.currencyCode,
      bankAccountId:  data.bankAccountId,
      cashBoxId:      data.cashBoxId,
      branchId:       data.branchId,
    });
    if (refError) return res.status(400).json({ error: refError });

    const year   = new Date(data.paymentDate).getFullYear();
    const number = await generatePaymentNumber(user.organizationId!, year);

    const amountBase = data.amount * data.exchangeRate;

    const payment = await (prisma.payment as any).create({
      data: {
        organizationId:  user.organizationId,
        number,
        paymentDate:     new Date(data.paymentDate),
        paymentMethod:   data.paymentMethod,
        status:          "DRAFT",
        currencyCode:    data.currencyCode,
        exchangeRate:    data.exchangeRate,
        amount:          data.amount,
        amountBase,
        bankAccountId:   data.bankAccountId   ?? null,
        cashBoxId:       data.cashBoxId       ?? null,
        branchId:        data.branchId        ?? null,
        glAccountId:     data.glAccountId     ?? null,
        payeeName:       data.payeeName       ?? null,
        payeeNameAr:     data.payeeNameAr     ?? null,
        payeeType:       data.payeeType       ?? null,
        payeeId:         data.payeeId         ?? null,
        chequeNumber:    data.chequeNumber    ?? null,
        chequeDate:      data.chequeDate ? new Date(data.chequeDate) : null,
        chequeBankName:  data.chequeBankName  ?? null,
        descriptionEn:   data.descriptionEn   ?? null,
        descriptionAr:   data.descriptionAr   ?? null,
        reference:       data.reference       ?? null,
        createdByUserId: user.id,
      },
      include: {
        bankAccount: {
          select: { id: true, accountNameEn: true, accountNameAr: true, accountNumber: true, currencyCode: true },
        },
        cashBox: {
          select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
        },
      },
    });

    return res.status(201).json(payment);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Payment number already exists for this organization" });
    }
    return res.status(500).json({ error: "Failed to create payment" });
  }
});

// ─── GET /api/payments/:id ────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const payment = await (prisma.payment as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
      include: {
        bankAccount: {
          select: { id: true, accountNameEn: true, accountNameAr: true, accountNumber: true, currencyCode: true },
        },
        cashBox: {
          select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
        },
      },
    });

    if (!payment) return res.status(404).json({ error: "Payment not found" });

    return res.json(payment);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch payment" });
  }
});

// ─── PATCH /api/payments/:id ──────────────────────────────────────────────────

router.patch("/:id", requirePermission("payments", "update"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.payment as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Payment not found" });

    if (existing.status !== "DRAFT") {
      return res.status(400).json({ error: "Payment can only be updated while in DRAFT status" });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const data = parsed.data;

    const refError = await validateReferences({
      organizationId: user.organizationId!,
      bankAccountId:  data.bankAccountId,
      cashBoxId:      data.cashBoxId,
      branchId:       data.branchId,
    });
    if (refError) return res.status(400).json({ error: refError });

    const currentAmount       = data.amount      !== undefined ? data.amount      : Number(existing.amount);
    const currentExchangeRate = data.exchangeRate !== undefined ? data.exchangeRate : Number(existing.exchangeRate);
    const amountBase          = currentAmount * currentExchangeRate;

    const updated = await (prisma.payment as any).update({
      where: { id: req.params.id },
      data: {
        ...(data.paymentDate    !== undefined && { paymentDate:    new Date(data.paymentDate) }),
        ...(data.paymentMethod  !== undefined && { paymentMethod:  data.paymentMethod }),
        ...(data.currencyCode   !== undefined && { currencyCode:   data.currencyCode }),
        ...(data.exchangeRate   !== undefined && { exchangeRate:   data.exchangeRate }),
        ...(data.amount         !== undefined && { amount:         data.amount }),
        ...(data.amount !== undefined || data.exchangeRate !== undefined ? { amountBase } : {}),
        ...(data.bankAccountId  !== undefined && { bankAccountId:  data.bankAccountId }),
        ...(data.cashBoxId      !== undefined && { cashBoxId:      data.cashBoxId }),
        ...(data.branchId       !== undefined && { branchId:       data.branchId }),
        ...(data.payeeName      !== undefined && { payeeName:      data.payeeName }),
        ...(data.payeeNameAr    !== undefined && { payeeNameAr:    data.payeeNameAr }),
        ...(data.payeeType      !== undefined && { payeeType:      data.payeeType }),
        ...(data.payeeId        !== undefined && { payeeId:        data.payeeId }),
        ...(data.chequeNumber   !== undefined && { chequeNumber:   data.chequeNumber }),
        ...(data.chequeDate     !== undefined && { chequeDate:     data.chequeDate ? new Date(data.chequeDate) : null }),
        ...(data.chequeBankName !== undefined && { chequeBankName: data.chequeBankName }),
        ...(data.descriptionEn  !== undefined && { descriptionEn:  data.descriptionEn }),
        ...(data.descriptionAr  !== undefined && { descriptionAr:  data.descriptionAr }),
        ...(data.reference      !== undefined && { reference:      data.reference }),
      },
      include: {
        bankAccount: {
          select: { id: true, accountNameEn: true, accountNameAr: true, accountNumber: true, currencyCode: true },
        },
        cashBox: {
          select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
        },
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update payment" });
  }
});

// ─── DELETE /api/payments/:id ─────────────────────────────────────────────────

router.delete("/:id", requirePermission("payments", "delete"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.payment as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Payment not found" });

    if (existing.status !== "DRAFT") {
      return res.status(400).json({ error: "Only DRAFT payments can be deleted" });
    }

    await (prisma.payment as any).update({
      where: { id: req.params.id },
      data:  { deletedAt: new Date() },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete payment" });
  }
});

// ─── POST /api/payments/:id/confirm ──────────────────────────────────────────

router.post("/:id/confirm", requirePermission("payments", "approve"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.payment as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Payment not found" });

    if (existing.status !== "DRAFT") {
      return res.status(400).json({ error: "Only DRAFT payments can be confirmed" });
    }

    if (!existing.bankAccountId && !existing.cashBoxId) {
      return res.status(400).json({ error: "Payment must be linked to a bank account or cash box before confirming" });
    }

    // ── GL account validation ─────────────────────────────────────────────────
    if (!existing.glAccountId) {
      return res.status(400).json({ error: "GL account is not configured." });
    }

    let cashAccountGlId: string | null = null;
    if (existing.bankAccountId) {
      const ba = await (prisma.bankAccount as any).findFirst({
        where:  { id: existing.bankAccountId },
        select: { glAccountId: true },
      });
      cashAccountGlId = ba?.glAccountId ?? null;
    } else if (existing.cashBoxId) {
      const cb = await (prisma.cashBox as any).findFirst({
        where:  { id: existing.cashBoxId },
        select: { glAccountId: true },
      });
      cashAccountGlId = cb?.glAccountId ?? null;
    }
    if (!cashAccountGlId) {
      return res.status(400).json({ error: "GL account is not configured." });
    }

    // ── Fiscal year resolution ────────────────────────────────────────────────
    const txDate     = new Date(existing.paymentDate);
    const fiscalYear = await resolveOpenFiscalYear(
      user.organizationId!,
      txDate,
      prisma as any
    );
    if (!fiscalYear) {
      return res.status(400).json({ error: "لا توجد سنة مالية مفتوحة لتاريخ السند؛ لا يمكن الترحيل إلى سنة مقفلة." });
    }

    const amountBase = Number(existing.amountBase);

    const [updated] = await prisma.$transaction(async (tx) => {
      const payment = await (tx.payment as any).update({
        where: { id: req.params.id },
        data: {
          status:      "CONFIRMED",
          confirmedAt: new Date(),
        },
        include: {
          bankAccount: {
            select: { id: true, accountNameEn: true, accountNameAr: true, accountNumber: true, currencyCode: true },
          },
          cashBox: {
            select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
          },
        },
      });

      if (existing.bankAccountId) {
        await (tx.bankAccount as any).update({
          where: { id: existing.bankAccountId },
          data:  { currentBalance: { decrement: amountBase } },
        });
      } else if (existing.cashBoxId) {
        await (tx.cashBox as any).update({
          where: { id: existing.cashBoxId },
          data:  { currentBalance: { decrement: amountBase } },
        });
      }

      // ── Auto journal entry ─────────────────────────────────────────────────
      const je = await createAutoPostedJE(
        {
          organizationId:  user.organizationId!,
          branchId:        existing.branchId ?? null,
          currencyCode:    existing.currencyCode,
          exchangeRate:    Number(existing.exchangeRate),
          entryDate:       txDate,
          descriptionEn:   `Payment confirmed: ${existing.number}`,
          descriptionAr:   `دفعة مؤكدة: ${existing.number}`,
          reference:       existing.number,
          sourceType:      "PAYMENT",
          sourceId:        existing.id,
          sourceReference: existing.number,
          createdByUserId: user.id!,
          debitAccountId:  existing.glAccountId,
          creditAccountId: cashAccountGlId!,
          amount:          Number(existing.amount),
          amountBase,
        },
        fiscalYear.id,
        tx as any
      );

      await (tx.payment as any).update({
        where: { id: req.params.id },
        data:  { journalEntryId: je.id },
      });

      return [{ ...payment, journalEntryId: je.id }];
    });

    return res.json(updated);
  } catch (err) {
    if (err instanceof AccountingPeriodError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: "Failed to confirm payment" });
  }
});

// ─── POST /api/payments/:id/void ─────────────────────────────────────────────

router.post("/:id/void", requirePermission("payments", "void"), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await getUser(clerkId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const existing = await (prisma.payment as any).findFirst({
      where: {
        id:             req.params.id,
        organizationId: user.organizationId,
        deletedAt:      null,
      },
    });
    if (!existing) return res.status(404).json({ error: "Payment not found" });

    if (existing.status !== "CONFIRMED") {
      return res.status(400).json({ error: "Only CONFIRMED payments can be voided" });
    }

    const parsed = voidSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "voidReason is required", details: parsed.error.flatten() });
    }

    // ── Load original JE for reversal ─────────────────────────────────────────
    let originalJE: any = null;
    if (existing.journalEntryId) {
      originalJE = await prisma.journalEntry.findFirst({
        where:   { id: existing.journalEntryId },
        include: { lines: true },
      });
    }

    const amountBase = Number(existing.amountBase);

    const [updated] = await prisma.$transaction(async (tx) => {
      const payment = await (tx.payment as any).update({
        where: { id: req.params.id },
        data: {
          status:     "VOIDED",
          voidedAt:   new Date(),
          voidReason: parsed.data.voidReason,
        },
        include: {
          bankAccount: {
            select: { id: true, accountNameEn: true, accountNameAr: true, accountNumber: true, currencyCode: true },
          },
          cashBox: {
            select: { id: true, nameEn: true, nameAr: true, code: true, currencyCode: true },
          },
        },
      });

      if (existing.bankAccountId) {
        await (tx.bankAccount as any).update({
          where: { id: existing.bankAccountId },
          data:  { currentBalance: { increment: amountBase } },
        });
      } else if (existing.cashBoxId) {
        await (tx.cashBox as any).update({
          where: { id: existing.cashBoxId },
          data:  { currentBalance: { increment: amountBase } },
        });
      }

      // ── Reverse journal entry ──────────────────────────────────────────────
      if (originalJE) {
        await createReversalJE(
          {
            organizationId:       user.organizationId!,
            currencyCode:         existing.currencyCode,
            exchangeRate:         Number(existing.exchangeRate),
            entryDate:            new Date(),
            descriptionEn:        `Reversal of payment void: ${existing.number}`,
            descriptionAr:        `عكس دفعة ملغاة: ${existing.number}`,
            sourceType:           "PAYMENT",
            sourceId:             existing.id,
            sourceReference:      existing.number,
            createdByUserId:      user.id!,
            originalJEId:         originalJE.id,
            originalLines:        originalJE.lines,
            originalFiscalYearId: originalJE.fiscalYearId,
            totalAmount:          amountBase,
          },
          tx as any
        );
      }

      return [payment];
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Failed to void payment" });
  }
});

export default router;
