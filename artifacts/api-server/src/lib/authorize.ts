import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

export type PermissionAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "export"
  | "approve"
  | "void";

export type UserWithRoles = NonNullable<
  Awaited<ReturnType<typeof getCurrentUserWithRoles>>
>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: UserWithRoles;
    }
  }
}

/**
 * Loads a user together with their assigned roles and the permissions
 * granted by those roles. Shared by `requirePermission` so every route
 * checks authorization the same way.
 */
export async function getCurrentUserWithRoles(clerkId: string) {
  return prisma.user.findFirst({
    where: { clerkId, deletedAt: null },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });
}

/** Flattens a user's roles into a `resource:action` permission set. */
export function getPermissionSet(user: Pick<UserWithRoles, "userRoles"> | null | undefined): Set<string> {
  const permissions = new Set<string>();
  for (const userRole of user?.userRoles ?? []) {
    for (const rolePermission of userRole.role.rolePermissions) {
      permissions.add(`${rolePermission.permission.resource}:${rolePermission.permission.action}`);
    }
  }
  return permissions;
}

export function hasPermission(
  user: Pick<UserWithRoles, "userRoles"> | null | undefined,
  resource: string,
  action: PermissionAction,
): boolean {
  return getPermissionSet(user).has(`${resource}:${action}`);
}

/**
 * Platform admins (Super Admin role) are not scoped to a single
 * organization and may read/manage all organizations. Everyone else may
 * only access their own organization's record.
 */
export function isPlatformAdmin(
  user: Pick<UserWithRoles, "userRoles"> | null | undefined,
): boolean {
  return (user?.userRoles ?? []).some((userRole) => userRole.role.nameEn === "Super Admin");
}

/**
 * Express middleware factory enforcing that the authenticated user has the
 * given `resource:action` permission (granted via one of their roles).
 * Must be used after `requireAuth()`. On success, attaches the loaded user
 * (with roles/permissions) to `req.currentUser` so downstream handlers can
 * reuse it without another database round-trip.
 */
export function requirePermission(resource: string, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId: clerkId } = getAuth(req);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const user = await getCurrentUserWithRoles(clerkId);
      if (!user) return res.status(401).json({ error: "User not found" });

      if (!hasPermission(user, resource, action)) {
        return res.status(403).json({ error: "Forbidden: you do not have permission to perform this action" });
      }

      req.currentUser = user;
      return next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Authorization check failed" });
    }
  };
}
