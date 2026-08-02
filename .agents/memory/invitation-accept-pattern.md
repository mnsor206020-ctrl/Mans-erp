---
name: invitation-accept-pattern
description: How to load the current user in endpoints that use requireAuth() but NOT requirePermission() — and why req.currentUser is not set there.
---

# Invitation Accept / No-Permission Endpoints

## Rule
`req.currentUser` is only populated by the `requirePermission(resource, action)` middleware in `artifacts/api-server/src/lib/authorize.ts`. Endpoints that use `requireAuth()` alone (e.g. `POST /invitations/:token/accept`) must load the actor manually:

```typescript
const { userId: clerkId } = getAuth(req);
if (!clerkId) return res.status(401).json({ error: "Unauthorized" });
const actor = await prisma.user.findFirst({ where: { clerkId } });
if (!actor) return res.status(401).json({ error: "User not found" });
```

**Why:** The invitation accept flow intentionally has no RBAC permission requirement (any authenticated user can accept an invitation addressed to them), so `requirePermission` cannot be used. `requireAuth()` only validates the Clerk JWT; it does not query the database for the user record.

**How to apply:** Any endpoint that calls `requireAuth()` without `requirePermission()` and needs the user's database record (e.g. email, organizationId) must use `getAuth` + `prisma.user.findFirst`.
