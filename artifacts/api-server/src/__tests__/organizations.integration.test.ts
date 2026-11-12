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
    organization: {
      create:    vi.fn(),
      update:    vi.fn(),
      findFirst: vi.fn(),
      findMany:  vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    userRole: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import organizationsRouter from "../routes/organizations";
import { prisma } from "@workspace/prisma";
import { userRolesGrantingAll } from "./helpers/rbac";

const OWN_ORG_ID   = "org-own";
const OTHER_ORG_ID = "org-other";

const mockUser = {
  id:        "user-1",
  clerkId:   "test-clerk-id",
  deletedAt: null,
  userRoles: userRolesGrantingAll("organizations"),
};

const mockRegularUser = {
  ...mockUser,
  organizationId: OWN_ORG_ID,
};

const mockUnassignedUser = {
  ...mockUser,
  organizationId: null,
};

const mockSuperAdminUser = {
  ...mockUser,
  organizationId: OWN_ORG_ID,
  userRoles: [
    { role: { nameEn: "Super Admin", rolePermissions: userRolesGrantingAll("organizations")[0].role.rolePermissions } },
  ],
};

const app = express();
app.use(express.json());
app.use("/api/organizations", organizationsRouter);

describe("Organizations API — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.$transaction as any).mockImplementation((work: (tx: unknown) => unknown) =>
      work({
        organization: prisma.organization,
        role: prisma.role,
        user: prisma.user,
        userRole: prisma.userRole,
      }),
    );
  });

  it("POST / returns 400 with details when required fields are missing", async () => {
    const res = await request(app).post("/api/organizations").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation failed/i);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it("POST / returns 400 when type is not one of the allowed enum values", async () => {
    const res = await request(app)
      .post("/api/organizations")
      .send({ nameEn: "Test Org", nameAr: "منظمة", type: "NOT_A_TYPE" });

    expect(res.status).toBe(400);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it("POST / creates the organization when the body is valid", async () => {
    const created = { id: "org-1", nameEn: "Test Org", nameAr: "منظمة", type: "CHARITY" };
    (prisma.user.findFirst as any).mockResolvedValue(mockRegularUser);
    (prisma.organization.create as any).mockResolvedValue(created);

    const res = await request(app)
      .post("/api/organizations")
      .send({ nameEn: "Test Org", nameAr: "منظمة", type: "CHARITY" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: { nameEn: "Test Org", nameAr: "منظمة", type: "CHARITY" },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("POST / atomically links an unassigned creator as Organization Admin", async () => {
    const created = { id: "org-new", nameEn: "New Org", nameAr: "منظمة جديدة", type: "CHARITY" };
    (prisma.user.findFirst as any).mockResolvedValue(mockUnassignedUser);
    (prisma.role.findFirst as any)
      .mockResolvedValueOnce({ id: "organization-admin-role" })
      .mockResolvedValueOnce({ id: "accountant-role" });
    (prisma.organization.create as any).mockResolvedValue(created);

    const res = await request(app)
      .post("/api/organizations")
      .send({ nameEn: "New Org", nameAr: "منظمة جديدة", type: "CHARITY" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(prisma.role.findFirst).toHaveBeenCalledWith({
      where: { nameEn: "Organization Admin", deletedAt: null },
      select: { id: true },
    });
    expect(prisma.role.findFirst).toHaveBeenNthCalledWith(2, {
      where: { nameEn: "Accountant", deletedAt: null },
      select: { id: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { organizationId: "org-new" },
    });
    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_roleId: { userId: "user-1", roleId: "organization-admin-role" } },
      create: { userId: "user-1", roleId: "organization-admin-role" },
      update: {},
    });
    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_roleId: { userId: "user-1", roleId: "accountant-role" } },
      create: { userId: "user-1", roleId: "accountant-role" },
      update: {},
    });
  });

  it("POST / creates no organization if a required creator role is missing", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockUnassignedUser);
    (prisma.role.findFirst as any)
      .mockResolvedValueOnce({ id: "organization-admin-role" })
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/api/organizations")
      .send({ nameEn: "New Org", nameAr: "منظمة جديدة", type: "CHARITY" });

    expect(res.status).toBe(500);
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("POST / still denies organization creation without the existing permission", async () => {
    (prisma.user.findFirst as any).mockResolvedValue({ ...mockRegularUser, userRoles: [] });

    const res = await request(app)
      .post("/api/organizations")
      .send({ nameEn: "New Org", nameAr: "منظمة جديدة", type: "CHARITY" });

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it("PATCH /:id returns 400 when type is invalid", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockRegularUser);

    const res = await request(app)
      .patch(`/api/organizations/${OWN_ORG_ID}`)
      .send({ type: "NOT_A_TYPE" });

    expect(res.status).toBe(400);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it("PATCH /:id updates the organization when the body is valid", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockRegularUser);
    const updated = { id: OWN_ORG_ID, nameEn: "Updated Org" };
    (prisma.organization.update as any).mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/organizations/${OWN_ORG_ID}`)
      .send({ nameEn: "Updated Org" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });
});

describe("Organizations API — cross-organization access scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /:id — regular user requesting their own organization → 200", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockRegularUser);
    (prisma.organization.findFirst as any).mockResolvedValue({ id: OWN_ORG_ID, nameEn: "My Org" });

    const res = await request(app).get(`/api/organizations/${OWN_ORG_ID}`);

    expect(res.status).toBe(200);
  });

  it("GET /:id — regular user requesting a different organization → 404, no DB lookup performed", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockRegularUser);

    const res = await request(app).get(`/api/organizations/${OTHER_ORG_ID}`);

    expect(res.status).toBe(404);
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it("GET /:id — Super Admin requesting a different organization → 200 (platform admin bypass)", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockSuperAdminUser);
    (prisma.organization.findFirst as any).mockResolvedValue({ id: OTHER_ORG_ID, nameEn: "Other Org" });

    const res = await request(app).get(`/api/organizations/${OTHER_ORG_ID}`);

    expect(res.status).toBe(200);
  });

  it("PATCH /:id — regular user modifying a different organization → 404, no update performed", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockRegularUser);

    const res = await request(app)
      .patch(`/api/organizations/${OTHER_ORG_ID}`)
      .send({ nameEn: "Hacked Name" });

    expect(res.status).toBe(404);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it("PATCH /:id — Super Admin modifying a different organization → 200 (platform admin bypass)", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockSuperAdminUser);
    (prisma.organization.update as any).mockResolvedValue({ id: OTHER_ORG_ID, nameEn: "Renamed" });

    const res = await request(app)
      .patch(`/api/organizations/${OTHER_ORG_ID}`)
      .send({ nameEn: "Renamed" });

    expect(res.status).toBe(200);
  });

  it("GET / — regular user only sees their own organization, scoped in the query", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockRegularUser);
    (prisma.organization.findMany as any).mockResolvedValue([{ id: OWN_ORG_ID, nameEn: "My Org" }]);

    const res = await request(app).get("/api/organizations");

    expect(res.status).toBe(200);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: OWN_ORG_ID, deletedAt: null }),
      }),
    );
  });

  it("GET / — Super Admin sees all organizations, no id filter applied", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(mockSuperAdminUser);
    (prisma.organization.findMany as any).mockResolvedValue([
      { id: OWN_ORG_ID, nameEn: "My Org" },
      { id: OTHER_ORG_ID, nameEn: "Other Org" },
    ]);

    const res = await request(app).get("/api/organizations");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const whereArg = (prisma.organization.findMany as any).mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("id");
  });
});
