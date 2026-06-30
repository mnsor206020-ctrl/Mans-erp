---
name: Prisma database setup
description: How Prisma is configured in the Mans ERP monorepo and what to do after schema changes
---

The ORM for Mans ERP is Prisma, housed in `lib/prisma/`. The old Drizzle setup in `lib/db/` still exists in code but its tables were dropped and replaced by Prisma tables (Drizzle used integer PKs; Prisma uses UUIDs — incompatible).

**Why:** User explicitly requested Prisma from the start. UUID PKs required a force-reset of the dev database.

**How to apply:**
- Schema file: `lib/prisma/prisma/schema.prisma`
- After any schema change: `pnpm --filter @workspace/prisma run push` (dev) or `pnpm --filter @workspace/prisma run migrate:dev` (migrations)
- After schema change: `pnpm --filter @workspace/prisma run generate` to regenerate the client
- Seed script: `pnpm --filter @workspace/prisma run seed` — runs `prisma/seed.ts` via tsx
- The Prisma client singleton is exported from `lib/prisma/src/index.ts` as `prisma`
- `tsx` is a devDependency of `@workspace/prisma` (catalog entry) — required for the seed script
- Prisma build scripts require allowlisting in `pnpm-workspace.yaml` under `onlyBuiltDependencies`: prisma, @prisma/client, @prisma/engines
