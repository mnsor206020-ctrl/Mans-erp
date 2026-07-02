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
    role: {
      findMany: vi.fn(),
    },
  },
}));

import rolesRouter from "../routes/roles";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

const USER_ID = "dddddddd-0000-0000-0000-000000000004";

const mockUser = {
  id:        USER_ID,
  clerkId:   "test-clerk-id",
  deletedAt: null,
  userRoles: userRolesGrantingAll("roles"),
};

const mockRoles = [
  { id: "role-1", nameEn: "Super Admin", nameAr: "مدير عام", isSystem: true, createdAt: new Date().toISOString() },
  { id: "role-2", nameEn: "Viewer",      nameAr: "مشاهد",    isSystem: true, createdAt: new Date().toISOString() },
];

const app = express();
app.use(express.json());
app.use("/api/roles", rolesRouter);

describe("Roles API — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.role.findMany as any).mockResolvedValue(mockRoles);
  });

  it("returns the list of roles for a user with roles:read permission", async () => {
    const res = await request(app).get("/api/roles");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].nameEn).toBe("Super Admin");
  });

  it("returns 403 for a user without roles:read permission", async () => {
    (prisma.user.findFirst as any).mockResolvedValue({ ...mockUser, userRoles: [] });

    const res = await request(app).get("/api/roles");

    expect(res.status).toBe(403);
    expect(prisma.role.findMany).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no authenticated user record", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);

    const res = await request(app).get("/api/roles");

    expect(res.status).toBe(401);
  });
});
