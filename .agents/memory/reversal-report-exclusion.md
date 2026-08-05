---
name: Reversal excluded from reports
description: Reversing a JE sets original status to REVERSED while all report queries filter POSTED only — reversals double-count instead of netting to zero
---
Rule: any report/balance query over journal entries must include both POSTED and REVERSED statuses (a REVERSED entry was legitimately posted; only its lifecycle tag changed).

**Why:** QA audit (Aug 2026) proved a reversal misstates every report by 2× the reversed amount while trial-balance debits==credits still holds, hiding the error. Report queries in the API reports routes filter `status: "POSTED"` only.

**How to apply:** when fixing or adding any GL/report/dashboard aggregation, filter `status IN (POSTED, REVERSED)` (or a `posted_at IS NOT NULL` predicate) — never `status = POSTED` alone.
