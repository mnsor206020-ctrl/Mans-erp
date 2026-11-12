---
name: Reversal excluded from reports
description: Reversed originals remain recognized accounting entries and must offset their posted reversals
---
Rule: any report/balance query over journal entries must include both POSTED and REVERSED statuses (a REVERSED entry was legitimately posted; only its lifecycle tag changed).

**Why:** Excluding reversed originals previously misstated financial results even while trial-balance debits equaled credits, hiding the recognition error.

**How to apply:** when fixing or adding any GL/report/dashboard aggregation, filter `status IN (POSTED, REVERSED)` (or a `posted_at IS NOT NULL` predicate) — never `status = POSTED` alone.
