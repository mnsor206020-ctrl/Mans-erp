---
name: Fiscal date and opening balance policy
description: Approved scope of fiscal-year/date validation and strict opening balance checks.
---
Resolve the fiscal year from the journal date for new manual entries, copies and template use. The server must independently resolve a unique matching nondeleted year within the authenticated user's organization, including closed years when detecting ambiguity. Reject missing, closed or ambiguous matches and reject a supplied year that disagrees.

**Why:** The user subsequently approved automatic fiscal-year selection as a separate improvement, replacing the earlier deferral. An OPEN-only lookup can hide overlapping CLOSED years and choose an arbitrary match.

**How to apply:** The user subsequently required removing the year field and its automatic-selection hints from both creation and editing. Users enter a date; server rejection appears on save. Do not restore a year selector or readonly year field. Editing a date still validates against the linked year and must not automatically move the entry. Banking auto-creation uses the same unique-date check; reversal still obeys the original-year protections. Do not introduce a correction workflow.

Opening-balance rollover must be exactly balanced at the database's four-decimal precision, including fractional differences smaller than the ordinary journal-entry tolerance. Preserve the source year's OPENING entry and carry only that source year's recognized balances.

**Why:** The user requires that no unbalanced opening entry be saved, with creation of the target year and entry rolled back together on failure. This does not authorize changing currency conversion or report equations.

**How to apply:** Use exact decimal arithmetic for the opening balance check, keep the organization and immediate predecessor relationship, and test against a disposable database only.
