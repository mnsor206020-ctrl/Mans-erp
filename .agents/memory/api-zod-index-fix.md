---
name: api-zod index ambiguity fix
description: How to resolve TS2308 export ambiguity in lib/api-zod/src/index.ts when adding new endpoint bodies to the OpenAPI spec.
---

## Rule
`lib/api-zod/src/index.ts` must use explicit named `export type { ... } from "./generated/types"` — NOT `export type * from "./generated/types"`.

## Why
Generated Zod constants and request interfaces can share names. Wildcard exports from both outputs cause TS2308; the number of collisions grows as endpoints are added.

## How to apply
After any `pnpm --filter @workspace/api-spec run codegen` run that generates new Body/Params/Response types in BOTH api.ts and types/, check if new conflicts appear. If they do, add the new type to the explicit exclusion list in `lib/api-zod/src/index.ts` (i.e., omit it from the `export type { ... }` block). The conflicting name is still available via `zod.infer<typeof TheSchema>`.

Preserve the curated root barrel across regeneration rather than repairing it manually each run. Do not upgrade the application's Zod major just to accommodate a generator's defaults.

**Why:** A newer Orval release regenerated a root wildcard export and selected incompatible Zod APIs despite an already working application.

**How to apply:** Keep generation targets aligned with the installed runtime and verify the workspace libraries immediately after code generation.
