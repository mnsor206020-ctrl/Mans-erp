---
name: RBAC middleware test fixtures
description: Wiring requirePermission into mutation routes breaks existing mocked user fixtures in integration tests unless updated
---

Adding `requirePermission(resource, action)` middleware in front of mutation routes calls `prisma.user.findFirst` with an `include: { userRoles: { role: { rolePermissions: { permission } } } }` shape before the route handler runs. Any integration test that mocks `prisma.user.findFirst` to resolve a plain `mockUser` object (no `userRoles` field) will now get 403s on every previously-passing "happy path" test, because `getPermissionSet` treats a missing `userRoles` as zero permissions.

**Why:** the mock is shared (`mockResolvedValue`, not `mockResolvedValueOnce`) and is read twice per request — once by the middleware, once by the route's own user lookup — so the fixture must satisfy both.

**How to apply:** when adding or extending permission-gated routes, give the test's `mockUser` fixture a `userRoles` array granting the resource(s)/actions the route requires. A shared helper `userRolesGrantingAll(...resources)` lives in `artifacts/api-server/src/__tests__/helpers/rbac.ts` — import it and spread it into the fixture rather than hand-rolling the nested role/permission shape. Add dedicated 403 tests with `userRoles: []` (or a role missing the specific action) to prove the gate actually works.
