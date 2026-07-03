import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "new-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

vi.mock("@workspace/prisma", () => ({
  prisma: {
    user:         { findUnique: vi.fn(), count: vi.fn() },
    role:         { findFirst: vi.fn() },
    userRole:     { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../lib/authorize", async () => {
  const actual = await vi.importActual<any>("../lib/authorize");
  return {
    ...actual,
    getCurrentUserWithRoles: vi.fn().mockResolvedValue(null),
  };
});

import usersRouter from "../routes/users";
import { prisma } from "@workspace/prisma";

const app = express();
app.use(express.json());
app.use("/api/users", usersRouter);

describe("GET /users/me — bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the user and grants Super Admin inside a single transaction when it is the first user", async () => {
    const createdUser = { id: "user-1", clerkId: "new-clerk-id", email: "" };
    const superAdminRole = { id: "role-super-admin", nameEn: "Super Admin" };

    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.count as any).mockResolvedValue(0);
    (prisma.role.findFirst as any).mockResolvedValue(superAdminRole);

    const txUserCreate = vi.fn().mockResolvedValue(createdUser);
    const txUserRoleCreate = vi.fn().mockResolvedValue({});
    (prisma.$transaction as any).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user: { create: txUserCreate }, userRole: { create: txUserRoleCreate } }),
    );

    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txUserCreate).toHaveBeenCalledWith({ data: { clerkId: "new-clerk-id", email: "" } });
    expect(txUserRoleCreate).toHaveBeenCalledWith({
      data: { userId: createdUser.id, roleId: superAdminRole.id },
    });
  });

  it("creates the user without a role when it is not the first user", async () => {
    const createdUser = { id: "user-2", clerkId: "new-clerk-id", email: "" };

    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.count as any).mockResolvedValue(3);

    const txUserCreate = vi.fn().mockResolvedValue(createdUser);
    const txUserRoleCreate = vi.fn().mockResolvedValue({});
    (prisma.$transaction as any).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user: { create: txUserCreate }, userRole: { create: txUserRoleCreate } }),
    );

    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(200);
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
    expect(txUserRoleCreate).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does not bootstrap a new user when one already exists", async () => {
    const existingUser = { id: "user-3", clerkId: "new-clerk-id", email: "a@b.com" };
    (prisma.user.findUnique as any).mockResolvedValue(existingUser);

    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
