import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { userRolesGrantingAll } from "./helpers/rbac";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), user: vi.fn(), account: vi.fn(), children: vi.fn(),
  lines: vi.fn(), update: vi.fn(), audit: vi.fn(),
}));
vi.mock("@clerk/express", () => ({ getAuth: mocks.auth }));
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.user },
    chartOfAccount: { findFirst: mocks.account, count: mocks.children, update: mocks.update },
    journalEntryLine: { count: mocks.lines },
    auditLog: { create: mocks.audit },
  },
}));
import router from "../routes/chart-of-accounts";

const app = express();
app.use(express.json());
app.use("/api/chart-of-accounts", router);
const user = { id: "TEST-user", organizationId: "TEST-org", userRoles: userRolesGrantingAll("chart_of_accounts") };
const account = { id: "TEST-account", code: "0010", nameEn: "TEST Cash", deletedAt: null };
const remove = () => request(app).delete(`/api/chart-of-accounts/${account.id}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockReturnValue({ userId: "TEST-clerk" });
  mocks.user.mockResolvedValue(user);
  mocks.account.mockResolvedValue(account);
  mocks.children.mockResolvedValue(0);
  mocks.lines.mockResolvedValue(0);
  mocks.update.mockResolvedValue(account);
  mocks.audit.mockResolvedValue({});
});

// The real route and authorization middleware run against mocked Prisma only.
describe("Chart account deletion safeguards", () => {
  it("soft-deletes an unused leaf account and records the deletion", async () => {
    const response = await remove();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mocks.account).toHaveBeenCalledWith({ where: { id: account.id, organizationId: user.organizationId, deletedAt: null } });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: account.id }, data: { deletedAt: expect.any(Date) } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DELETE", entityId: account.id }) }));
  });
  it("refuses deletion without the specific delete permission, even with accounting read access", async () => {
    mocks.user.mockResolvedValue({ ...user, userRoles: [{ role: { rolePermissions: [{ permission: { resource: "chart_of_accounts", action: "read" } }] } }] });
    expect((await remove()).status).toBe(403);
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuses a parent account without deleting its children", async () => {
    mocks.children.mockResolvedValue(2);
    const response = await remove();
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("2 sub-account(s)");
    expect(mocks.lines).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("preserves accounts referenced by journal lines", async () => {
    mocks.lines.mockResolvedValue(3);
    const response = await remove();
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("3 transaction(s)");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("returns not found for an absent, archived or out-of-organization account", async () => {
    mocks.account.mockResolvedValue(null);
    expect((await remove()).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires authentication and does not write on database failure", async () => {
    mocks.auth.mockReturnValue({ userId: null });
    expect((await remove()).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.auth.mockReturnValue({ userId: "TEST-clerk" });
    mocks.account.mockRejectedValue(new Error("TEST database failure"));
    expect((await remove()).status).toBe(500);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
