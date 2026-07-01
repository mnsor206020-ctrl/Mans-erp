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
    currency: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    chartOfAccount: {
      findFirst: vi.fn(),
    },
    cashBox: {
      findMany:  vi.fn(),
      findFirst: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
  },
}));

// ── Import router after mocks ─────────────────────────────────────────────────
import cashBoxesRouter from "../routes/cash-boxes";
import { prisma } from "@workspace/prisma";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ORG_ID      = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID     = "dddddddd-0000-0000-0000-000000000004";
const CASHBOX_ID  = "cccccccc-0000-0000-0000-000000000003";
const BRANCH_ID   = "eeeeeeee-0000-0000-0000-000000000005";

const mockUser = {
  id:             USER_ID,
  organizationId: ORG_ID,
  clerkId:        "test-clerk-id",
  deletedAt:      null,
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

const mockCashBox = {
  id:             CASHBOX_ID,
  organizationId: ORG_ID,
  currencyCode:   "SAR",
  nameEn:         "Main Cash Box",
  nameAr:         "الصندوق الرئيسي",
  code:           "CB-001",
  openingBalance: "500",
  currentBalance: "500",
  glAccountId:    null,
  branchId:       null,
  isActive:       true,
  deletedAt:      null,
  createdAt:      new Date().toISOString(),
  updatedAt:      new Date().toISOString(),
  branch:         null,
};

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/cash-boxes", cashBoxesRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Cash Boxes API — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst         as any).mockResolvedValue(mockUser);
    (prisma.currency.findFirst     as any).mockResolvedValue(mockCurrency);
    (prisma.branch.findFirst       as any).mockResolvedValue(null);
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue(null);
  });

  // ── CB-I-01 ─────────────────────────────────────────────────────────────────
  it("CB-I-01: GET /cash-boxes returns empty data array for a new organization", async () => {
    (prisma.cashBox.findMany as any).mockResolvedValue([]);

    const res = await request(app).get("/api/cash-boxes");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toEqual([]);
  });

  // ── CB-I-02 ─────────────────────────────────────────────────────────────────
  it("CB-I-02: POST creates a cash box with currentBalance == openingBalance", async () => {
    (prisma.cashBox.create as any).mockResolvedValue(mockCashBox);

    const res = await request(app)
      .post("/api/cash-boxes")
      .send({
        currencyCode:   "SAR",
        nameEn:         "Main Cash Box",
        nameAr:         "الصندوق الرئيسي",
        code:           "CB-001",
        openingBalance: 500,
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.openingBalance)).toBe(Number(res.body.currentBalance));

    const createCall = (prisma.cashBox.create as any).mock.calls[0][0];
    expect(createCall.data.currentBalance).toBe(createCall.data.openingBalance);
  });

  // ── CB-I-03 ─────────────────────────────────────────────────────────────────
  it("CB-I-03: POST with missing required field returns HTTP 400", async () => {
    const res = await request(app)
      .post("/api/cash-boxes")
      .send({ currencyCode: "SAR", nameEn: "Box", nameAr: "صندوق" });
    // code is missing
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation/i);
  });

  // ── CB-I-04 ─────────────────────────────────────────────────────────────────
  it("CB-I-04: duplicate code in same organization returns HTTP 409", async () => {
    const p2002Error = Object.assign(new Error("Unique constraint violation"), {
      code: "P2002",
      meta: { target: ["organization_id", "code"] },
    });
    (prisma.cashBox.create as any).mockRejectedValue(p2002Error);

    const res = await request(app)
      .post("/api/cash-boxes")
      .send({
        currencyCode: "SAR",
        nameEn:       "Duplicate Box",
        nameAr:       "صندوق مكرر",
        code:         "CB-001",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  // ── CB-I-05 ─────────────────────────────────────────────────────────────────
  it("CB-I-05: GET /cash-boxes/:id returns the cash box including nested branch", async () => {
    const boxWithBranch = { ...mockCashBox, branchId: BRANCH_ID, branch: mockBranch };
    (prisma.cashBox.findFirst as any).mockResolvedValue(boxWithBranch);

    const res = await request(app).get(`/api/cash-boxes/${CASHBOX_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(CASHBOX_ID);
    expect(res.body.branch).toBeDefined();
    expect(res.body.branch.id).toBe(BRANCH_ID);
  });

  // ── CB-I-06 ─────────────────────────────────────────────────────────────────
  it("CB-I-06: unknown id returns HTTP 404", async () => {
    (prisma.cashBox.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get("/api/cash-boxes/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ── CB-I-07 ─────────────────────────────────────────────────────────────────
  it("CB-I-07: PATCH updates nameEn successfully", async () => {
    const updated = { ...mockCashBox, nameEn: "Petty Cash" };
    (prisma.cashBox.findFirst as any).mockResolvedValue(mockCashBox);
    (prisma.cashBox.update   as any).mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/cash-boxes/${CASHBOX_ID}`)
      .send({ nameEn: "Petty Cash" });

    expect(res.status).toBe(200);
    expect(res.body.nameEn).toBe("Petty Cash");
  });

  // ── CB-I-08 ─────────────────────────────────────────────────────────────────
  it("CB-I-08: PATCH with openingBalance is silently stripped — returns 200 with original balance", async () => {
    (prisma.cashBox.findFirst as any).mockResolvedValue(mockCashBox);
    (prisma.cashBox.update   as any).mockResolvedValue(mockCashBox);

    const res = await request(app)
      .patch(`/api/cash-boxes/${CASHBOX_ID}`)
      .send({ openingBalance: 9999 });

    expect(res.status).toBe(200);
    expect(Number(res.body.openingBalance)).toBe(500);
  });

  // ── CB-I-09 ─────────────────────────────────────────────────────────────────
  it("CB-I-09: PATCH on non-existent id returns 404", async () => {
    (prisma.cashBox.findFirst as any).mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/cash-boxes/00000000-0000-0000-0000-000000000000`)
      .send({ nameEn: "Ghost Box" });

    expect(res.status).toBe(404);
  });

  // ── CB-I-10 ─────────────────────────────────────────────────────────────────
  it("CB-I-10: DELETE with currentBalance == 0 performs a soft delete → 200 { ok: true }", async () => {
    const zeroBalanceBox = { ...mockCashBox, currentBalance: "0" };
    (prisma.cashBox.findFirst as any).mockResolvedValue(zeroBalanceBox);
    (prisma.cashBox.update   as any).mockResolvedValue({ ...zeroBalanceBox, deletedAt: new Date() });

    const res = await request(app).delete(`/api/cash-boxes/${CASHBOX_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const updateCall = (prisma.cashBox.update as any).mock.calls[0][0];
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  // ── CB-I-11 ─────────────────────────────────────────────────────────────────
  it("CB-I-11: DELETE with currentBalance != 0 returns HTTP 409", async () => {
    const nonZeroBox = { ...mockCashBox, currentBalance: "500" };
    (prisma.cashBox.findFirst as any).mockResolvedValue(nonZeroBox);

    const res = await request(app).delete(`/api/cash-boxes/${CASHBOX_ID}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/non-zero balance/i);
  });

  // ── CB-I-12 ─────────────────────────────────────────────────────────────────
  it("CB-I-12: DELETE on non-existent id returns 404", async () => {
    (prisma.cashBox.findFirst as any).mockResolvedValue(null);

    const res = await request(app).delete(`/api/cash-boxes/00000000-0000-0000-0000-000000000000`);

    expect(res.status).toBe(404);
  });

  // ── CB-I-13 ─────────────────────────────────────────────────────────────────
  it("CB-I-13: POST /toggle-active flips isActive from true to false", async () => {
    const toggled = { ...mockCashBox, isActive: false };
    (prisma.cashBox.findFirst as any).mockResolvedValue(mockCashBox);
    (prisma.cashBox.update   as any).mockResolvedValue(toggled);

    const res = await request(app).post(`/api/cash-boxes/${CASHBOX_ID}/toggle-active`);

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    const updateCall = (prisma.cashBox.update as any).mock.calls[0][0];
    expect(updateCall.data.isActive).toBe(false);
  });

  // ── CB-I-14 ─────────────────────────────────────────────────────────────────
  it("CB-I-14: POST /toggle-active on inactive box flips it back to true", async () => {
    const inactiveBox = { ...mockCashBox, isActive: false };
    const toggled     = { ...mockCashBox, isActive: true };
    (prisma.cashBox.findFirst as any).mockResolvedValue(inactiveBox);
    (prisma.cashBox.update   as any).mockResolvedValue(toggled);

    const res = await request(app).post(`/api/cash-boxes/${CASHBOX_ID}/toggle-active`);

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);

    const updateCall = (prisma.cashBox.update as any).mock.calls[0][0];
    expect(updateCall.data.isActive).toBe(true);
  });

  // ── CB-I-15 (org scoping) ────────────────────────────────────────────────────
  it("CB-I-15: GET /cash-boxes passes organizationId filter to Prisma", async () => {
    (prisma.cashBox.findMany as any).mockResolvedValue([mockCashBox]);

    await request(app).get("/api/cash-boxes");

    const findManyCall = (prisma.cashBox.findMany as any).mock.calls[0][0];
    expect(findManyCall.where.organizationId).toBe(ORG_ID);
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  // ── CB-I-16 (currency validation) ────────────────────────────────────────────
  it("CB-I-16: POST with inactive currency returns HTTP 400", async () => {
    (prisma.currency.findFirst as any).mockResolvedValue(null); // not found / inactive

    const res = await request(app)
      .post("/api/cash-boxes")
      .send({
        currencyCode:   "XYZ",
        nameEn:         "Test Box",
        nameAr:         "صندوق تجريبي",
        code:           "CB-TEST",
        openingBalance: 0,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/currency/i);
  });
});
