---
name: vitest-mock-hoisting
description: How to avoid "Cannot access before initialization" when referencing an outer variable inside a vi.mock() factory — use inline factory or vi.hoisted().
---

# Vitest Mock Hoisting Trap

## Rule
`vi.mock("module", factory)` is hoisted to the top of the file at compile time. Any variable defined in the test file cannot be referenced inside the factory, even if it appears above `vi.mock` in source order.

**Symptom:** `ReferenceError: Cannot access 'prismaMock' before initialization`

## Fix
Two options:

**Option A (preferred): Inline factory — no external variable reference**
```typescript
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn(), ... },
    $transaction: vi.fn().mockImplementation(async (ops: any[]) => Promise.all(ops.map(op => op))),
  },
}));
import { prisma } from "@workspace/prisma"; // use this reference in tests
```

**Option B: `vi.hoisted` for shared object**
```typescript
const prismaMock = vi.hoisted(() => ({ user: { findFirst: vi.fn() }, ... }));
vi.mock("@workspace/prisma", () => ({ prisma: prismaMock }));
```

**Why:** The existing working tests (e.g. `users-roles.integration.test.ts`) use Option A — they reference `prisma` (the imported mock) rather than a locally-defined variable in the factory.

**How to apply:** All new integration test files must use Option A or Option B. Never declare a `const prismaMock = { ... }` at the top level and reference it inside the `vi.mock` factory.
