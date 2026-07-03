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
    organization: {
      create:    vi.fn(),
      update:    vi.fn(),
      findFirst: vi.fn(),
    },
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
    (prisma.organization.create as any).mockResolvedValue(created);

    const res = await request(app)
      .post("/api/organizations")
      .send({ nameEn: "Test Org", nameAr: "منظمة", type: "CHARITY" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: { nameEn: "Test Org", nameAr: "منظمة", type: "CHARITY" },
    });
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
});
