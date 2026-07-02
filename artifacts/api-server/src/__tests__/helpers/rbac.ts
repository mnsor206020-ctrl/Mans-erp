/**
 * Test helper for building a mock authenticated user with a full set of RBAC
 * permissions on given resources. Route-protection integration tests use
 * this so the existing "happy path" fixtures keep passing after every
 * mutation route was wired to `requirePermission(resource, action)`.
 */
const ALL_ACTIONS = ["create", "read", "update", "delete", "export", "approve", "void"] as const;

export function userRolesGrantingAll(...resources: string[]) {
  return [
    {
      role: {
        rolePermissions: resources.flatMap((resource) =>
          ALL_ACTIONS.map((action) => ({ permission: { resource, action } })),
        ),
      },
    },
  ];
}
