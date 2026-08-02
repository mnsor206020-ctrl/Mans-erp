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
      findMany:   vi.fn(),
      count:      vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
      findMany:  vi.fn(),
    },
    userRole: {
      findFirst:  vi.fn(),
      create:     vi.fn(),
      delete:     vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      count:      vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (ops: any) => {
      if (Array.isArray(ops)) return Promise.all(ops.map((op) => Promise.resolve(op)));
      return ops({ user: { update: vi.fn() }, userRole: { upsert: vi.fn() }, invitation: { update: vi.fn() } });
    }),
  },
}));

import usersRouter from "../routes/users";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

const ADMIN_ID           = "aaaaaaaa-0000-0000-0000-000000000001";
const TARGET_ID          = "bbbbbbbb-0000-0000-0000-000000000002";
const ROLE_ID            = "cccccccc-0000-0000-0000-000000000003";
const SUPER_ADMIN_ROLE_ID = "dddddddd-0000-0000-0000-000000000004";

const mockAdmin = {
  id:             ADMIN_ID,
  clerkId:        "test-clerk-id",
  email:          "admin@example.com",
  organizationId: "org-1",
  status:         "ACTIVE",
  deletedAt:      null,
  userRoles:      userRolesGrantingAll("users"),
};

const mockTargetUser = {
  id:             TARGET_ID,
  clerkId:        "target-clerk-id",
  email:          "target@example.com",
  organizationId: "org-1",
  status:         "ACTIVE",
  deletedAt:      null,
  userRoles:      [],
};

const mockRole = {
  id:        ROLE_ID,
  nameEn:    "Accountant",
  nameAr:    "محاسب",
  deletedAt: null,
};

const app = express();
app.use(express.json());
app.use("/api/users", usersRouter);

// ── LIST USERS ──────────────────────────────────────────────────────────────

describe("GET /users — list users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockAdmin);
    (prisma.$transaction as any).mockResolvedValue([[mockTargetUser], 1]);
  });

  it("returns 200 with paginated data structure", async () => {
    const res = await request(app).get("/api/users/");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("limit");
  });

  it("rejects invalid status param with 422", async () => {
    const res = await request(app).get("/api/users/?status=INVALID");
    expect(res.status).toBe(422);
  });

  it("accepts valid status filter", async () => {
    const res = await request(app).get("/api/users/?status=ACTIVE");
    expect(res.status).toBe(200);
  });
});

// ── GET USER DETAIL ─────────────────────────────────────────────────────────

describe("GET /users/:id — get user detail", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 200 when user found", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockAdmin)
      .mockResolvedValueOnce({ ...mockTargetUser, userRoles: [], organization: null });

    const res = await request(app).get(`/api/users/${TARGET_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TARGET_ID);
  });

  it("returns 404 when user not found", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockAdmin)
      .mockResolvedValueOnce(null);

    const res = await request(app).get(`/api/users/${TARGET_ID}`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when actor lacks read permission", async () => {
    (prisma.user.findFirst as any).mockResolvedValueOnce({ ...mockAdmin, userRoles: [] });

    const res = await request(app).get(`/api/users/${TARGET_ID}`);
    expect(res.status).toBe(403);
  });
});

// ── UPDATE STATUS ───────────────────────────────────────────────────────────

describe("PATCH /users/:id/status — status update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockAdmin);
  });

  it("returns 422 for invalid status value", async () => {
    const res = await request(app)
      .patch(`/api/users/${TARGET_ID}/status`)
      .send({ status: "DELETED" });
    expect(res.status).toBe(422);
  });

  it("returns 409 when actor tries to change their own status", async () => {
    const res = await request(app)
      .patch(`/api/users/${ADMIN_ID}/status`)
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(409);
  });

  it("returns 200 and updates status", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockAdmin)
      .mockResolvedValueOnce(mockTargetUser);

    const updated = { ...mockTargetUser, status: "INACTIVE", userRoles: [] };
    (prisma.user.update as any).mockResolvedValueOnce(updated);

    const res = await request(app)
      .patch(`/api/users/${TARGET_ID}/status`)
      .send({ status: "INACTIVE" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("INACTIVE");
  });
});

// ── ASSIGN SINGLE ROLE ──────────────────────────────────────────────────────

describe("POST /users/:id/roles/:roleId — assign single role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockAdmin);
  });

  it("returns 404 when role not found", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockAdmin)
      .mockResolvedValueOnce(mockTargetUser);
    (prisma.role.findFirst    as any).mockResolvedValueOnce(null);

    const res = await request(app).post(`/api/users/${TARGET_ID}/roles/${ROLE_ID}`);
    expect(res.status).toBe(404);
  });

  it("returns 409 when user already has role", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockAdmin)
      .mockResolvedValueOnce(mockTargetUser);
    (prisma.role.findFirst    as any).mockResolvedValueOnce(mockRole);
    (prisma.userRole.findFirst as any).mockResolvedValueOnce({ id: "existing" });

    const res = await request(app).post(`/api/users/${TARGET_ID}/roles/${ROLE_ID}`);
    expect(res.status).toBe(409);
  });
});

// ── REMOVE SINGLE ROLE ──────────────────────────────────────────────────────

describe("DELETE /users/:id/roles/:roleId — remove single role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockAdmin);
  });

  it("returns 404 when assignment not found", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockAdmin)
      .mockResolvedValueOnce(mockTargetUser);
    (prisma.role.findFirst    as any).mockResolvedValueOnce(mockRole);
    (prisma.userRole.findFirst as any).mockResolvedValueOnce(null);

    const res = await request(app).delete(`/api/users/${TARGET_ID}/roles/${ROLE_ID}`);
    expect(res.status).toBe(404);
  });

  it("returns 409 — actor cannot remove own last admin role", async () => {
    const superAdminRole = { id: SUPER_ADMIN_ROLE_ID, nameEn: "Super Admin", deletedAt: null };

    // Actor IS the target (self-demotion)
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce({ ...mockAdmin, id: ADMIN_ID })  // requirePermission
      .mockResolvedValueOnce({ ...mockAdmin, id: ADMIN_ID }); // find target (same ID)

    (prisma.role.findFirst    as any).mockResolvedValueOnce(superAdminRole);
    (prisma.userRole.findFirst as any).mockResolvedValueOnce({ id: "assignment-1" });
    // remaining admin roles = 0 → self-demotion guard triggers
    (prisma.userRole.count    as any).mockResolvedValueOnce(0);

    const res = await request(app)
      .delete(`/api/users/${ADMIN_ID}/roles/${SUPER_ADMIN_ROLE_ID}`);
    expect(res.status).toBe(409);
  });
});
