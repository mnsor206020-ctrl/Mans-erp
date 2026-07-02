import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Clerk before importing the module under test ─────────────────────────
const mockGetAuth = vi.fn();
vi.mock("@clerk/express", () => ({
  getAuth: (...args: any[]) => mockGetAuth(...args),
}));

// ── Mock Prisma before importing the module under test ─────────────────────────
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@workspace/prisma";
import { getPermissionSet, hasPermission, requirePermission } from "../lib/authorize";

function roleWith(...permissions: Array<{ resource: string; action: string }>) {
  return [
    {
      role: {
        rolePermissions: permissions.map((permission) => ({ permission })),
      },
    },
  ];
}

describe("getPermissionSet", () => {
  it("returns an empty set for a user with no roles", () => {
    expect(getPermissionSet({ userRoles: [] }).size).toBe(0);
    expect(getPermissionSet(null).size).toBe(0);
    expect(getPermissionSet(undefined).size).toBe(0);
  });

  it("flattens all role permissions into resource:action strings", () => {
    const user = {
      userRoles: roleWith(
        { resource: "journal_entries", action: "create" },
        { resource: "journal_entries", action: "approve" },
      ),
    };
    const permissions = getPermissionSet(user as any);
    expect(permissions.has("journal_entries:create")).toBe(true);
    expect(permissions.has("journal_entries:approve")).toBe(true);
    expect(permissions.has("journal_entries:delete")).toBe(false);
  });

  it("merges permissions across multiple assigned roles", () => {
    const user = {
      userRoles: [
        ...roleWith({ resource: "receipts", action: "create" }),
        ...roleWith({ resource: "payments", action: "void" }),
      ],
    };
    const permissions = getPermissionSet(user as any);
    expect(permissions.has("receipts:create")).toBe(true);
    expect(permissions.has("payments:void")).toBe(true);
  });
});

describe("hasPermission", () => {
  it("returns true when the permission is granted", () => {
    const user = { userRoles: roleWith({ resource: "roles", action: "read" }) };
    expect(hasPermission(user as any, "roles", "read")).toBe(true);
  });

  it("returns false when the permission is not granted", () => {
    const user = { userRoles: roleWith({ resource: "roles", action: "read" }) };
    expect(hasPermission(user as any, "roles", "update" as any)).toBe(false);
  });

  it("returns false for a user with no roles at all", () => {
    expect(hasPermission({ userRoles: [] } as any, "receipts", "create")).toBe(false);
  });
});

describe("requirePermission middleware", () => {
  const mockReq = {} as any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it("responds 401 when there is no authenticated clerk user", async () => {
    mockGetAuth.mockReturnValue({ userId: null });

    await requirePermission("receipts", "create")(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("responds 401 when the clerk user has no matching local user record", async () => {
    mockGetAuth.mockReturnValue({ userId: "clerk-1" });
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await requirePermission("receipts", "create")(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("responds 403 when the user lacks the required permission", async () => {
    mockGetAuth.mockReturnValue({ userId: "clerk-1" });
    (prisma.user.findFirst as any).mockResolvedValue({
      id: "u1",
      userRoles: roleWith({ resource: "receipts", action: "read" }),
    });

    await requirePermission("receipts", "create")(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("attaches currentUser and calls next() when the permission is granted", async () => {
    mockGetAuth.mockReturnValue({ userId: "clerk-1" });
    const user = { id: "u1", userRoles: roleWith({ resource: "receipts", action: "create" }) };
    (prisma.user.findFirst as any).mockResolvedValue(user);

    await requirePermission("receipts", "create")(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockReq.currentUser).toEqual(user);
  });

  it("responds 500 when the permission check throws", async () => {
    mockGetAuth.mockReturnValue({ userId: "clerk-1" });
    (prisma.user.findFirst as any).mockRejectedValue(new Error("db down"));

    await requirePermission("receipts", "create")(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
