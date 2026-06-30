---
name: API server stack
description: What the api-server uses for DB access, auth, and how routes are wired
---

The Express API server (`artifacts/api-server`) imports from `@workspace/prisma` for all DB access.

**Why:** Prisma replaced Drizzle as the ORM. The Drizzle `@workspace/db` package still exists but its tables were dropped.

**How to apply:**
- Import: `import { prisma } from "@workspace/prisma"` in any route file
- Auth guard: `requireAuth()` from `@clerk/express` on protected routes
- User identity: `getAuth(req).userId` gives the Clerk user ID (maps to `user.clerkId` in DB)
- Routes registered in `artifacts/api-server/src/routes/index.ts`
- Build: esbuild via `build.mjs`; starts with `node --enable-source-maps ./dist/index.mjs`
- Do NOT use `@workspace/db` (Drizzle) for new routes — use `@workspace/prisma` only
