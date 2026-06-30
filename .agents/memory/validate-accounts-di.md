---
name: validateAccounts dependency injection pattern
description: Why validateAccounts in journal-entry-utils.ts receives a prismaClient parameter rather than importing prisma directly.
---

## Rule
`validateAccounts(lines, orgId, prismaClient)` takes the Prisma client as a third parameter. It does NOT import `{ prisma }` from `@workspace/prisma` directly.

## Why
`@workspace/prisma` creates a live PrismaClient instance at module-import time (`new PrismaClient(...)`). If `journal-entry-utils.ts` imported it at the top level, any unit test that imports from utils would try to open a database connection, causing failures in CI environments without a live DB. Dependency injection keeps the utils module free of side-effectful imports.

## How to apply
- In the route handler (`journal-entries.ts`): call `await validateAccounts(lines, orgId, prisma)` where `prisma` is the singleton imported from `@workspace/prisma`.
- In unit tests: pass a mock object `{ chartOfAccount: { findFirst: vi.fn() } }` as the third argument — no module mocking needed.
- If other utility functions need DB access, apply the same DI pattern.
