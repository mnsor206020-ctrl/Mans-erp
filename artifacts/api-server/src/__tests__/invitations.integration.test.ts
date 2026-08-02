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
      update:    vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    invitation: {
      findFirst: vi.fn(),
      findMany:  vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
    userRole: {
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        const txMock = {
          userRole: { upsert: vi.fn().mockResolvedValue({}) },
          user:     { update: vi.fn().mockResolvedValue({}) },
          invitation: { update: vi.fn().mockResolvedValue({}) },
        };
        return cb(txMock);
      }
      if (Array.isArray(cb)) return Promise.all(cb.map((op) => Promise.resolve(op)));
      return cb;
    }),
  },
}));

import invitationsRouter from "../routes/invitations";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

const ORG_ID  = "aaaaaaaa-0000-0000-0000-000000000001";
const ADM_ID  = "bbbbbbbb-0000-0000-0000-000000000002";
const ROLE_ID = "cccccccc-0000-0000-0000-000000000003";
const INV_ID  = "dddddddd-0000-0000-0000-000000000004";
const TOKEN   = "eeeeeeee-0000-0000-0000-000000000005";

const mockActor = {
  id:             ADM_ID,
  clerkId:        "test-clerk-id",
  email:          "admin@example.com",
  organizationId: ORG_ID,
  status:         "ACTIVE",
  deletedAt:      null,
  userRoles:      userRolesGrantingAll("invitations"),
};

const mockRole = {
  id:        ROLE_ID,
  nameEn:    "Accountant",
  nameAr:    "محاسب",
  deletedAt: null,
};

const mockInvitation = {
  id:             INV_ID,
  email:          "newuser@example.com",
  organizationId: ORG_ID,
  roleId:         ROLE_ID,
  invitedByUserId: ADM_ID,
  token:          TOKEN,
  status:         "PENDING",
  expiresAt:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt:      new Date(),
  updatedAt:      new Date(),
  role:           mockRole,
  invitedBy: {
    id: ADM_ID, email: "admin@example.com",
    firstNameEn: "Admin", lastNameEn: "User",
  },
};

const app = express();
app.use(express.json());
app.use("/api/invitations", invitationsRouter);

// ── LIST ─────────────────────────────────────────────────────────────────────

describe("GET /invitations — list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst       as any).mockResolvedValue(mockActor);
    (prisma.invitation.findMany  as any).mockResolvedValue([mockInvitation]);
  });

  it("returns 200 with an array of invitations", async () => {
    const res = await request(app).get("/api/invitations/");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty("email");
    expect(res.body[0]).toHaveProperty("token");
  });

  it("returns 403 when actor lacks invitations:read permission", async () => {
    (prisma.user.findFirst as any).mockResolvedValueOnce({ ...mockActor, userRoles: [] });
    const res = await request(app).get("/api/invitations/");
    expect(res.status).toBe(403);
  });
});

// ── CREATE ───────────────────────────────────────────────────────────────────

describe("POST /invitations — create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockActor);
  });

  it("returns 422 for invalid (non-email) email", async () => {
    const res = await request(app)
      .post("/api/invitations/")
      .send({ email: "not-an-email", roleId: ROLE_ID });
    expect(res.status).toBe(422);
  });

  it("returns 422 for missing roleId", async () => {
    const res = await request(app)
      .post("/api/invitations/")
      .send({ email: "valid@example.com" });
    expect(res.status).toBe(422);
  });

  it("returns 409 when user is already a member", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockActor)
      .mockResolvedValueOnce({ id: "existing-user" }); // member check

    const res = await request(app)
      .post("/api/invitations/")
      .send({ email: "existing@example.com", roleId: ROLE_ID });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already a member/i);
  });

  it("returns 409 when a pending invitation already exists", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockActor)
      .mockResolvedValueOnce(null); // not a member

    (prisma.invitation.findFirst as any).mockResolvedValueOnce(mockInvitation); // pending exists

    const res = await request(app)
      .post("/api/invitations/")
      .send({ email: "newuser@example.com", roleId: ROLE_ID });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("returns 201 on successful creation", async () => {
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockActor)
      .mockResolvedValueOnce(null); // not a member

    (prisma.invitation.findFirst as any).mockResolvedValueOnce(null); // no pending invite
    (prisma.role.findFirst       as any).mockResolvedValueOnce(mockRole);
    (prisma.invitation.create    as any).mockResolvedValueOnce(mockInvitation);

    const res = await request(app)
      .post("/api/invitations/")
      .send({ email: "newuser@example.com", roleId: ROLE_ID });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("newuser@example.com");
    expect(res.body).toHaveProperty("token");
  });
});

// ── REVOKE ───────────────────────────────────────────────────────────────────

describe("DELETE /invitations/:id — revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockActor);
  });

  it("returns 404 when invitation not found", async () => {
    (prisma.invitation.findFirst as any).mockResolvedValueOnce(null);
    const res = await request(app).delete(`/api/invitations/${INV_ID}`);
    expect(res.status).toBe(404);
  });

  it("returns 409 when invitation is not PENDING", async () => {
    (prisma.invitation.findFirst as any).mockResolvedValueOnce({
      ...mockInvitation, status: "ACCEPTED",
    });
    const res = await request(app).delete(`/api/invitations/${INV_ID}`);
    expect(res.status).toBe(409);
  });

  it("returns 200 and revokes the invitation", async () => {
    (prisma.invitation.findFirst as any).mockResolvedValueOnce(mockInvitation);
    const revoked = { ...mockInvitation, status: "REVOKED", revokedAt: new Date() };
    (prisma.invitation.update as any).mockResolvedValueOnce(revoked);

    const res = await request(app).delete(`/api/invitations/${INV_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REVOKED");
  });
});

// ── ACCEPT ───────────────────────────────────────────────────────────────────

describe("POST /invitations/:token/accept — accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockActor);
  });

  it("returns 404 for unknown token", async () => {
    (prisma.invitation.findFirst as any).mockResolvedValueOnce(null);
    const res = await request(app).post(`/api/invitations/unknown-token/accept`);
    expect(res.status).toBe(404);
  });

  it("returns 410 for expired invitation", async () => {
    (prisma.invitation.findFirst as any).mockResolvedValueOnce({
      ...mockInvitation,
      status:    "PENDING",
      expiresAt: new Date(Date.now() - 1000),
    });
    (prisma.invitation.update as any).mockResolvedValueOnce({});

    const res = await request(app).post(`/api/invitations/${TOKEN}/accept`);
    expect(res.status).toBe(410);
  });

  it("returns 409 for already-accepted invitation", async () => {
    (prisma.invitation.findFirst as any).mockResolvedValueOnce({
      ...mockInvitation, status: "ACCEPTED",
    });
    const res = await request(app).post(`/api/invitations/${TOKEN}/accept`);
    expect(res.status).toBe(409);
  });

  it("returns 403 when email does not match", async () => {
    (prisma.invitation.findFirst as any).mockResolvedValueOnce({
      ...mockInvitation,
      email: "different@example.com", // actor email = "admin@example.com"
    });
    const res = await request(app).post(`/api/invitations/${TOKEN}/accept`);
    expect(res.status).toBe(403);
  });

  it("returns 200 when invitation is accepted successfully", async () => {
    (prisma.invitation.findFirst as any).mockResolvedValueOnce({
      ...mockInvitation,
      email: "admin@example.com", // matches actor email
    });

    const updatedUser = { ...mockActor, userRoles: [{ roleId: ROLE_ID, role: mockRole }] };
    // After transaction, user is re-fetched
    (prisma.user.findFirst as any)
      .mockResolvedValueOnce(mockActor)    // requirePermission / currentUser load
      .mockResolvedValueOnce(updatedUser); // final user fetch at end of handler

    const res = await request(app).post(`/api/invitations/${TOKEN}/accept`);
    expect(res.status).toBe(200);
  });
});
