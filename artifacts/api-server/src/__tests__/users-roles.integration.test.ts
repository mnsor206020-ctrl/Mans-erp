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
      findUnique: vi.fn(),
      findFirst:  vi.fn(),
      count:      vi.fn(),
      create:     vi.fn(),
      findMany:   vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
      findMany:  vi.fn(),
    },
    userRole: {
      create:     vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (ops: any[]) => Promise.all(ops)),
  },
}));

import usersRouter from "../routes/users";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

const ADMIN_ID  = "dddddddd-0000-0000-0000-000000000004";
const TARGET_ID = "eeeeeeee-0000-0000-0000-000000000005";
const ROLE_ID   = "ffffffff-0000-0000-0000-000000000006";

const mockAdmin = {
  id:        ADMIN_ID,
  clerkId:   "test-clerk-id",
  deletedAt: null,
  userRoles: userRolesGrantingAll("users"),
};

const mockTargetUser = { id: TARGET_ID, clerkId: "target-clerk-id", deletedAt: null, userRoles: [] };
const mockRole       = { id: ROLE_ID, nameEn: "Accountant", deletedAt: null };

const app = express();
app.use(express.json());
app.use("/api/users", usersRouter);

describe("PATCH /users/:id/roles — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockImplementation((args: any) =>
      args?.where?.id === TARGET_ID ? Promise.resolve(mockTargetUser) : Promise.resolve(mockAdmin),
    );
    (prisma.role.findMany as any).mockResolvedValue([mockRole]);
  });

  it("assigns roles to a user when the caller has users:update permission", async () => {
    const res = await request(app)
      .patch(`/api/users/${TARGET_ID}/roles`)
      .send({ roleIds: [ROLE_ID] });

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
  });

  it("returns 403 when the caller lacks users:update permission", async () => {
    (prisma.user.findFirst as any).mockImplementation((args: any) =>
      args?.where?.id === TARGET_ID
        ? Promise.resolve(mockTargetUser)
        : Promise.resolve({ ...mockAdmin, userRoles: [] }),
    );

    const res = await request(app)
      .patch(`/api/users/${TARGET_ID}/roles`)
      .send({ roleIds: [ROLE_ID] });

    expect(res.status).toBe(403);
    expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user does not exist", async () => {
    (prisma.user.findFirst as any).mockImplementation((args: any) =>
      args?.where?.id === TARGET_ID ? Promise.resolve(null) : Promise.resolve(mockAdmin),
    );

    const res = await request(app)
      .patch(`/api/users/${TARGET_ID}/roles`)
      .send({ roleIds: [ROLE_ID] });

    expect(res.status).toBe(404);
  });

  it("returns 400 when one of the role ids does not exist", async () => {
    (prisma.role.findMany as any).mockResolvedValue([]);

    const res = await request(app)
      .patch(`/api/users/${TARGET_ID}/roles`)
      .send({ roleIds: [ROLE_ID] });

    expect(res.status).toBe(400);
  });

  it("returns 422 on invalid request body", async () => {
    const res = await request(app)
      .patch(`/api/users/${TARGET_ID}/roles`)
      .send({ roleIds: "not-an-array" });

    expect(res.status).toBe(422);
  });
});
