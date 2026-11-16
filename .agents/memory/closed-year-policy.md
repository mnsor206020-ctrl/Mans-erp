---
name: Closed fiscal year policy
description: Approved immutable closed-year and closing-entry policy; no correction workflow in this phase.
---
No operation may change a journal belonging to a CLOSED fiscal year. This includes manual and automatic reversals, editing, deletion, workflow changes, copying and template use. Moving an entry requires both its original and destination years to be OPEN.

General-purpose routes must never void or reverse a CLOSING entry, even in an OPEN year. Historical entries remain unchanged.

**Why:** The user explicitly approved this policy to protect finalized annual results and required posting and closing to be coordinated so a concurrent posting cannot escape the closing aggregation.

**How to apply:** Enforce the policy server-side inside the same protected transaction as financial writes, not only in the UI or in a check before the transaction. Preserve RBAC and audit history. Do not add reopening or correction-in-an-open-year workflows without a separate approved phase.

Closing must reject all nondeleted DRAFT, UNDER_REVIEW and APPROVED entries linked to the year, including unfinished reversals. Users must finish posting or cancel unwanted drafts first. An original REVERSED entry remains financially recognized until its reversal posts; do not describe it as already excluded.

**Why:** The user explicitly requires that closing cannot strand unfinished journal work in an immutable year or finalize incomplete results.

**How to apply:** Keep this check under the accounting transaction lock. Cancelling a draft reversal must restore the original's recorded pre-reversal state and audit the cancellation atomically; never guess a missing historic state.

Closing and rollover must use stored base-currency amounts and exact Decimal calculations at four decimal places, preserving original amounts and exchange rates.

**Why:** The user approved this correction because adding original amounts across currencies misstates annual results and opening balances.

**How to apply:** Use the organization's configured base currency for generated closing/opening entries, not a hardcoded currency. This approval does not authorize changing report formulas or rewriting historical entries.
