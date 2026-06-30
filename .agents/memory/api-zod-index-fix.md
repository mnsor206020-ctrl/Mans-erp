---
name: api-zod index ambiguity fix
description: How to resolve TS2308 export ambiguity in lib/api-zod/src/index.ts when adding new endpoint bodies to the OpenAPI spec.
---

## Rule
`lib/api-zod/src/index.ts` must use explicit named `export type { ... } from "./generated/types"` — NOT `export type * from "./generated/types"`.

## Why
`export * from "./generated/api"` exports zod schema CONSTs whose TypeScript type names match the TypeScript interfaces in `types/`. Wildcard re-export from both causes TS2308 ("already exported") for the 7 action body types: ApproveJournalEntryBody, CopyJournalEntryBody, RejectJournalEntryBody, ReverseJournalEntryBody, SubmitJournalEntryBody, UseJournalEntryTemplateBody, VoidJournalEntryBody.

## How to apply
After any `pnpm --filter @workspace/api-spec run codegen` run that generates new Body/Params/Response types in BOTH api.ts and types/, check if new conflicts appear. If they do, add the new type to the explicit exclusion list in `lib/api-zod/src/index.ts` (i.e., omit it from the `export type { ... }` block). The conflicting name is still available via `zod.infer<typeof TheSchema>`.
