---
name: Zod validation + noImplicitReturns interplay
description: Adding an early `return res.status(400)...` guard to an Express handler that otherwise never uses `return` before res.json/res.status triggers a new TS7030 error under noImplicitReturns.
---

Adding Zod `safeParse` validation to an existing route handler often means adding an early
`return res.status(400).json(...)` guard. If the rest of that handler's response calls
(success path, catch block) don't already use `return`, this creates inconsistent return
paths and TypeScript's `noImplicitReturns` flags it as a **new** TS7030 error, even though
the file may already have many pre-existing (baseline) TS7030 errors elsewhere.

**Why:** `noImplicitReturns` only complains when some code paths explicitly return a value
and others fall through without returning — not when every path is consistently bare
(`res.json(...)` with no `return`) or consistently `return`ed.

**How to apply:** When adding an early-return validation guard to a handler, either make the
guard NOT use `return` and instead early-continue with an if/else structure, or (preferred)
add `return` to every response call in that handler (success + catch) so all paths are
consistent. When verifying "0 new TypeScript errors" after a scoped fix, diff the full
baseline vs. post-change error list with line numbers stripped (`sed -E 's/\([0-9]+,[0-9]+\)//'`)
since Prisma's inferred anonymous types can reorder properties across recompiles, producing
noisy but equivalent diffs that must not be mistaken for new errors.
