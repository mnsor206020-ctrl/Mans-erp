---
name: Fiscal date and opening balance policy
description: Approved scope of fiscal-year/date validation and strict opening balance checks.
---
Validate journal dates against the explicitly selected fiscal year. Do not automatically select or change a journal's fiscal year based on its date in this phase.

**Why:** The user explicitly deferred automatic fiscal-year selection to a separate task.

**How to apply:** Reject incompatible dates with an Arabic explanation; preserve the selected year and all historical data. Cover manual, copied, template and automatic journals without adding a correction workflow.

Opening-balance rollover must be exactly balanced at the database's four-decimal precision, including fractional differences smaller than the ordinary journal-entry tolerance. Preserve the source year's OPENING entry and carry only that source year's recognized balances.

**Why:** The user requires that no unbalanced opening entry be saved, with creation of the target year and entry rolled back together on failure. This does not authorize changing currency conversion or report equations.

**How to apply:** Use exact decimal arithmetic for the opening balance check, keep the organization and immediate predecessor relationship, and test against a disposable database only.
