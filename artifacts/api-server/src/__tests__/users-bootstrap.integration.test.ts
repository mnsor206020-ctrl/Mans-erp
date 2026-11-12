import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (req: any) => ({ userId: req.headers["x-user-id"] ?? "owner-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
  clerkClient:     { users: { getUser: vi.fn() } },
}));

vi.mock("@workspace/prisma", () => ({
  prisma: {
    user:         { findUnique: vi.fn(), findFirst: vi.fn() },
    role:         { findFirst: vi.fn(), findMany: vi.fn() },
    userRole:     {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    initialSuperAdminClaim: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../lib/authorize", async () => {
  const actual = await vi.importActual<any>("../lib/authorize");
  return {
    ...actual,
    getCurrentUserWithRoles: vi.fn().mockResolvedValue(null),
    requirePermission: () => (req: any, _res: any, next: any) => {
      req.currentUser = {
        id: "admin-user",
        email: "admin@example.com",
        userRoles: [{ role: { nameEn: "Super Admin" } }],
      };
      next();
    },
  };
});

import usersRouter from "../routes/users";
import { prisma } from "@workspace/prisma";
import { clerkClient } from "@clerk/express";

const app = express();
app.use(express.json());
app.use("/api/users", usersRouter);

describe("GET /users/me — bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INITIAL_SUPER_ADMIN_EMAIL", "owner@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setupTransactionalMocks() {
    const users = new Map<string, { id: string; clerkId: string; email: string }>();
    const grants: Array<{ userId: string; roleId: string }> = [];
    const claims = new Map<number, { id: number; userId: string; status: "CLAIMED" | "REVOKED" }>();
    let nextId = 1;
    const superAdminRole = { id: "role-super-admin", nameEn: "Super Admin" };

    (prisma.user.findUnique as any).mockImplementation(
      ({ where }: { where: { clerkId: string } }) => Promise.resolve(users.get(where.clerkId) ?? null),
    );
    (prisma.$transaction as any).mockImplementation(
      async (fnOrOperations: any) => {
        if (Array.isArray(fnOrOperations)) return Promise.all(fnOrOperations);
        return fnOrOperations({
          user: {
            upsert: async ({ where, create }: any) => {
              const existing = users.get(where.clerkId);
              if (existing) return existing;
              const created = { id: `user-${nextId++}`, ...create };
              users.set(created.clerkId, created);
              return created;
            },
          },
          role: { findFirst: vi.fn().mockResolvedValue(superAdminRole) },
          userRole: {
            upsert: async ({ create }: any) => {
              if (!grants.some((grant) => grant.userId === create.userId && grant.roleId === create.roleId)) {
                grants.push(create);
              }
              return create;
            },
          },
          initialSuperAdminClaim: {
            createMany: async ({ data }: any) => {
              let count = 0;
              for (const claim of data) {
                if (!claims.has(claim.id)) {
                  claims.set(claim.id, claim);
                  count += 1;
                }
              }
              return { count };
            },
            findUnique: async ({ where }: any) => claims.get(where.id) ?? null,
            updateMany: async ({ where, data }: any) => {
              const claim = claims.get(where.id);
              if (claim && claim.userId === where.userId && claim.status === where.status) {
                Object.assign(claim, data);
                return { count: 1 };
              }
              return { count: 0 };
            },
          },
        });
      },
    );
    (clerkClient.users.getUser as any).mockImplementation(async (clerkId: string) => {
      if (clerkId === "owner-clerk-id") {
        return {
          primaryEmailAddress: { emailAddress: "owner@example.com" },
          emailAddresses: [
            { emailAddress: "owner@example.com", verification: { status: "verified" } },
          ],
        };
      }
      return {
        primaryEmailAddress: { emailAddress: `${clerkId}@example.com` },
        emailAddresses: [
          { emailAddress: `${clerkId}@example.com`, verification: { status: "verified" } },
        ],
      };
    });
    return { users, grants, superAdminRole, claims };
  }

  it("grants the configured verified owner, not whichever account signs up first", async () => {
    const { users, grants, superAdminRole } = setupTransactionalMocks();

    const [first, second] = await Promise.all([
      request(app).get("/api/users/me").set("x-user-id", "attacker-clerk-id"),
      request(app).get("/api/users/me").set("x-user-id", "owner-clerk-id"),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(grants).toEqual([
      { userId: users.get("owner-clerk-id")?.id, roleId: superAdminRole.id },
    ]);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("does not grant Super Admin when the configured email is unverified", async () => {
    const { grants } = setupTransactionalMocks();
    (clerkClient.users.getUser as any).mockResolvedValue({
      primaryEmailAddress: { emailAddress: "owner@example.com" },
      emailAddresses: [
        { emailAddress: "owner@example.com", verification: { status: "unverified" } },
      ],
    });

    const res = await request(app).get("/api/users/me").set("x-user-id", "unverified-clerk-id");

    expect(res.status).toBe(200);
    expect(grants).toEqual([]);
  });

  it("does not re-grant privileges to an existing local user", async () => {
    const existingUser = { id: "user-existing", clerkId: "owner-clerk-id", email: "owner@example.com" };
    (prisma.user.findUnique as any).mockResolvedValue(existingUser);

    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(clerkClient.users.getUser).not.toHaveBeenCalled();
  });

  it("allows an existing owner to claim once after Clerk verifies the configured email", async () => {
    const { users, grants, claims, superAdminRole } = setupTransactionalMocks();
    users.set("owner-clerk-id", {
      id: "user-existing",
      clerkId: "owner-clerk-id",
      email: "owner@example.com",
    });

    const firstClaim = await request(app)
      .post("/api/users/me/claim-initial-admin")
      .set("x-user-id", "owner-clerk-id");
    const replay = await request(app)
      .post("/api/users/me/claim-initial-admin")
      .set("x-user-id", "owner-clerk-id");
    const profile = await request(app).get("/api/users/me").set("x-user-id", "owner-clerk-id");

    expect(firstClaim.status).toBe(200);
    expect(firstClaim.body).toEqual({ claimed: true });
    expect(replay.status).toBe(409);
    expect(profile.status).toBe(200);
    expect(claims.get(1)).toMatchObject({ userId: "user-existing", status: "CLAIMED" });
    expect(grants).toEqual([{ userId: "user-existing", roleId: superAdminRole.id }]);
  });

  it("does not allow an unverified owner email to claim access", async () => {
    const { users, claims, grants } = setupTransactionalMocks();
    users.set("owner-clerk-id", {
      id: "user-existing",
      clerkId: "owner-clerk-id",
      email: "owner@example.com",
    });
    (clerkClient.users.getUser as any).mockResolvedValue({
      primaryEmailAddress: { emailAddress: "owner@example.com" },
      emailAddresses: [
        { emailAddress: "owner@example.com", verification: { status: "unverified" } },
      ],
    });

    const res = await request(app)
      .post("/api/users/me/claim-initial-admin")
      .set("x-user-id", "owner-clerk-id");

    expect(res.status).toBe(403);
    expect(claims.size).toBe(0);
    expect(grants).toEqual([]);
  });

  it("does not replay a revoked claim from a profile request", async () => {
    const { users, claims, grants } = setupTransactionalMocks();
    users.set("owner-clerk-id", {
      id: "user-existing",
      clerkId: "owner-clerk-id",
      email: "owner@example.com",
    });
    claims.set(1, { id: 1, userId: "user-existing", status: "REVOKED" });

    const profile = await request(app).get("/api/users/me").set("x-user-id", "owner-clerk-id");
    const replay = await request(app)
      .post("/api/users/me/claim-initial-admin")
      .set("x-user-id", "owner-clerk-id");

    expect(profile.status).toBe(200);
    expect(replay.status).toBe(409);
    expect(claims.get(1)?.status).toBe("REVOKED");
    expect(grants).toEqual([]);
  });

  it("revokes the one-time claim when Super Admin is removed and never restores it from the profile", async () => {
    const { users, claims, grants } = setupTransactionalMocks();
    const owner = {
      id: "user-existing",
      clerkId: "owner-clerk-id",
      email: "owner@example.com",
      deletedAt: null,
    };
    users.set("owner-clerk-id", owner);
    const claimed = await request(app)
      .post("/api/users/me/claim-initial-admin")
      .set("x-user-id", "owner-clerk-id");
    expect(claimed.status).toBe(200);

    (prisma.user.findFirst as any).mockResolvedValue(owner);
    (prisma.role.findFirst as any).mockResolvedValue({
      id: "role-super-admin",
      nameEn: "Super Admin",
      deletedAt: null,
    });
    (prisma.userRole.findFirst as any).mockResolvedValue({ id: "assignment-1" });
    (prisma.userRole.count as any).mockResolvedValue(1);
    (prisma.userRole.delete as any).mockResolvedValue({});
    (prisma.initialSuperAdminClaim.updateMany as any).mockImplementation(async ({ where, data }: any) => {
      const claim = claims.get(where.id);
      if (claim && claim.userId === where.userId && claim.status === where.status) {
        Object.assign(claim, data);
        return { count: 1 };
      }
      return { count: 0 };
    });

    const removed = await request(app).delete("/api/users/user-existing/roles/role-super-admin");
    const profile = await request(app).get("/api/users/me").set("x-user-id", "owner-clerk-id");
    const replay = await request(app)
      .post("/api/users/me/claim-initial-admin")
      .set("x-user-id", "owner-clerk-id");

    expect(removed.status).toBe(200);
    expect(claims.get(1)?.status).toBe("REVOKED");
    expect(profile.status).toBe(200);
    expect(replay.status).toBe(409);
    expect(grants).toHaveLength(1);
  });

  it("revokes the one-time claim when all roles are replaced without Super Admin", async () => {
    const { users, claims } = setupTransactionalMocks();
    const superAdminRole = { id: "role-super-admin", nameEn: "Super Admin" };
    const owner = {
      id: "user-existing",
      clerkId: "owner-clerk-id",
      email: "owner@example.com",
      deletedAt: null,
      userRoles: [{ roleId: superAdminRole.id, role: superAdminRole }],
    };
    users.set("owner-clerk-id", owner);
    const claimed = await request(app)
      .post("/api/users/me/claim-initial-admin")
      .set("x-user-id", "owner-clerk-id");
    expect(claimed.status).toBe(200);

    (prisma.user.findFirst as any).mockResolvedValue(owner);
    (prisma.role.findMany as any).mockResolvedValue([]);
    (prisma.initialSuperAdminClaim.updateMany as any).mockImplementation(async ({ where, data }: any) => {
      const claim = claims.get(where.id);
      if (claim && claim.userId === where.userId && claim.status === where.status) {
        Object.assign(claim, data);
        return { count: 1 };
      }
      return { count: 0 };
    });

    const replaced = await request(app)
      .patch("/api/users/user-existing/roles")
      .send({ roleIds: [] });

    expect(replaced.status).toBe(200);
    expect(claims.get(1)?.status).toBe("REVOKED");
    expect(prisma.initialSuperAdminClaim.updateMany).toHaveBeenCalled();
  });
});
