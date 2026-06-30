# Mans ERP — Definition of Done

> **Authority:** This document is the mandatory quality gate for every sprint and feature delivered on the Mans ERP project.
> It is subordinate only to `PROJECT_RULES.md` (the Project Constitution).
> No sprint may be marked complete, and no sprint plan may be approved for implementation, unless every applicable criterion in this document is satisfied and confirmed by the technical architect.
> Non-applicable criteria must be explicitly justified as N/A in the sprint completion report.

---

## 1. Purpose

This Definition of Done (DoD) establishes a shared, objective standard for what "complete" means on the Mans ERP project. It eliminates ambiguity between "code written" and "production-ready". It exists to protect:

- **Accounting integrity** — financial data is correct, immutable where required, and fully auditable.
- **End users** — the system is accessible, bilingual, and reliable under realistic conditions.
- **The codebase** — every sprint leaves the system in a better state than it found it.
- **The team** — rework caused by ambiguous acceptance is prevented at the definition level, not discovered in production.

Every criterion in this document must be treated as a hard gate, not a soft guideline. A sprint that passes 16 of 17 sections is not done.

---

## 2. Definition of Done — Feature Level

A **feature** is considered done when:

1. All acceptance criteria listed in the sprint plan for that feature are met and verified.
2. The feature works end-to-end from the UI through the API to the database — no mocked data in production paths.
3. The feature handles all five required UI states: Loading, Empty, Error, Success, and Responsive.
4. The feature is covered by the tests specified in its sprint plan (unit and/or integration).
5. No existing feature is broken or degraded by the change.
6. All user-facing text exists in both English and Arabic and displays correctly in both LTR and RTL layouts.
7. The feature is accessible to keyboard-only users and screen reader users (WCAG 2.1 AA).

A feature that partially satisfies acceptance criteria is **not done**. Partial completion must be documented as a named exception with a follow-up sprint reference.

---

## 3. Definition of Done — Sprint Level

A **sprint** is considered done only after all six release gates pass in order (see §16). In addition:

1. Every feature in the sprint scope meets the Feature Definition of Done (§2).
2. The sprint completion report is delivered, documenting every section of this DoD as either: ✅ Satisfied, N/A (justified), or ⚠️ Exception (documented with follow-up sprint).
3. The Final Completion Checklist (§17) is filled out with no unchecked boxes — except those explicitly marked N/A or Exception.
4. The technical architect has given **written approval** before the next sprint plan is activated.

---

## 4. Architecture Requirements

- **Layering is enforced.** The request path must follow: Route → Controller → Service → Repository → Database. No layer may be skipped. No database query may appear in a route handler or a React component.
- **Business rules live in services.** Route handlers validate inputs, call services, and return responses. No business logic, domain decisions, or financial rules may exist in a route handler.
- **No duplicate logic.** If a rule, calculation, or validation exists in one place, it is imported and reused — never copied. Duplication of business logic is a blocking defect.
- **Cross-module dependencies use interfaces.** No domain module (Accounting, HR, Inventory, etc.) may directly import internal implementation details from another module. Communication goes through well-defined, exported interfaces.
- **UI components are presentational or container — not both.** Presentational components receive props and render UI. Container components fetch data and coordinate state. Business logic belongs in neither.
- **Shared utilities are extracted.** Any function used in more than one module is extracted to a shared library (`lib/` or a `@workspace/*` package), not copied between files.

---

## 5. Backend Requirements

- **Every input is validated with Zod.** Every request body, every query parameter, and every route parameter has an explicit Zod schema. Raw `req.body` or `req.query` values are never passed directly to Prisma or any service function.
- **Zod schemas are co-located with their domain.** Schemas used by a single route live in a dedicated utility file alongside the route. Schemas shared across routes or packages are exported from the relevant `lib/` package.
- **No `console.log` in production paths.** Structured logging only. Debug statements are removed before sprint close.
- **No unbounded queries.** Every `findMany` call must include a `take` limit. List endpoints always paginate.
- **No N+1 queries.** Related data is eager-loaded via Prisma `include` or `select`. No related record fetch occurs inside a loop.
- **All mutations are wrapped in Prisma transactions** where more than one write operation must be atomic.
- **Audit logs are written for every mutation.** Every create, update, soft-delete, and status transition writes an `AuditLog` record containing: entity type, entity ID, action, actor user ID, timestamp, before state (serialised), and after state (serialised).
- **TypeScript strict mode is maintained.** `strict: true` remains enabled in every `tsconfig.json`. Any use of `any` must have an inline justification comment. `@ts-ignore` is not permitted without an accompanying explanation comment.
- **Zero new TypeScript errors.** The sprint completion report must include a TypeScript baseline table showing errors before and after the sprint. The after count must not exceed the before count.

---

## 6. Frontend Requirements

- **Every page implements all five UI states:**

  | State | Requirement |
  |-------|-------------|
  | Loading | Skeleton components or spinner while data is in-flight. Never a blank white screen. |
  | Empty | Meaningful empty-state illustration or icon, explanatory message, and a contextual call-to-action (e.g., "Create your first entry"). |
  | Error | Clear, human-readable error message. Actionable where possible (retry button, navigation link). Never a raw error object or stack trace. |
  | Success | Visual confirmation of completed actions: toast notification, inline success indicator, or redirect to the result. |
  | Responsive | Every page functions correctly and is readable at mobile (375px), tablet (768px), and desktop (1280px+) viewport widths. |

- **No hard-coded directional CSS.** `left`, `right`, `margin-left`, `padding-right`, and equivalent hard-coded directional values are not permitted in layout styles. Use Tailwind logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) or CSS logical properties (`margin-inline-start`, `padding-inline-end`).
- **All interactive elements are keyboard-accessible.** Every button, link, form field, dropdown, dialog, and custom widget is reachable and operable via keyboard Tab/Enter/Escape navigation.
- **Forms show inline validation errors.** Validation errors appear adjacent to the relevant field, not only in a top-level alert. Field-level error messages are present in both English and Arabic.
- **No mock data in production code paths.** Hardcoded fixture arrays used during development must be removed before sprint close. All data comes from the API.
- **React Query is used for all server state.** Direct `fetch` or `axios` calls inside components are not permitted. All server state is managed through `@workspace/api-client-react` hooks.
- **Query invalidation is correct.** After any mutation (create, update, delete, status transition), all related query keys are invalidated so the UI reflects the new state without a full page reload.

---

## 7. Database Requirements

- **Every schema change goes through a Prisma migration.** No direct SQL DDL is permitted. Every column, table, index, relation, or enum change is made via `prisma migrate dev` in development and verified with `prisma migrate deploy` in CI/production.
- **Soft delete is mandatory.** `prisma.entity.delete()` is never called. Every delete is `prisma.entity.update({ data: { deletedAt: new Date() } })`. Every list query includes `where: { deletedAt: null }`.
- **Every foreign key has an index.** Foreign key columns are indexed by default in every new table. Frequently filtered columns (`status`, `organizationId`, `fiscalYearId`) are also indexed.
- **Monetary values use `Decimal`.** No `Float` type is used for monetary fields. Prisma `Decimal` with precision ≥ 18 and scale ≥ 4 is mandatory for all amount fields.
- **Timestamps on every table.** Every table has `createdAt` and `updatedAt`. Mutable entities have `deletedAt`. Entities with lifecycle events have their event timestamps (`postedAt`, `approvedAt`, `submittedAt`, etc.) as nullable columns.
- **Migrations are idempotent and reversible.** Every migration can be applied to a clean database and produces the same result. Where possible, a `down` migration is documented.
- **Migration files are never edited after they are committed.** A committed migration is immutable. Corrections go in a new migration.

---

## 8. API Requirements

- **RESTful conventions are followed.** HTTP verbs map to operations: `GET` (read), `POST` (create or action), `PATCH` (partial update), `PUT` (full replace — rare), `DELETE` (soft-delete). The correct status code is returned: `200` OK, `201` Created, `400` Bad Request, `401` Unauthenticated, `403` Forbidden, `404` Not Found, `409` Conflict, `422` Unprocessable Entity, `500` Server Error.
- **Error responses are consistent.** Every error response uses the shape `{ error: string, details?: unknown }`. No raw error objects, stack traces, or database error messages are exposed to the client.
- **The OpenAPI specification is updated in the same sprint.** Every new or modified endpoint — including its request body schema, query parameters, and response shape — is reflected in `lib/api-spec/openapi.yaml` before the sprint is closed. Codegen is re-run after every spec change.
- **Every non-public endpoint enforces authentication.** `requireAuth()` middleware is applied to every endpoint that is not explicitly intended to be public.
- **RBAC is applied to every protected endpoint.** Authentication alone is not sufficient. Each endpoint declares its allowed roles and enforces them. The default is deny.
- **Sensitive fields are stripped from responses.** Passwords, internal system fields, full audit metadata not required by the client, and any PII beyond what the requesting user is authorised to receive are excluded from all API responses using Prisma `select`.
- **List endpoints always include `meta`.** Every paginated response includes `{ data: [...], meta: { page, pageSize, total, totalPages } }`. This shape is never omitted, even when the result set is empty.

---

## 9. Security Requirements

- **No secrets in code.** API keys, database URLs, tokens, and passwords live exclusively in environment variables or Replit Secrets. No secret value appears in any source file, log, or API response.
- **All user input is validated and sanitised.** Zod schemas are the validation boundary. Input that fails schema validation is rejected with a 400 before reaching any service or database layer.
- **SQL injection is impossible by construction.** All database operations use Prisma's parameterised query API. Raw SQL (`$queryRaw`, `$executeRaw`) is not used unless accompanied by a security review comment.
- **Security-relevant events are logged.** The following events are logged with actor, timestamp, IP address, and request context: authentication (success and failure), permission denial, access to sensitive financial data, and any action that modifies posted or locked records.
- **Least-privilege access.** Each user role receives only the permissions it strictly requires. The permission table is explicit: no role inherits implicit access to undeclared resources.
- **No internal IDs leaked unnecessarily.** UUIDs are acceptable in responses when the client requires them. Sequential auto-increment integers that reveal business volume (e.g., `id: 847`) are not used as primary keys in financial tables.
- **HTTPS only in production.** The application is deployed exclusively over HTTPS. HTTP redirects to HTTPS at the infrastructure level.

---

## 10. Accessibility Requirements (WCAG 2.1 AA)

All interactive UI delivered in a sprint must meet WCAG 2.1 Level AA. The following are the minimum mandatory criteria:

- **1.1.1 — Non-text Content:** Every image, icon used as a control, and decorative graphic has an appropriate `alt` attribute (`alt=""` for decorative, descriptive for informative).
- **1.3.1 — Info and Relationships:** Form fields are associated with `<label>` elements or `aria-label`. Tables use `<th>` with `scope`. Heading levels (`h1`–`h6`) are used in correct hierarchical order.
- **1.4.3 — Contrast (Minimum):** Normal text has a contrast ratio of at least **4.5:1** against its background. Large text (18pt / 14pt bold) has at least **3:1**. Status badges, placeholder text, and disabled control labels are not exempt.
- **1.4.11 — Non-text Contrast:** UI components (buttons, form field borders, focus indicators) have a contrast ratio of at least **3:1** against adjacent colours.
- **2.1.1 — Keyboard:** All functionality is operable via keyboard alone. No keyboard trap exists — pressing Escape always closes a modal or dropdown.
- **2.4.3 — Focus Order:** The focus sequence follows a logical reading order. Custom components that manage focus (modals, dropdowns, date pickers) return focus to the trigger element on close.
- **2.4.7 — Focus Visible:** The focused element always has a visible focus indicator. The default browser outline must not be removed without providing an equivalent custom indicator.
- **3.1.1 — Language of Page:** The `<html lang="...">` attribute is set to `ar` when the UI is in Arabic and `en` when in English. Language switches update this attribute without a page reload.
- **3.2.2 — On Input:** Changing the value of a form control (e.g., a select or checkbox) does not automatically submit the form or cause an unexpected context change.
- **4.1.2 — Name, Role, Value:** Every custom interactive widget (comboboxes, data tables with sortable headers, status badges with click actions, approval timeline action buttons) exposes its name, role, and current state via ARIA attributes.

---

## 11. Performance Requirements

- **Initial page load — Time to Interactive ≤ 3 seconds** on a 10 Mbps connection for authenticated pages in production.
- **API response time — P95 ≤ 500 ms** for all list endpoints under normal load (up to 10,000 records, organisation-scoped). Measured at the server; excludes network transit.
- **API response time — P95 ≤ 200 ms** for single-record GET, PATCH, and soft-delete endpoints.
- **No unbounded result sets.** Every list endpoint has a maximum `pageSize` enforced server-side (≤ 100 records per page).
- **No N+1 queries.** Verified by reviewing Prisma query logs in development for any list operation added in the sprint. Every relation needed for the response is eager-loaded in a single query.
- **Database queries are indexed.** Every new `WHERE` clause filter column introduced in a sprint has a corresponding index. Verified using `EXPLAIN ANALYZE` for any query that touches a table with more than 1,000 rows.
- **Bundle size impact is reviewed.** Any new npm dependency added to the frontend must be assessed for bundle size impact. Dependencies that add > 50 KB (gzipped) to the bundle require explicit justification.
- **No memory leaks in React components.** All `useEffect` hooks that set up subscriptions, timers, or event listeners include a cleanup function.

---

## 12. Internationalization Requirements

- **Completeness: 100%.** Every string that appears in the UI — labels, placeholders, button text, toast messages, error messages, empty state descriptions, column headers, status badge labels, confirmation dialog text, and ARIA labels — has a translation entry in both `en` (English) and `ar` (Arabic).
- **No hardcoded strings in JSX.** All user-facing strings are accessed through the `t()` function from `useLanguage()`. No string literal that a user might read is written directly in JSX markup.
- **RTL layout is verified.** After any new page or component is added, a screenshot in RTL mode is included in the sprint completion report. All layout, spacing, icon direction (chevrons, arrows), and text alignment must be correct in RTL.
- **Number and date formatting is locale-aware.** Monetary amounts display in the user's locale format. Dates use `YYYY-MM-DD` in data interchange and locale-appropriate display formats in the UI. Arabic numerals (٠١٢٣٤٥٦٧٨٩) are used in Arabic locale views where appropriate.
- **Arabic is right-to-left at the character level.** Arabic text fields use `dir="rtl"`. Mixed-direction fields (e.g., reference codes that may contain Latin characters) are validated for correct BiDi rendering.
- **Language switching is instant.** Switching between Arabic and English requires no page reload, no API call, and no loss of UI state (open dialogs, partially entered form data, current pagination position).
- **Translation keys follow a consistent naming convention.** Keys are dot-separated, scoped to domain and entity: `je.status.DRAFT`, `je.action.submit`, `costCenter.label.code`, etc. A translation key is never deleted — only deprecated (marked with a `_deprecated` suffix) until the consuming code is removed.

---

## 13. Testing Requirements

### Required test coverage per sprint

| Layer | Minimum Required |
|-------|-----------------|
| Utility functions (pure logic) | 1 unit test per exported function; edge cases covered |
| Zod schemas | 1 test per schema: valid payload passes; each required field rejected individually |
| API route handlers (integration) | 1 test per happy path; 1 test per documented error case (400, 401, 403, 404, 409) |
| Frontend pages (E2E) | Required from Sprint 2.3 onward; 1 E2E test per critical user flow |
| Regression | All tests from prior sprints continue to pass |

### Test quality standards

- **Tests are independent.** Every test sets up its own state and cleans up after itself. No test relies on the execution order or side effects of another test.
- **Mocks are minimal and explicit.** Only the dependencies that are not under test are mocked. Mocks document what behaviour they simulate with a comment.
- **Tests are named descriptively.** Test names state the scenario and expected outcome in plain English: `POST — closed fiscal year → 400 with 'not open' error`. Not `"test POST endpoint"`.
- **All assertions are specific.** `expect(res.status).toBe(400)` and `expect(res.body.error).toMatch(/not open/i)` — not `expect(res.body).toBeTruthy()`.
- **Integration tests verify the WHERE clause, not just the response.** For any filter that is security-critical (e.g., `deletedAt: null`, `organizationId`), the test inspects the mock call arguments to confirm the filter is present — not only that the response looks correct.
- **Zero test skips at sprint close.** No `it.skip`, `xit`, or `describe.skip` may remain in the test suite when the sprint is marked complete. Skipped tests are either fixed or removed with a documented reason.
- **`pnpm test` exits with code 0.** All test files are collected and executed. The final run is included verbatim in the sprint completion report.

---

## 14. Documentation Requirements

- **Sprint completion report is delivered.** Every completed sprint is accompanied by a structured completion report covering: all acceptance criteria (✅ / N/A / ⚠️), test results (verbatim output), TypeScript baseline table, UI screenshots, and a list of any open exceptions with follow-up sprint references.
- **OpenAPI spec is current.** `lib/api-spec/openapi.yaml` reflects every endpoint introduced or modified in the sprint. Codegen has been re-run and any generated client code is committed.
- **`DECISIONS.md` is updated.** Any architectural decision made during the sprint that is not already documented — choice of library, schema design tradeoff, deferred feature rationale — is recorded as a new ADR entry before sprint close.
- **In-code documentation is maintained.** Complex service functions, non-obvious Prisma queries, and financial calculation logic have JSDoc comments explaining the business rule they enforce, not just what the code does.
- **`PROJECT_RULES.md` is updated if a new standard is adopted.** If the sprint introduces a convention that should apply to all future sprints, the Project Constitution is updated in the same commit.
- **Translation key list is documented.** Each sprint that adds translation keys includes a table of new keys (key name, English value, Arabic value) in its completion report.

---

## 15. Code Review Requirements

- **Every change is reviewed before the sprint is closed.** The technical architect reviews the implementation against this DoD and the sprint's acceptance criteria. No sprint advances without this review.
- **Review covers all layers.** The review must include: API routes, service logic, Prisma queries, Zod schemas, React components, translation keys, test files, OpenAPI spec, and Prisma migrations.
- **Review comments are resolved, not just acknowledged.** Every comment raised during the sprint review is either: (a) resolved with a code change, (b) explicitly accepted as a documented exception, or (c) escalated to a new issue with a follow-up sprint reference.
- **No approval under time pressure.** If a review cannot be completed thoroughly, the sprint is held open. An incomplete review is not a review.
- **TypeScript errors are part of the review.** The reviewer runs `tsc --noEmit` locally or inspects the baseline table in the completion report. A sprint with new TypeScript errors introduced is not approved.

---

## 16. Release Requirements

A sprint passes release only when all six gates are cleared **in this order**. No gate may be bypassed.

| # | Gate | Passing Condition |
|---|------|------------------|
| 1 | **Documentation** | Sprint completion report delivered; OpenAPI spec updated; `DECISIONS.md` updated; translation keys documented |
| 2 | **Tests** | `pnpm --filter @workspace/api-server test` exits code 0; all tests collected; zero skips |
| 3 | **TypeScript** | Baseline table shows: errors after ≤ errors before; zero new errors introduced |
| 4 | **Build** | `pnpm build` (api-server + mans-erp) exits code 0; no build warnings treated as errors |
| 5 | **Database** | All new migrations applied cleanly to the development database; migration history is consistent; no pending migrations remain |
| 6 | **Architect approval** | Technical architect gives explicit written sign-off; no sprint plan is activated before this confirmation |

**Failure at any gate halts the sprint.** The sprint remains open until the gate is cleared. Partial passage (gates 1–3 passed, gate 4 failing) is not a release.

---

## 17. Final Completion Checklist

This checklist must be completed and submitted as part of every sprint completion report. Each item must be marked ✅, N/A (with justification), or ⚠️ Exception (with a follow-up sprint reference). No sprint is approved with an unchecked item.

---

### Architecture

- [ ] All business logic lives in services — no business logic in route handlers or React components
- [ ] No duplicate business logic exists; shared logic is extracted to a utility or service
- [ ] Layering is respected: no layer skips (Route → Controller → Service → Repository → Database)
- [ ] Cross-module dependencies go through exported interfaces, not internal imports

### Backend

- [ ] Every request body, query parameter, and route parameter is validated with an explicit Zod schema
- [ ] No raw `req.body` or `req.query` values are passed to Prisma or any service
- [ ] All multi-write operations are wrapped in a Prisma transaction
- [ ] Audit log entries are written for every create, update, and soft-delete operation
- [ ] No `console.log` statements remain in production code paths
- [ ] `strict: true` is set in all `tsconfig.json` files; no new `any` without a justification comment

### Frontend

- [ ] Every new page implements all five UI states (Loading, Empty, Error, Success, Responsive)
- [ ] No hardcoded directional CSS (`left`, `right`, `margin-left`, etc.) — logical properties used throughout
- [ ] All interactive elements are keyboard-accessible (Tab, Enter, Escape)
- [ ] Forms show field-level inline validation errors in both English and Arabic
- [ ] No mock/fixture data remains in production code paths
- [ ] All server state is managed through `@workspace/api-client-react` hooks
- [ ] Query invalidation is correct — UI reflects mutations without a full page reload

### Database

- [ ] Every schema change is delivered as a Prisma migration — no direct SQL DDL
- [ ] Soft delete is used — no `prisma.entity.delete()` calls introduced
- [ ] Every new list query includes `where: { deletedAt: null }`
- [ ] Every new foreign key column has an index
- [ ] Monetary fields use Prisma `Decimal` — no `Float` types introduced
- [ ] New migrations have been applied cleanly; `prisma migrate status` shows no pending migrations

### API

- [ ] All endpoints follow RESTful conventions; correct HTTP verbs and status codes used
- [ ] Every error response uses `{ error: string }` shape — no raw errors or stack traces exposed
- [ ] OpenAPI spec (`lib/api-spec/openapi.yaml`) updated for every new or modified endpoint
- [ ] API codegen re-run after spec changes; generated client committed
- [ ] Every non-public endpoint has `requireAuth()` middleware applied
- [ ] RBAC enforced per endpoint; allowed roles are declared explicitly
- [ ] Every list endpoint returns `{ data: [...], meta: { page, pageSize, total, totalPages } }`

### Security

- [ ] No secrets, tokens, or credentials appear in any source file
- [ ] All user input is validated by Zod before reaching any service or database layer
- [ ] No raw SQL (`$queryRaw`, `$executeRaw`) introduced without a security review comment
- [ ] Security-relevant events are logged (auth failures, permission denials, sensitive data access)
- [ ] Sensitive fields are stripped from all API responses

### Accessibility (WCAG 2.1 AA)

- [ ] All images and icon-buttons have appropriate `alt` / `aria-label` attributes
- [ ] All form fields are associated with a `<label>` or `aria-label`
- [ ] Text contrast ratio ≥ 4.5:1 for normal text; ≥ 3:1 for large text and UI components
- [ ] Focus order is logical; no keyboard trap exists; Escape closes all modals and dropdowns
- [ ] Visible focus indicator present on all interactive elements
- [ ] `<html lang="...">` attribute is correct and updates on language switch
- [ ] All custom interactive widgets expose correct ARIA name, role, and state

### Performance

- [ ] No N+1 queries — all related data is eager-loaded in a single Prisma query
- [ ] Every `findMany` call includes a `take` limit; no unbounded queries
- [ ] All new filter columns in `WHERE` clauses have a corresponding database index
- [ ] New npm dependencies assessed for bundle size impact; > 50 KB (gzipped) justified
- [ ] All `useEffect` hooks with subscriptions or timers include a cleanup function

### Internationalization

- [ ] Every user-facing string is translated in both `en` and `ar`
- [ ] No string literal readable by a user appears directly in JSX markup — all via `t()`
- [ ] RTL layout screenshot included in completion report; all layout correct in RTL mode
- [ ] Monetary amounts and dates use locale-aware formatting
- [ ] New translation keys follow the dot-separated naming convention; listed in completion report

### Testing

- [ ] Unit tests: 1 test per exported utility function; edge cases covered
- [ ] Zod schema tests: valid payload passes; each required field tested individually
- [ ] Integration tests: 1 test per happy path; 1 test per documented error case
- [ ] E2E tests: 1 test per critical user flow (required from Sprint 2.3 onward)
- [ ] Test names describe scenario and expected outcome in plain English
- [ ] All assertions are specific — no `toBeTruthy()` where a value can be asserted directly
- [ ] Security-critical filters (`deletedAt: null`, `organizationId`) verified in mock call arguments
- [ ] Zero skipped tests (`it.skip`, `xit`, `describe.skip`) in the committed test suite
- [ ] `pnpm --filter @workspace/api-server test` output (verbatim) included in completion report

### Documentation

- [ ] Sprint completion report delivered with all sections completed
- [ ] `DECISIONS.md` updated with any new ADR entries
- [ ] In-code JSDoc comments added to complex service functions and financial calculations
- [ ] New translation keys listed in completion report (key / EN value / AR value)
- [ ] `PROJECT_RULES.md` updated if a new convention was established in this sprint

### Code Review

- [ ] Technical architect has reviewed the implementation against this DoD
- [ ] All review comments are resolved, accepted as a documented exception, or assigned to a follow-up sprint

### Release Gates

- [ ] **Gate 1 — Documentation:** Sprint completion report, OpenAPI spec, DECISIONS.md, translation keys all updated
- [ ] **Gate 2 — Tests:** `pnpm test` exits code 0; zero skips; output attached
- [ ] **Gate 3 — TypeScript:** Baseline table confirms zero new errors introduced
- [ ] **Gate 4 — Build:** `pnpm build` exits code 0 for api-server and mans-erp
- [ ] **Gate 5 — Database:** All migrations applied; no pending migrations
- [ ] **Gate 6 — Architect Approval:** Written sign-off received; next sprint plan not activated until this is confirmed

---

> **Sprint is complete only when every applicable checkbox above is checked.**
> Items marked N/A must include a one-line justification in the completion report.
> Items marked ⚠️ Exception must include a follow-up sprint reference and owner.

---

*Document version: 1.0*
*Created: 2026-06-30*
*Owner: Technical Architect — Mans ERP Project*
*Authority: Subordinate to `PROJECT_RULES.md`; supersedes all other quality criteria*
