# Micro Sprint Plan — Journal Entries Module
## Sprints 2.1 → 2.6

**Project:** Mans ERP
**Module:** Journal Entries (General Ledger)
**Document version:** 1.0
**Date:** 2026-06-30
**Status:** Awaiting architect approval before any implementation

> Each sprint has one clear business goal, is independently testable, and must
> pass all acceptance criteria before the next sprint may begin.
> No sprint proceeds without explicit architect approval.

---

## Current State Notice

The Phase 3 baseline already contains a partial implementation of journal entries
(header CRUD, lines, workflow, posting, reversal). The micro sprint plan below is
the **authoritative forward plan**. Each sprint will be treated as a formal
deliverable regardless of existing code, ensuring every acceptance criterion is
explicitly verified before proceeding.

---

---

# Sprint 2.1 — Draft Journal Entry Management

---

## 1. Objective

Implement header-level Draft journal entry management: create, view, edit,
soft-delete, list, search, and paginate. No journal lines, no workflow, no
attachments.

## 2. Business Value

Accountants can begin recording accounting events immediately. Each entry gets
a unique, sequential reference number. Records are searchable and paginated.
Drafts can be safely discarded before any lines or workflow are involved.

---

## 3. Files to Create

| File | Purpose |
|---|---|
| `artifacts/api-server/src/routes/journal-entries.ts` | All five core CRUD endpoints for draft header management |
| `artifacts/mans-erp/src/pages/JournalEntries.tsx` | List page with search, pagination, and status tabs |
| `artifacts/mans-erp/src/pages/JournalEntryForm.tsx` | Create and edit form (header fields only — no lines section yet) |

## 4. Files to Modify

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/index.ts` | Register `/api/journal-entries` router |
| `lib/api-spec/openapi.yaml` | Add JournalEntry schema + 5 endpoint specs |
| `artifacts/mans-erp/src/App.tsx` | Add routes: `/journal-entries`, `/journal-entries/new`, `/journal-entries/:id/edit` |
| `artifacts/mans-erp/src/layouts/DashboardLayout.tsx` | Add Journal Entries nav item |
| `artifacts/mans-erp/src/lib/language-provider.tsx` | Add ~25 translation keys (EN + AR) for header fields and list labels |

## 5. Database Migration

**1 migration required.**

Creates the `journal_entries` table with all header columns:

```
id, organization_id, branch_id, fiscal_year_id, number,
entry_date, type, status (DRAFT only enforced for now),
currency_code, exchange_rate, total_debit (default 0), total_credit (default 0),
description_en, description_ar, reference,
created_by_user_id, deleted_at, created_at, updated_at
```

Enums created: `JournalEntryStatus`, `JournalEntryType`

Indexes: `organization_id`, `status`, `type`, `entry_date`, `deleted_at`

Unique constraint: `(organization_id, number)`

> No lines table, no approvals table, no other tables in this sprint.

## 6. API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/journal-entries` | Paginated list — filters: `search`, `status`, `type`, `startDate`, `endDate`, `page`, `pageSize` |
| `GET` | `/api/journal-entries/:id` | Single entry detail |
| `POST` | `/api/journal-entries` | Create draft — generates unique number |
| `PATCH` | `/api/journal-entries/:id` | Update DRAFT entry header fields only |
| `DELETE` | `/api/journal-entries/:id` | Soft-delete DRAFT entry only |

**Numbering:** `JE-{YYYY}-{NNNN}` — sequential per org per year, left-padded to 4 digits.

**Response shape — list:**
```
{ data: [...entries], meta: { page, pageSize, total, totalPages } }
```

## 7. Frontend Pages / Components

| Page | Path | States Required |
|---|---|---|
| `JournalEntries.tsx` | `/journal-entries` | Loading (skeleton), Empty (icon + CTA), Error (toast), Success (table), Responsive |
| `JournalEntryForm.tsx` | `/journal-entries/new` and `…/:id/edit` | Loading (edit mode), Validation errors, Success (toast + redirect) |

**Form fields (header only):**
- Entry date (required)
- Fiscal year selector (OPEN fiscal years only) — dropdown
- Type: MANUAL / ADJUSTMENT / OPENING / CLOSING / AUTOMATIC — dropdown
- Currency: SAR / USD / EUR / AED / KWD — dropdown
- Exchange rate (shown only when currency ≠ SAR)
- Description (English)
- Description (Arabic) — RTL input
- Reference (optional)

**List columns:** Number, Date, Type, Description, Status badge, Created By, Actions menu

## 8. Validation Rules

| Rule | Detail |
|---|---|
| `entryDate` | Required; format `YYYY-MM-DD` |
| `fiscalYearId` | Required; must exist; must belong to user's org; must be `status = OPEN` |
| `type` | Required; one of defined enum values |
| `currencyCode` | Required; default SAR |
| `exchangeRate` | Required when currency ≠ SAR; must be positive |
| Edit guard | Only `status = DRAFT` entries may be edited |
| Delete guard | Only `status = DRAFT` entries may be soft-deleted |
| Number uniqueness | `(organizationId, number)` unique constraint enforced by DB |
| All inputs | Validated with Zod before any DB operation |

## 9. Tests

**Unit tests:**
- `generateJournalNumber()` — first entry → `JE-2026-0001`
- `generateJournalNumber()` — 10th entry → `JE-2026-0010`
- `generateJournalNumber()` — year boundary → `JE-2027-0001`
- Zod schema rejects missing `fiscalYearId`
- Zod schema rejects invalid date format

**Integration tests:**
- `POST /journal-entries` — valid payload → 201, number matches format
- `POST /journal-entries` — missing fiscalYearId → 400
- `POST /journal-entries` — closed fiscal year → 400
- `PATCH /:id` — edit DRAFT → 200
- `PATCH /:id` — entry not found → 404
- `DELETE /:id` — DRAFT → 200, soft-deleted
- `DELETE /:id` — non-DRAFT → 400
- `GET /` — pagination meta correct
- `GET /:id` — returns full header

**E2E (Playwright):**
- Navigate to list → loading skeleton → empty state → create first entry → entry appears
- Edit entry → save → updated values shown
- Delete draft → entry removed from list

## 10. Risks

| Risk | Mitigation |
|---|---|
| Number generation race condition under concurrent creates | Document as known limitation; resolve with DB sequence in a later sprint |
| Fiscal year not yet in DB for first-time org | UI shows "No open fiscal years" with a link to create one |
| RTL layout broken on form inputs | Test all inputs with `dir="rtl"` in CI |

## 11. Acceptance Criteria

- [ ] Accountant can create a draft journal entry with header fields
- [ ] A unique sequential number is assigned on creation
- [ ] List shows all drafts with search, type filter, and pagination
- [ ] Entry can be edited while in DRAFT status
- [ ] Entry cannot be edited if not DRAFT (enforced at API level)
- [ ] Entry can be soft-deleted while in DRAFT status
- [ ] All 5 UI states present on list and form pages
- [ ] Arabic translations complete and RTL layout correct
- [ ] TypeScript zero errors
- [ ] All tests pass
- [ ] Build succeeds
- [ ] TDD §1–§7 (header-level rows) reviewed and matches implementation

## 12. Estimated Implementation Size

| Category | Count |
|---|---|
| New files | 3 |
| Modified files | 5 |
| DB migrations | 1 |
| API endpoints | 5 |
| Frontend pages | 2 |
| Translation keys | ~25 |
| Unit test cases | ~5 |
| Integration test cases | ~9 |
| E2E test cases | 3 |

---

---

# Sprint 2.2 — Journal Lines and Double-Entry Validation

---

## 1. Objective

Add journal lines to draft entries: debit/credit line items, double-entry balance
validation, account eligibility checks, cost centre assignment, and multi-currency
base amount computation. The entry remains in DRAFT status throughout.

## 2. Business Value

Accountants can now build complete double-entry accounting records. The system
enforces the fundamental accounting equation (Σ Debit = Σ Credit) in real time,
preventing imbalanced entries from being saved. Cost centre tracking enables
departmental reporting.

---

## 3. Files to Create

| File | Purpose |
|---|---|
| `artifacts/mans-erp/src/components/journal-entries/JournalLinesTable.tsx` | Reusable lines grid: account combobox, description, cost centre, debit, credit, balance indicator |
| `artifacts/mans-erp/src/components/journal-entries/AccountPicker.tsx` | Searchable combobox filtered to active, non-group, direct-entry accounts only |

## 4. Files to Modify

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/journal-entries.ts` | Add line validation to `POST` and `PATCH`; accept `lines` array in body; replace lines on update |
| `lib/api-spec/openapi.yaml` | Add `JournalEntryLine` schema; update `JournalEntry` schema to include lines |
| `artifacts/mans-erp/src/pages/JournalEntryForm.tsx` | Embed `JournalLinesTable` component; show live balance indicator |
| `artifacts/mans-erp/src/lib/language-provider.tsx` | Add ~15 translation keys for line fields and balance states |

## 5. Database Migration

**1 migration required.**

Creates the `journal_entry_lines` table:

```
id, journal_entry_id (FK cascade), account_id (FK restrict),
cost_center_id (FK nullable), line_number,
description_en, description_ar,
debit (Decimal 18,4), credit (Decimal 18,4),
debit_base (Decimal 18,4), credit_base (Decimal 18,4),
reference, created_at, updated_at
```

Indexes: `journal_entry_id`, `account_id`, `cost_center_id`

## 6. API Endpoints

No new endpoints. Existing endpoints are extended:

| Endpoint | Change |
|---|---|
| `POST /api/journal-entries` | Accept `lines[]` array; validate balance; validate accounts; compute totals; store `total_debit`, `total_credit` |
| `PATCH /api/journal-entries/:id` | Accept `lines[]`; if provided, delete all existing lines then create new ones; re-validate balance and accounts |
| `GET /api/journal-entries/:id` | Include `lines[]` with account and cost centre relations in response |

**Line object schema (Zod):**
- `accountId` — UUID, required
- `costCenterId` — UUID, optional
- `lineNumber` — positive integer, required
- `descriptionEn` — string, optional
- `descriptionAr` — string, optional
- `debit` — Decimal ≥ 0
- `credit` — Decimal ≥ 0
- `reference` — string, optional

## 7. Frontend Pages / Components

| Component | Embedded In | Features |
|---|---|---|
| `JournalLinesTable.tsx` | `JournalEntryForm.tsx` | Add/remove lines; min 2 lines enforced; running totals; balance indicator (green/red/grey) |
| `AccountPicker.tsx` | `JournalLinesTable.tsx` | Searchable by code or name; shows code + name; only leaf accounts shown |

**Balance indicator states:**
- Grey — no amounts entered yet
- Red — debit ≠ credit (shows difference amount)
- Green — balanced (Σ debit = Σ credit within 0.01 tolerance)

**Debit/credit mutual exclusivity:** entering a debit clears the credit field on the same line and vice versa.

## 8. Validation Rules

| Rule | Detail |
|---|---|
| Minimum lines | At least 2 lines required |
| Balance | `abs(Σ debit − Σ credit) < 0.01` |
| Account active | `account.isActive = true` |
| Account not group | `account.isGroup = false` |
| Account allows direct entry | `account.allowDirectEntry = true` |
| Line amounts | Each line: `debit ≥ 0`, `credit ≥ 0`; at least one must be > 0 |
| Base amounts | `debitBase = debit × exchangeRate`, `creditBase = credit × exchangeRate` |
| `total_debit` / `total_credit` | Computed server-side; never accepted from client |

## 9. Tests

**Unit tests:**
- `validateBalance()` — equal amounts → balanced = true
- `validateBalance()` — unequal → balanced = false
- `validateBalance()` — within 0.01 tolerance → balanced = true
- `validateAccounts()` — inactive account → error
- `validateAccounts()` — group account → error
- `validateAccounts()` — no direct entry → error
- `validateAccounts()` — all valid → empty error array
- Base amount computation — non-SAR currency with exchange rate

**Integration tests:**
- `POST /journal-entries` with balanced lines → 201, `totalDebit = totalCredit`
- `POST /journal-entries` with unbalanced lines → 400
- `POST /journal-entries` with < 2 lines → 400
- `POST /journal-entries` with group account → 400
- `POST /journal-entries` with inactive account → 400
- `PATCH /:id` with new lines → old lines replaced, new totals stored
- `GET /:id` — lines returned with account and cost centre names

**E2E:**
- Add 2 lines → balance indicator green → save → lines visible on detail
- Remove a line when only 2 remain → delete button disabled
- Enter debit on line 1 → enter credit on line 1 → debit clears

## 10. Risks

| Risk | Mitigation |
|---|---|
| Account list fetch slow (500+ accounts) | Fetch once on mount; filter client-side in Command component |
| Lines replace on update not atomic | Wrapped in a single Prisma transaction (delete + createMany) |
| Decimal precision drift on exchange rate | Serialize exchange rate to 8 decimal places; always multiply server-side |

## 11. Acceptance Criteria

- [ ] Lines can be added and removed (min 2 enforced)
- [ ] Balance indicator updates in real time
- [ ] Server rejects unbalanced entries
- [ ] Server rejects group/inactive/no-direct-entry accounts
- [ ] Cost centre is assignable per line (optional)
- [ ] Multi-currency: exchange rate shown, base amounts computed
- [ ] `GET /:id` includes full lines with account metadata
- [ ] All Sprint 2.1 acceptance criteria continue to pass
- [ ] TypeScript zero errors; build succeeds; all tests pass

## 12. Estimated Implementation Size

| Category | Count |
|---|---|
| New files | 2 |
| Modified files | 4 |
| DB migrations | 1 |
| API endpoints modified | 3 |
| New components | 2 |
| Translation keys | ~15 |
| Unit test cases | ~8 |
| Integration test cases | ~7 |
| E2E test cases | 3 |

---

---

# Sprint 2.3 — Approval Workflow

---

## 1. Objective

Implement the journal entry workflow: submit for review, approve, and reject —
with a complete, immutable approval history trail. Each transition is recorded
with actor, timestamp, duration since previous action, and an optional comment.
Rejection requires a mandatory comment.

## 2. Business Value

Journal entries cannot be posted without an approval chain. This sprint
establishes governance — no entry reaches the ledger without at least one
authorised reviewer. The immutable history satisfies internal audit and
regulatory requirements.

---

## 3. Files to Create

| File | Purpose |
|---|---|
| `artifacts/mans-erp/src/components/journal-entries/ApprovalTimeline.tsx` | Vertical chronological timeline: actor, action badge, status transition, timestamp, duration, comment |
| `artifacts/mans-erp/src/pages/JournalEntryDetail.tsx` | Full detail view with header, lines, approval history, and contextual action buttons |

## 4. Files to Modify

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/journal-entries.ts` | Add `POST /:id/submit`, `POST /:id/approve`, `POST /:id/reject` endpoints; record approval metadata on every transition |
| `lib/api-spec/openapi.yaml` | Add `JournalEntryApproval` schema; add 3 workflow endpoint specs |
| `artifacts/mans-erp/src/App.tsx` | Add route `/journal-entries/:id` |
| `artifacts/mans-erp/src/lib/language-provider.tsx` | Add ~20 translation keys for workflow states, action buttons, approval timeline |

## 5. Database Migration

**1 migration required.**

Creates the `journal_entry_approvals` table:

```
id, journal_entry_id (FK cascade), user_id (FK),
action, comment, from_status, to_status,
duration_seconds (nullable), ip_address (nullable), user_agent (nullable),
created_at
```

Also extends `journal_entries` with workflow timestamp columns:

```
submitted_at, submitted_by_user_id,
approved_at, approved_by_user_id
```

Indexes: `journal_entry_id`, `user_id`, `created_at`

## 6. API Endpoints

| Method | Path | Transition | Guard |
|---|---|---|---|
| `POST` | `/api/journal-entries/:id/submit` | DRAFT → UNDER_REVIEW | ≥ 2 lines; balanced |
| `POST` | `/api/journal-entries/:id/approve` | UNDER_REVIEW → APPROVED | Status must be UNDER_REVIEW |
| `POST` | `/api/journal-entries/:id/reject` | UNDER_REVIEW or APPROVED → DRAFT | `comment` required; min 10 chars |
| `GET` | `/api/journal-entries/:id/approvals` | — | Returns ordered approval history with actor details and `durationSeconds` |

**Every workflow endpoint:**
- Writes one `JournalEntryApproval` row
- Writes one `AuditLog` row
- Computes `durationSeconds` from the previous approval row's `createdAt`
- Captures `ip_address` and `user_agent` from the request

**Reject clears:** `submittedAt`, `submittedByUserId`, `approvedAt`, `approvedByUserId`

## 7. Frontend Pages / Components

| Page / Component | Path | Features |
|---|---|---|
| `JournalEntryDetail.tsx` | `/journal-entries/:id` | Header metadata card; lines table (read-only); `ApprovalTimeline`; contextual action buttons per status |
| `ApprovalTimeline.tsx` | Embedded in detail | Actor name; action label (localised); status transition badges; exact timestamp; "Took X minutes" duration; quoted comment block for REJECT |

**Action buttons by status:**

| Status | Visible Actions |
|---|---|
| DRAFT | Edit, Submit, Delete, Copy |
| UNDER_REVIEW | Approve, Reject, Copy |
| APPROVED | Reject, Copy |

## 8. Validation Rules

| Rule | Detail |
|---|---|
| Submit guard | Status must be DRAFT; re-validate balance; ≥ 2 lines |
| Approve guard | Status must be UNDER_REVIEW |
| Reject guard | Status must be UNDER_REVIEW or APPROVED; `comment` required (min 10 chars) |
| Comment on reject | Enforced at Zod schema level; API returns 400 if absent |
| Immutability | Approval records have no update or delete endpoint |

## 9. Tests

**Unit tests:**
- `computeDuration(prev, current)` — correct seconds calculation
- `computeDuration(null, current)` — returns null for first action
- Reject schema rejects missing comment
- Reject schema rejects comment < 10 chars

**Integration tests:**
- `POST /:id/submit` from DRAFT → 200, status = UNDER_REVIEW
- `POST /:id/submit` from POSTED → 400
- `POST /:id/submit` with unbalanced lines → 400
- `POST /:id/approve` from UNDER_REVIEW → 200, status = APPROVED
- `POST /:id/approve` from DRAFT → 400
- `POST /:id/reject` from UNDER_REVIEW with comment → 200, status = DRAFT
- `POST /:id/reject` without comment → 400
- `POST /:id/reject` from POSTED → 400
- `GET /:id/approvals` — ordered list with durationSeconds and actor names

**E2E:**
- Create draft → submit → approval timeline shows SUBMIT event
- Approve → timeline shows APPROVE event with duration
- Reject with comment → entry back to DRAFT → comment visible in timeline

## 10. Risks

| Risk | Mitigation |
|---|---|
| Self-approval (creator approves own entry) | Flag in permission matrix; RBAC enforcement deferred to role sprint; documented as known gap |
| Clock skew on duration calculation | Use server-side `NOW()` for all timestamps; never trust client timestamps |
| Approval record missing on legacy entries | Existing entries have no approval records; timeline shows empty state gracefully |

## 11. Acceptance Criteria

- [ ] DRAFT entry can be submitted → status becomes UNDER_REVIEW
- [ ] UNDER_REVIEW entry can be approved → status becomes APPROVED
- [ ] UNDER_REVIEW or APPROVED entry can be rejected → status returns to DRAFT
- [ ] Rejection without a comment is blocked at API level
- [ ] Every transition writes an immutable approval record with actor + timestamp
- [ ] Duration since previous action is computed and stored
- [ ] Detail page shows full approval timeline in chronological order
- [ ] Action buttons on detail page match current status
- [ ] All Sprint 2.1 + 2.2 criteria continue to pass
- [ ] TypeScript zero errors; build succeeds; all tests pass

## 12. Estimated Implementation Size

| Category | Count |
|---|---|
| New files | 2 |
| Modified files | 4 |
| DB migrations | 1 |
| New API endpoints | 4 |
| New components | 2 |
| Translation keys | ~20 |
| Unit test cases | ~4 |
| Integration test cases | ~9 |
| E2E test cases | 3 |

---

---

# Sprint 2.4 — Posting, Immutability, and Reversal

---

## 1. Objective

Implement the final accounting actions: post an approved entry to the ledger,
lock a posted entry, void a posted or locked entry, and reverse a posted or
locked entry. Introduce SHA-256 integrity hashing at post time. Enforce fiscal
period validation at posting.

## 2. Business Value

Posting makes an entry permanent in the general ledger. The SHA-256 hash
provides cryptographic tamper-evidence — any database-level modification to a
posted entry is detectable. Reversal allows corrections without deleting
historical records, in compliance with accounting standards.

---

## 3. Files to Create

| File | Purpose |
|---|---|
| `artifacts/api-server/src/services/integrity-hash.ts` | `computeIntegrityHash(entry, lines)` — deterministic SHA-256 per TDD §25 specification |
| `artifacts/mans-erp/src/components/journal-entries/IntegrityBadge.tsx` | Hash display: truncated hash, algorithm, `hashedAt`; "Verify" button; valid/tampered result |

## 4. Files to Modify

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/journal-entries.ts` | Add `POST /:id/post`, `POST /:id/lock`, `POST /:id/void`, `POST /:id/reverse` endpoints; call `computeIntegrityHash` in post |
| `lib/api-spec/openapi.yaml` | Add 4 new action endpoint specs; add `integrityHash`, `hashedAt`, `hashAlgorithm` to JournalEntry schema |
| `artifacts/mans-erp/src/pages/JournalEntryDetail.tsx` | Add action buttons: Post, Lock, Void, Reverse; embed `IntegrityBadge`; show reversal links |
| `artifacts/mans-erp/src/lib/language-provider.tsx` | Add ~15 translation keys for post/lock/void/reverse actions and hash display |

## 5. Database Migration

**1 migration required.**

Extends `journal_entries` with:

```
integrity_hash (String nullable),
hash_algorithm (String nullable, default 'SHA-256'),
hashed_at (DateTime nullable),
posted_at, posted_by_user_id,
voided_at, voided_by_user_id, void_reason,
is_reversal (Boolean default false),
reversal_of_entry_id (UUID FK self-referential nullable),
reversed_by_entry_id (UUID FK self-referential nullable)
```

## 6. API Endpoints

| Method | Path | Transition | Guard |
|---|---|---|---|
| `POST` | `/api/journal-entries/:id/post` | APPROVED → POSTED | Status APPROVED; re-validate balance; re-validate FY still OPEN; re-validate all accounts still active/leaf; compute + store SHA-256 |
| `POST` | `/api/journal-entries/:id/lock` | POSTED → LOCKED | Status must be POSTED |
| `POST` | `/api/journal-entries/:id/void` | POSTED or LOCKED → VOIDED | `voidReason` required (min 10 chars) |
| `POST` | `/api/journal-entries/:id/reverse` | POSTED or LOCKED → creates new DRAFT | `reversedByEntryId` must be null; generates new JE number; swaps debits/credits |
| `GET` | `/api/journal-entries/:id/verify-hash` | — | Re-derives hash from stored fields; returns `{ storedHash, computedHash, isValid, verifiedAt }` |

**Hash computation (TDD §25 canonical JSON):**
- Inputs: `id`, `number`, `organizationId`, `fiscalYearId`, `entryDate`, `type`, `currencyCode`, `exchangeRate`, `totalDebit`, `totalCredit`, lines (sorted by `lineNumber`), `postedAt`, `postedByUserId`
- Keys sorted alphabetically at every level
- Decimals: 4 d.p. as strings; exchange rate: 8 d.p.; dates: ISO 8601
- Minified (no whitespace)
- Algorithm: `SHA-256(UTF-8(json))` → lowercase hex

**Immutability — enforced for POSTED, LOCKED, VOIDED, REVERSED:**
- `PATCH /:id` returns 400
- `DELETE /:id` returns 400

## 7. Frontend Pages / Components

| Component | Embedded In | Features |
|---|---|---|
| `IntegrityBadge.tsx` | `JournalEntryDetail.tsx` | Shows hash (first 16 chars + "…"), `hashAlgorithm`, `hashedAt`; "Verify Now" button → calls `/verify-hash` → shows ✓ Valid or ✗ Tampered |

**Action buttons added to detail page by status:**

| Status | Added Actions |
|---|---|
| APPROVED | Post |
| POSTED | Lock, Void, Reverse |
| LOCKED | Void, Reverse |

**Reversal display:** Posted entries with a reversal show "Reversed by JE-YYYY-NNNN" link. Reversal entries show "Reversal of JE-YYYY-NNNN" link.

## 8. Validation Rules

| Rule | Detail |
|---|---|
| Post guard | Status = APPROVED; balance holds; FY still OPEN; all accounts still active and non-group |
| Void reason | Required; min 10 chars; Zod-enforced |
| Reverse guard | Status = POSTED or LOCKED; `reversedByEntryId` is null |
| Reversal entry | Created with `isReversal = true`, lines with debits/credits swapped, `reversalOfEntryId` = original ID |
| Original on reversal | `status` → REVERSED; `reversedByEntryId` = new entry ID |
| Hash | Computed from canonical JSON; never accepted from client; stored once at post time |
| Edit/delete of posted | Blocked at API level with `400` regardless of caller |

## 9. Tests

**Unit tests:**
- `computeIntegrityHash()` — known input → known SHA-256 output (test vector)
- `computeIntegrityHash()` — changing any field changes the hash
- `computeIntegrityHash()` — key ordering is deterministic
- `computeIntegrityHash()` — decimal serialization to correct precision

**Integration tests:**
- `POST /:id/post` from APPROVED → 200, `integrityHash` populated, status = POSTED
- `POST /:id/post` from DRAFT → 400
- `POST /:id/post` with FY now closed → 400
- `POST /:id/lock` from POSTED → 200, status = LOCKED
- `POST /:id/void` with reason → 200, status = VOIDED
- `POST /:id/void` without reason → 400
- `POST /:id/reverse` from POSTED → 201 new DRAFT with swapped lines; original status = REVERSED
- `POST /:id/reverse` already reversed → 409
- `PATCH /:id` on POSTED entry → 400
- `DELETE /:id` on POSTED entry → 400
- `GET /:id/verify-hash` on unmodified → `isValid: true`

**E2E:**
- Approve → Post → `IntegrityBadge` visible → click Verify → confirmed valid
- Post → Lock → action buttons change to Void/Reverse only
- Reverse → new draft created → reversal link shown on original

## 10. Risks

| Risk | Mitigation |
|---|---|
| FY closed between approval and post | Re-validated at post time (double gate per TDD §8 step 5) |
| SHA-256 input changes in future (new fields) | Hash algorithm version stored; verification checks `hashAlgorithm` field before re-deriving |
| Reversal entry number race condition | Same known issue as Sprint 2.1; documented; to be resolved with DB sequence |

## 11. Acceptance Criteria

- [ ] APPROVED entry can be posted → status = POSTED; integrity hash stored
- [ ] Post blocked if FY closed or account inactive at post time
- [ ] POSTED entry is immutable — edit and delete return 400
- [ ] POSTED entry can be locked → status = LOCKED
- [ ] POSTED or LOCKED entry can be voided — reason required
- [ ] POSTED or LOCKED entry can be reversed — creates new DRAFT with swapped lines
- [ ] Already-reversed entry cannot be reversed again
- [ ] `IntegrityBadge` visible on posted entries; Verify returns correct result
- [ ] Reversal links displayed on both original and reversal entries
- [ ] All Sprint 2.1 + 2.2 + 2.3 criteria continue to pass
- [ ] TypeScript zero errors; build succeeds; all tests pass

## 12. Estimated Implementation Size

| Category | Count |
|---|---|
| New files | 2 |
| Modified files | 4 |
| DB migrations | 1 |
| New API endpoints | 5 |
| New components | 1 |
| Translation keys | ~15 |
| Unit test cases | ~4 |
| Integration test cases | ~11 |
| E2E test cases | 3 |

---

---

# Sprint 2.5 — Attachments, Notifications, and Source Tracking

---

## 1. Objective

Allow accountants to attach supporting documents to journal entries, track the
originating source module and reference, display a complete approval timeline,
and notify stakeholders on every workflow event.

## 2. Business Value

Auditors require supporting documentation (invoices, receipts, bank statements)
linked directly to each journal entry. Source tracking provides a navigable link
back to the originating transaction in any other ERP module. Notifications
eliminate manual follow-up and accelerate the review cycle.

---

## 3. Files to Create

| File | Purpose |
|---|---|
| `artifacts/api-server/src/routes/journal-entry-attachments.ts` | Upload, list, download (signed URL), soft-delete attachments |
| `artifacts/api-server/src/services/notification.ts` | `INotificationService` + DB implementation: `emit()`, `getUnread()`, `markRead()`, `markAllRead()` |
| `artifacts/mans-erp/src/components/journal-entries/AttachmentsPanel.tsx` | File list, upload button, download, delete, primary badge — all 5 states |
| `artifacts/mans-erp/src/components/journal-entries/SourceTrackingFields.tsx` | Source type dropdown, source reference input, source URL input |

## 4. Files to Modify

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/journal-entries.ts` | Wire `notificationService.emit()` into submit, approve, reject, post, void, reverse; copy source fields into reversal entry |
| `artifacts/api-server/src/routes/index.ts` | Register attachment router; register notifications router |
| `lib/api-spec/openapi.yaml` | Add attachment schemas + 5 endpoints; add notification schema + 3 endpoints; add source fields to JournalEntry schema |
| `artifacts/mans-erp/src/pages/JournalEntryForm.tsx` | Embed `SourceTrackingFields`; embed `AttachmentsPanel` (upload mode) |
| `artifacts/mans-erp/src/pages/JournalEntryDetail.tsx` | Embed `AttachmentsPanel` (view mode); show source tracking display with deep-link |
| `artifacts/mans-erp/src/lib/language-provider.tsx` | Add ~20 translation keys for attachment panel, source fields, notification labels |

## 5. Database Migration

**1 migration required.**

Three changes in one migration:

1. Extends `journal_entries` with:
   ```
   source_reference (String nullable),
   source_module_url (String nullable)
   ```

2. Creates `journal_entry_attachments` table (14 columns — see TDD §1.4)

3. Creates `notifications` table (12 columns — see TDD §26)

## 6. API Endpoints

**Attachment endpoints (5):**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/journal-entries/:id/attachments` | List non-deleted attachments |
| `POST` | `/api/journal-entries/:id/attachments` | Upload — `multipart/form-data`; validate MIME + size; compute SHA-256 checksum; store in object storage |
| `PATCH` | `/api/journal-entries/:id/attachments/:attachId` | Update description or `isPrimary` |
| `GET` | `/api/journal-entries/:id/attachments/:attachId/download` | Return `{ url, expiresAt }` — signed URL, 15-min TTL |
| `DELETE` | `/api/journal-entries/:id/attachments/:attachId` | Soft-delete |

**Notification endpoints (3):**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notifications` | Unread notifications for current user |
| `POST` | `/api/notifications/:id/read` | Mark one as read |
| `POST` | `/api/notifications/read-all` | Mark all as read for current user |

**Source tracking:** added to existing `POST` and `PATCH` on journal entries body — no new endpoints needed.

**Notification events emitted (10):**

`journal_entry.created`, `journal_entry.submitted`, `journal_entry.approved`, `journal_entry.rejected`, `journal_entry.posted`, `journal_entry.locked`, `journal_entry.voided`, `journal_entry.reversed`

## 7. Frontend Pages / Components

| Component | Embedded In | Features |
|---|---|---|
| `AttachmentsPanel.tsx` | Form + Detail | Upload (form only); list with file name, size, type icon, uploader, date; Download button → signed URL; Delete button; Primary badge; empty state; loading skeleton |
| `SourceTrackingFields.tsx` | `JournalEntryForm.tsx` | Source type dropdown (10 registered types); source reference text; source URL text; shown as optional collapsible section |

**Source tracking display (detail page):** If `sourceType` is set, show "Source: {sourceType} — {sourceReference}" with a clickable link if `sourceModuleUrl` is set.

## 8. Validation Rules

| Rule | Detail |
|---|---|
| Max attachments | 10 non-deleted per entry (server-enforced) |
| Max file size | 20 MB per file |
| MIME allowlist | `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel` |
| Checksum | SHA-256 computed server-side after upload; stored; verified on download |
| `isPrimary` | At most one per entry; setting new primary auto-clears previous |
| Source fields | `sourceType` and `sourceId` must be provided together or both omitted; `sourceType` must be a registered identifier |
| `sourceModuleUrl` | Must start with `/` (relative internal path; not external URL) |
| Notification delivery | Fire-and-forget; failures logged but do not fail the API response |

## 9. Tests

**Unit tests:**
- `notificationService.emit()` writes correct rows for `journal_entry.submitted` event
- `notificationService.getUnread()` excludes read notifications
- `notificationService.markRead()` sets `readAt`
- Attachment MIME validation — PDF accepted; `.exe` rejected
- Attachment size validation — 19 MB accepted; 21 MB rejected
- `isPrimary` uniqueness — setting new primary clears previous

**Integration tests:**
- `POST /attachments` — valid PDF → 201, `checksumSha256` stored
- `POST /attachments` — invalid MIME → 400
- `POST /attachments` — 11th file → 400
- `POST /attachments` — 21 MB file → 400
- `GET /attachments/:id/download` → `{ url, expiresAt }` returned
- `DELETE /attachments/:id` → soft-deleted; absent from next GET
- `GET /notifications` — returns unread after `journal_entry.submitted`
- `POST /notifications/:id/read` → `isRead = true`
- `POST /journal-entries` with source fields → stored correctly
- `POST /:id/reverse` → reversal entry inherits source fields

**E2E:**
- Upload PDF on form → visible in attachment panel → download → file received
- Submit entry → notification appears for reviewer
- Create JE with source type and reference → source link shown on detail page

## 10. Risks

| Risk | Mitigation |
|---|---|
| Object storage not configured | Use Replit App Storage; skill documents setup; fail loudly if not configured |
| Signed URL expiry too short | 15-minute TTL is standard; document in UI as "link expires in 15 minutes" |
| Notification fan-out to many users | Emit is async/fire-and-forget; does not block the API response |
| Source URL pointing to non-existent route | Validated as relative path only; existence not validated (avoids cross-module coupling) |

## 11. Acceptance Criteria

- [ ] Up to 10 attachments can be uploaded per journal entry
- [ ] Invalid MIME types and oversized files are rejected
- [ ] Attachments can be downloaded via a signed URL (15-min TTL)
- [ ] Soft-deleted attachments do not appear in the list
- [ ] Source type and reference are visible on the detail page
- [ ] If `sourceModuleUrl` is set, a clickable link is shown
- [ ] Notifications are written on submit, approve, reject, post, void, reverse
- [ ] Unread notifications are retrievable; marking as read works
- [ ] All Sprint 2.1–2.4 criteria continue to pass
- [ ] TypeScript zero errors; build succeeds; all tests pass

## 12. Estimated Implementation Size

| Category | Count |
|---|---|
| New files | 4 |
| Modified files | 6 |
| DB migrations | 1 |
| New API endpoints | 8 |
| New components | 2 |
| Translation keys | ~20 |
| Unit test cases | ~6 |
| Integration test cases | ~10 |
| E2E test cases | 3 |

---

---

# Sprint 2.6 — Recurring Journal Entries

---

## 1. Objective

Implement recurring journal schedules: accountants define a frequency, a
template entry, and optional automation flags. A background job generates new
DRAFT entries on schedule, with optional auto-submit and auto-approve. Schedules
can be paused, resumed, and cancelled.

## 2. Business Value

Monthly depreciation, quarterly accruals, and annual insurance entries are
entered automatically — removing repetitive manual work and eliminating the risk
of a periodic entry being forgotten. The schedule is fully auditable and all
generated entries trace back to their source schedule.

---

## 3. Files to Create

| File | Purpose |
|---|---|
| `artifacts/api-server/src/routes/journal-entry-recurring.ts` | 8 endpoints for CRUD + pause/resume/cancel on schedules |
| `artifacts/api-server/src/jobs/recurring-journal-generator.ts` | Background job: query due schedules, clone entries, compute `next_run_at`, emit notifications |
| `artifacts/mans-erp/src/pages/RecurringSchedules.tsx` | List of all schedules with status, frequency, next run, occurrence count |
| `artifacts/mans-erp/src/pages/RecurringScheduleForm.tsx` | Create and edit form for a recurring schedule |
| `artifacts/mans-erp/src/pages/RecurringScheduleDetail.tsx` | Schedule detail with configuration and list of all generated entries |

## 4. Files to Modify

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/index.ts` | Register `/api/journal-entries/recurring` router |
| `lib/api-spec/openapi.yaml` | Add `RecurringSchedule` schema + 8 endpoint specs |
| `artifacts/mans-erp/src/App.tsx` | Add 4 new routes for recurring pages |
| `artifacts/mans-erp/src/layouts/DashboardLayout.tsx` | Add Recurring Journals nav item under Journal Entries |
| `artifacts/mans-erp/src/lib/language-provider.tsx` | Add ~20 translation keys for recurring schedule pages and frequency labels |

## 5. Database Migration

**1 migration required.**

Creates `journal_entry_recurring_schedules` table (22 columns — see TDD §1.6).

New enums: `RecurringFrequency` (DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY), `RecurringScheduleStatus` (ACTIVE, PAUSED, COMPLETED, CANCELLED).

Also extends `journal_entries` with:
```
recurring_schedule_id (UUID FK nullable)
```

Indexes on schedules: `organization_id`, `status`, `next_run_at`, `deleted_at`

## 6. API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/journal-entries/recurring` | Paginated list of schedules for org |
| `POST` | `/api/journal-entries/recurring` | Create new schedule |
| `GET` | `/api/journal-entries/recurring/:scheduleId` | Detail + all generated entries |
| `PATCH` | `/api/journal-entries/recurring/:scheduleId` | Update frequency, dates, auto flags |
| `POST` | `/api/journal-entries/recurring/:scheduleId/pause` | ACTIVE → PAUSED |
| `POST` | `/api/journal-entries/recurring/:scheduleId/resume` | PAUSED → ACTIVE; recomputes `next_run_at` |
| `POST` | `/api/journal-entries/recurring/:scheduleId/cancel` | → CANCELLED |
| `DELETE` | `/api/journal-entries/recurring/:scheduleId` | Soft-delete CANCELLED schedules only |

**Background job (not an HTTP endpoint):**
- Runs on a defined interval (e.g. daily at 00:01 UTC)
- Queries: `status = ACTIVE AND next_run_at <= NOW()`
- For each schedule: clone template entry → new DRAFT; if `autoSubmit` → submit; if `autoApprove` → approve; update `next_run_at`; increment `occurrencesGenerated`; if `maxOccurrences` reached → COMPLETED
- Idempotency: skip if a JE with `recurringScheduleId = X` and `entryDate = today` already exists
- Failed runs: log error; do not advance `next_run_at`; retry on next cycle

## 7. Frontend Pages / Components

| Page | Path | Features |
|---|---|---|
| `RecurringSchedules.tsx` | `/journal-entries/recurring` | Table: name, frequency, status badge, next run, occurrences generated; filter by status; row → detail; all 5 UI states |
| `RecurringScheduleForm.tsx` | `/journal-entries/recurring/new` and `…/:id/edit` | Name (EN + AR); frequency dropdown; interval; day-of-week / day-of-month / month-of-year (context-sensitive); start date; end date (optional); max occurrences (optional); template entry selector; auto-submit toggle; auto-approve toggle (enabled only when auto-submit on) |
| `RecurringScheduleDetail.tsx` | `/journal-entries/recurring/:id` | Full config display; status badge; next run; Pause / Resume / Cancel action buttons; table of all generated entries with links to each JE |

## 8. Validation Rules

| Rule | Detail |
|---|---|
| `startDate` | Must be today or future |
| `endDate` | If set, must be after `startDate` |
| `maxOccurrences` | If set, must be ≥ 1 |
| `interval` | Must be ≥ 1 |
| `dayOfMonth` | 1–31; values > 28 trigger end-of-month fallback logic |
| `dayOfWeek` | 0–6 (Sunday–Saturday); required for WEEKLY frequency |
| `autoApprove` | Only valid when `autoSubmit = true`; Zod-enforced |
| `templateEntryId` | Must reference a non-deleted JE in the same org |
| Idempotency | One generated entry per `(scheduleId, entryDate)` per run |
| Cancel guard | Only ACTIVE or PAUSED schedules can be cancelled |
| Delete guard | Only CANCELLED schedules can be soft-deleted |

## 9. Tests

**Unit tests:**
- `computeNextRunAt(MONTHLY, interval=1, dayOfMonth=1, date)` → correct first of next month
- `computeNextRunAt(WEEKLY, interval=2, dayOfWeek=1, date)` → correct biweekly Monday
- `computeNextRunAt(MONTHLY, dayOfMonth=31, Feb date)` → last day of February
- `computeNextRunAt` past `endDate` → returns null (triggers COMPLETED)
- `computeNextRunAt(YEARLY, month=2, day=29, non-leap-year)` → Feb 28 fallback
- Generator idempotency check — existing entry for today → skip

**Integration tests:**
- `POST /recurring` — valid payload → 201, `nextRunAt` computed
- `POST /recurring` — `endDate` before `startDate` → 400
- `POST /recurring` — `autoApprove` without `autoSubmit` → 400
- `POST /recurring/:id/pause` — ACTIVE → 200, status = PAUSED
- `POST /recurring/:id/resume` — PAUSED → 200, status = ACTIVE, `nextRunAt` recomputed
- `POST /recurring/:id/cancel` — ACTIVE → 200, status = CANCELLED
- `DELETE /recurring/:id` — CANCELLED → 200, soft-deleted
- `DELETE /recurring/:id` — ACTIVE → 400
- Generator — due schedule → new JE created with `recurringScheduleId` set
- Generator — `maxOccurrences` reached → schedule status = COMPLETED
- Generator — FY closed → run skipped; `nextRunAt` unchanged

**E2E:**
- Create monthly schedule → view detail → pause → resume → see updated next run
- Navigate to generated entry → verify `recurringScheduleId` link back to schedule

## 10. Risks

| Risk | Mitigation |
|---|---|
| Background job infrastructure | Use Replit's cron/scheduled task mechanism; document in `replit.md`; fail loudly if job misses a run |
| `autoApprove` misuse | Only Accounting Manager and above may set `autoApprove = true`; document in permission matrix |
| FY closed mid-schedule | Generator skips run and logs warning; does not advance `next_run_at`; human intervention needed |
| Day-of-month edge cases | Comprehensive unit test matrix for all frequency × edge-date combinations |
| Cloned entry has stale account references | Validate all accounts in template at generation time; fail the run with a logged error if any account is no longer valid |

## 11. Acceptance Criteria

- [ ] Recurring schedule can be created with any supported frequency
- [ ] `next_run_at` is computed correctly for all frequency types
- [ ] Day-of-month > 28 falls back to last day of the month
- [ ] Background job generates a DRAFT entry on the scheduled date
- [ ] `autoSubmit` and `autoApprove` flags work correctly when set
- [ ] Idempotency: re-running the generator on the same day does not duplicate entries
- [ ] Generated entries link back to their schedule (`recurringScheduleId`)
- [ ] Schedule detail page lists all generated entries
- [ ] Schedule can be paused, resumed, and cancelled
- [ ] Schedule transitions to COMPLETED when `maxOccurrences` reached or `endDate` passed
- [ ] All Sprint 2.1–2.5 criteria continue to pass
- [ ] TypeScript zero errors; build succeeds; all tests pass

## 12. Estimated Implementation Size

| Category | Count |
|---|---|
| New files | 5 |
| Modified files | 5 |
| DB migrations | 1 |
| New API endpoints | 8 |
| New frontend pages | 3 |
| Translation keys | ~20 |
| Unit test cases | ~6 |
| Integration test cases | ~11 |
| E2E test cases | 2 |

---

---

## Master Summary

| Sprint | Goal | New Files | Modified Files | Migration | Endpoints | Est. Keys |
|---|---|---|---|---|---|---|
| 2.1 | Draft header CRUD | 3 | 5 | 1 | 5 | ~25 |
| 2.2 | Lines + balance | 2 | 4 | 1 | 3 modified | ~15 |
| 2.3 | Approval workflow | 2 | 4 | 1 | 4 new | ~20 |
| 2.4 | Post + hash + reverse | 2 | 4 | 1 | 5 new | ~15 |
| 2.5 | Attachments + notifications | 4 | 6 | 1 | 8 new | ~20 |
| 2.6 | Recurring journals | 5 | 5 | 1 | 8 new | ~20 |
| **Total** | | **18** | **28** | **6** | **33** | **~115** |

Each sprint is independently testable and delivers a complete, usable increment.
No sprint begins without architect approval. All six exit criteria must be met
before the next sprint opens.

---

*Document version: 1.0*
*Last updated: 2026-06-30*
*Owner: Technical Architect — Mans ERP Project*
