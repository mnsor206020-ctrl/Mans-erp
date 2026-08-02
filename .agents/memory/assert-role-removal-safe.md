---
name: assert-role-removal-safe
description: Role removal safety guard function in users.ts — takes an already-loaded role object, not a roleId, to avoid a duplicate DB fetch.
---

# assertRoleRemovalSafe Signature

## Rule
`assertRoleRemovalSafe(targetUserId, role, actorId)` accepts the already-loaded `role: { id: string; nameEn: string }` object, NOT a bare `roleId: string`.

**Why:** The caller already fetched the role from the database. Re-fetching by ID inside the safety guard was a duplicate query and caused test failures (the mock only returns a value once via `mockResolvedValueOnce`).

## Call sites
- `DELETE /users/:id/roles/:roleId` — pass the `role` object fetched just above
- `PATCH /users/:id/roles` (bulk replace) — build a `Map<roleId, role>` from `targetUser.userRoles`, then pass each removed role object

## Safety guards enforced
1. Actor cannot remove own last admin-level role (Super Admin or Organization Admin)
2. Cannot remove Super Admin from someone if they are the last Super Admin in the system
3. Cannot remove Organization Admin if they are the last one for their organization

File: `artifacts/api-server/src/routes/users.ts`
