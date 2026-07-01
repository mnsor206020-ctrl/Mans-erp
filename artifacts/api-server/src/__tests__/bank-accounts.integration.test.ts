import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Mock Clerk before router import ───────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "test-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

// ── Mock Prisma before router import ──────────────────────────────────────────
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    bank: {
      findFirst: vi.fn(),
    },
    currency: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    chartOfAccount: {
      findFirst: vi.fn(),
    },
    bankAccount: {
      findMany:  vi.fn(),
      findFirst: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
  },
}));

// ── Import router after mocks ─────────────────────────────────────────────────
import bankAccountsRouter from "../routes/bank-accounts";
import { prisma } from "@workspace/prisma";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ORG_ID     = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID    = "dddddddd-0000-0000-0000-000000000004";
const BANK_ID    = "bbbbbbbb-0000-0000-0000-000000000002";
const ACCOUNT_ID = "cccccccc-0000-0000-0000-000000000003";
const BRANCH_ID  = "eeeeeeee-0000-0000-0000-000000000005";

const mockUser = {
  id:             USER_ID,
  organizationId: ORG_ID,
  clerkId:        "test-clerk-id",
  deletedAt:      null,
};

const mockBank = {
  id:       BANK_ID,
  nameEn:   "Test Bank",
  nameAr:   "بنك التجريب",
  isActive: true,
  deletedAt: null,
};

const mockCurrency = {
  code:   "SAR",
  nameEn: "Saudi Riyal",
  status: "ACTIVE",
};

const mockBranch = {
  id:             BRANCH_ID,
  organizationId: ORG_ID,
  nameEn:         "Main Branch",
  deletedAt:      null,
};

const mockAccount = {
  id:             ACCOUNT_ID,
  organizationId: ORG_ID,
  bankId:         BANK_ID,
  currencyCode:   "SAR",
  accountNumber:  "SA0000000001",
  accountNameEn:  "Main Account",
  accountNameAr:  "الحساب الرئيسي",
  type:           "CURRENT",
  openingBalance: "1000",
  currentBalance: "1000",
  isActive:       true,
  deletedAt:      null,
  createdAt:      new Date().toISOString(),
  updatedAt:      new Date().toISOString(),
  bank:           mockBank,
  branch:         null,
};

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/bank-accounts", bankAccountsRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Bank Accounts API — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst     as any).mockResolvedValue(mockUser);
    (prisma.bank.findFirst     as any).mockResolvedValue(mockBank);
    (prisma.currency.findFirst as any).mockResolvedValue(mockCurrency);
    (prisma.branch.findFirst   as any).mockResolvedValue(null);
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue(null);
  });

  // ── BA-I-01 ─────────────────────────────────────────────────────────────────
  it("BA-I-01: GET /bank-accounts returns empty data array for a new organization", async () => {
    (prisma.bankAccount.findMany as any).mockResolvedValue([]);

    const res = await request(app).get("/api/bank-accounts");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toEqual([]);
  });

  // ── BA-I-02 ─────────────────────────────────────────────────────────────────
  it("BA-I-02: POST creates a bank account with currentBalance == openingBalance", async () => {
    (prisma.bankAccount.create as any).mockResolvedValue(mockAccount);

    const res = await request(app)
      .post("/api/bank-accounts")
      .send({
        bankId:        BANK_ID,
        currencyCode:  "SAR",
        accountNumber: "SA0000000001",
        accountNameEn: "Main Account",
        accountNameAr: "الحساب الرئيسي",
        type:          "CURRENT",
        openingBalance: 1000,
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.openingBalance)).toBe(Number(res.body.currentBalance));
  });

  // ── BA-I-03 ─────────────────────────────────────────────────────────────────
  it("BA-I-03: duplicate accountNumber in same organization returns HTTP 409", async () => {
    const p2002Error = Object.assign(new Error("Unique constraint violation"), {
      code: "P2002",
      meta: { target: ["organization_id", "account_number"] },
    });
    (prisma.bankAccount.create as any).mockRejectedValue(p2002Error);

    const res = await request(app)
      .post("/api/bank-accounts")
      .send({
        bankId:        BANK_ID,
        currencyCode:  "SAR",
        accountNumber: "SA0000000001",
        accountNameEn: "Duplicate Account",
        accountNameAr: "حساب مكرر",
        type:          "CURRENT",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  // ── BA-I-04 ─────────────────────────────────────────────────────────────────
  it("BA-I-04: GET /:id returns the account including nested bank and branch", async () => {
    const accountWithBranch = { ...mockAccount, branch: mockBranch };
    (prisma.bankAccount.findFirst as any).mockResolvedValue(accountWithBranch);

    const res = await request(app).get(`/api/bank-accounts/${ACCOUNT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ACCOUNT_ID);
    expect(res.body.bank).toBeDefined();
    expect(res.body.bank.id).toBe(BANK_ID);
    expect(res.body.branch).toBeDefined();
    expect(res.body.branch.id).toBe(BRANCH_ID);
  });

  // ── BA-I-05 ─────────────────────────────────────────────────────────────────
  it("BA-I-05: unknown id returns HTTP 404", async () => {
    (prisma.bankAccount.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get("/api/bank-accounts/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── BA-I-06 ─────────────────────────────────────────────────────────────────
  it("BA-I-06: PATCH updates accountNameEn successfully", async () => {
    const updated = { ...mockAccount, accountNameEn: "Updated Account" };
    (prisma.bankAccount.findFirst as any).mockResolvedValue(mockAccount);
    (prisma.bankAccount.update   as any).mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/bank-accounts/${ACCOUNT_ID}`)
      .send({ accountNameEn: "Updated Account" });

    expect(res.status).toBe(200);
    expect(res.body.accountNameEn).toBe("Updated Account");
  });

  // ── BA-I-07 ─────────────────────────────────────────────────────────────────
  it("BA-I-07: PATCH attempting to set openingBalance returns 200 with openingBalance stripped (immutable field ignored by schema)", async () => {
    // openingBalance is stripped by the updateSchema (not an accepted field),
    // so the route continues normally and returns 200 — the value is silently ignored.
    const updated = { ...mockAccount };
    (prisma.bankAccount.findFirst as any).mockResolvedValue(mockAccount);
    (prisma.bankAccount.update   as any).mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/bank-accounts/${ACCOUNT_ID}`)
      .send({ openingBalance: 9999 });

    // The patch succeeds but openingBalance is not applied
    expect(res.status).toBe(200);
    expect(Number(res.body.openingBalance)).toBe(1000);
  });

  // ── BA-I-08 ─────────────────────────────────────────────────────────────────
  it("BA-I-08: DELETE with currentBalance == 0 performs a soft delete → 200 { ok: true }", async () => {
    const zeroBalanceAccount = { ...mockAccount, currentBalance: "0" };
    (prisma.bankAccount.findFirst as any).mockResolvedValue(zeroBalanceAccount);
    (prisma.bankAccount.update   as any).mockResolvedValue({ ...zeroBalanceAccount, deletedAt: new Date() });

    const res = await request(app).delete(`/api/bank-accounts/${ACCOUNT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const updateCall = (prisma.bankAccount.update as any).mock.calls[0][0];
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  // ── BA-I-09 ─────────────────────────────────────────────────────────────────
  it("BA-I-09: DELETE with currentBalance != 0 returns HTTP 409", async () => {
    const nonZeroAccount = { ...mockAccount, currentBalance: "1000" };
    (prisma.bankAccount.findFirst as any).mockResolvedValue(nonZeroAccount);

    const res = await request(app).delete(`/api/bank-accounts/${ACCOUNT_ID}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/non-zero balance/i);
  });

  // ── BA-I-10 ─────────────────────────────────────────────────────────────────
  it("BA-I-10: POST /toggle-active flips isActive from true to false", async () => {
    const toggled = { ...mockAccount, isActive: false };
    (prisma.bankAccount.findFirst as any).mockResolvedValue(mockAccount);
    (prisma.bankAccount.update   as any).mockResolvedValue(toggled);

    const res = await request(app).post(`/api/bank-accounts/${ACCOUNT_ID}/toggle-active`);

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    const updateCall = (prisma.bankAccount.update as any).mock.calls[0][0];
    expect(updateCall.data.isActive).toBe(false);
  });
});
