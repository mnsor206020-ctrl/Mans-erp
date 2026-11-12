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
    user:         { findUnique: vi.fn() },
    role:         { findFirst: vi.fn() },
    userRole:     { upsert: vi.fn() },
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
    let nextId = 1;
    const superAdminRole = { id: "role-super-admin", nameEn: "Super Admin" };

    (prisma.user.findUnique as any).mockImplementation(
      ({ where }: { where: { clerkId: string } }) => Promise.resolve(users.get(where.clerkId) ?? null),
    );
    (prisma.$transaction as any).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
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
        }),
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
    return { users, grants, superAdminRole };
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
});
