---
name: Closed fiscal year policy
description: Approved immutable closed-year and closing-entry policy; no correction workflow in this phase.
---
No operation may change a journal belonging to a CLOSED fiscal year. This includes manual and automatic reversals, editing, deletion, workflow changes, copying and template use. Moving an entry requires both its original and destination years to be OPEN.

General-purpose routes must never void or reverse a CLOSING entry, even in an OPEN year. Historical entries remain unchanged.

**Why:** The user explicitly approved this policy to protect finalized annual results and required posting and closing to be coordinated so a concurrent posting cannot escape the closing aggregation.

**How to apply:** Enforce the policy server-side inside the same protected transaction as financial writes, not only in the UI or in a check before the transaction. Preserve RBAC and audit history. Do not add reopening or correction-in-an-open-year workflows without a separate approved phase.
