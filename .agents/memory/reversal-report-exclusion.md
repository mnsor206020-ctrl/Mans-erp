---
name: Reversal excluded from reports
description: Reversed originals remain recognized accounting entries and must offset their posted reversals
---
Rule: recognize POSTED, REVERSED and legacy LOCKED entries consistently in financial reports, closing and opening-balance rollover. Keep the original recognized while its reversal is a draft; recognize the reversal only once it is posted. Never recognize drafts or count a linked original twice.

**Why:** The user approved this accounting policy. Changing lifecycle status must not erase a legitimately posted entry's financial effect. Excluding reversed originals previously misstated results even while trial-balance debits equaled credits.

**How to apply:** use the same recognized-status policy for financial queries, preserving their existing organization, year, date and entry-type scopes. The user retired journal locking: reject new LOCK transitions in API and UI, but retain old LOCKED entries, their audit history and financial effect. Do not confuse journal locking with fiscal-year status.
