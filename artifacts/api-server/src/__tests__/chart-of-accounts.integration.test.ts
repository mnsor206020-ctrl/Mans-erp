import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "test-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    chartOfAccount: {
      findFirst: vi.fn(),
      findMany:  vi.fn(),
    },
    journalEntryLine: {
      count: vi.fn(),
    },
  },
}));

import chartOfAccountsRouter from "../routes/chart-of-accounts";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

const ORG_ID     = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_ID = "cccccccc-0000-0000-0000-000000000003";

const mockUser = {
  id:             "user-1",
  clerkId:        "test-clerk-id",
  organizationId: ORG_ID,
  deletedAt:      null,
  userRoles:      userRolesGrantingAll("chart_of_accounts"),
};

const app = express();
app.use(express.json());
app.use("/api/chart-of-accounts", chartOfAccountsRouter);

describe("Chart of Accounts API — organization scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
  });

  it("GET /tree — refuses to expose every organization's accounts to an unassigned user", async () => {
    (prisma.user.findFirst as any).mockResolvedValue({ ...mockUser, organizationId: null, userRoles: [] });

    const res = await request(app).get("/api/chart-of-accounts/tree");

    expect(res.status).toBe(403);
    expect(prisma.chartOfAccount.findMany).not.toHaveBeenCalled();
  });

  it("GET /tree — limits an organization member to their own accounts", async () => {
    (prisma.chartOfAccount.findMany as any).mockResolvedValue([]);

    const res = await request(app).get("/api/chart-of-accounts/tree");

    expect(res.status).toBe(200);
    expect(prisma.chartOfAccount.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, organizationId: ORG_ID },
      orderBy: [{ level: "asc" }, { code: "asc" }],
    });
  });

  it("GET /:id — account belongs to the caller's organization → 200", async () => {
    const account = { id: ACCOUNT_ID, organizationId: ORG_ID, code: "1001", nameEn: "Cash" };
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue(account);
    (prisma.journalEntryLine.count as any).mockResolvedValue(0);

    const res = await request(app).get(`/api/chart-of-accounts/${ACCOUNT_ID}`);

    expect(res.status).toBe(200);
    expect(prisma.chartOfAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ACCOUNT_ID, organizationId: ORG_ID, deletedAt: null }),
      }),
    );
  });

  it("GET /:id — account belongs to a different organization → 404, org-scoped in query", async () => {
    // The DB only returns a row when organizationId matches; a route that
    // forgot to scope by organizationId would incorrectly succeed here.
    (prisma.chartOfAccount.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get(`/api/chart-of-accounts/${ACCOUNT_ID}`);

    expect(res.status).toBe(404);
    expect(prisma.chartOfAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ACCOUNT_ID, organizationId: ORG_ID, deletedAt: null }),
      }),
    );
  });
});
