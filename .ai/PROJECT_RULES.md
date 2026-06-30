# Mans ERP — Project Constitution

> This document is the highest-priority reference for all development on the Mans ERP project.
> It supersedes any conflicting convention, shortcut, or personal preference.
> Every rule here is binding. No exception is permitted without explicit written approval from the technical architect.
> All AI-assisted and human development must comply with this constitution before any implementation begins.

---

## 1. Sprint & Approval Governance

- **Never implement a new sprint without explicit user approval.**
  Present the full implementation plan and wait for a green light before writing a single line of code.
- **Always propose an implementation plan first.**
  The plan must include: scope, affected files, database changes, API changes, UI changes, estimated effort, and risks.
- **Never skip roadmap phases.**
  Phases must be completed in order. A phase is only closed when all its acceptance criteria are met and confirmed by the architect.
- **Stop after every completed task and report status.**
  Do not proceed to the next task autonomously. Wait for confirmation.

---

## 2. Architecture

- **Never create duplicate business logic.**
  If logic exists in one place, reuse it. Never copy-paste business rules across modules.
- **Business rules belong in services, never controllers.**
  Controllers receive requests, delegate to services, and return responses. No business logic, database queries, or domain decisions live in a controller.
- **Controllers must remain thin.**
  A controller method should do nothing more than: validate input, call a service, and return a response.
- **Use dependency injection where appropriate.**
  Services and repositories must be injectable and testable in isolation. Avoid tight coupling between modules.
- **Keep modules isolated.**
  Each domain module (Accounting, HR, Inventory, etc.) must be self-contained. Cross-module dependencies must go through well-defined interfaces, never direct internal access.
- **Prefer clean architecture.**
  Enforce the layering: Routes → Controllers → Services → Repositories → Database. No layer may skip or bypass another.
- **Keep components reusable.**
  UI components must be generic and composable. Business logic must not be embedded inside presentational components.

---

## 3. Code Quality Standards

- **Production-ready code only.**
  No placeholders, no TODO comments in shipped code, no mock data in production paths, no `console.log` statements in production builds.
- **Keep TypeScript strict mode at all times.**
  `strict: true` must remain enabled in every `tsconfig.json`. No use of `any` without a documented justification comment. No `@ts-ignore` without an explanation.
- **Keep the codebase enterprise-grade.**
  Every module must be clean, well-structured, and maintainable by a team. Avoid shortcuts that create technical debt.
- **Never remove code without explanation.**
  Any deletion must be accompanied by a comment in the pull request or commit message explaining what was removed and why.
- **Never break existing features.**
  Before merging any change, verify that all previously working features remain functional. Run regression checks on affected modules.

---

## 4. UI / UX Standards

- **Every page must include all five states:**
  1. **Loading state** — show a skeleton or spinner while data is being fetched.
  2. **Empty state** — show a meaningful message and a call-to-action when there is no data.
  3. **Error state** — show a clear, actionable error message when something fails.
  4. **Success feedback** — confirm completed actions with a toast, alert, or visual indicator.
  5. **Responsive layout** — every page must work correctly on mobile, tablet, and desktop viewports.
- **Use consistent spacing and typography.**
  Follow the design system tokens. Never hard-code pixel values for spacing or font sizes outside of the token system.
- **Accessibility is required.**
  All interactive elements must be keyboard-navigable. Provide ARIA labels where needed. Maintain sufficient color contrast ratios (WCAG 2.1 AA minimum).

---

## 5. Database & Schema Rules

- **Always use Prisma migrations.**
  Never modify the database schema manually or directly via SQL DDL outside of a tracked Prisma migration.
- **Never modify database schema without a migration.**
  Every schema change — column add, column rename, index, relation — must go through `prisma migrate dev` in development and `prisma migrate deploy` in production.
- **Soft-delete only.**
  Never use `prisma.xxx.delete()`. All records must use `deletedAt` timestamps. Always filter with `where: { deletedAt: null }` in queries.
- **Add indexes where necessary.**
  Every foreign key, every frequently-filtered column, and every column used in ORDER BY must have an appropriate index. Justify the absence of an index explicitly.
- **Audit Logs for every data mutation.**
  Every create, update, and delete operation on any business entity must produce a corresponding audit log entry recording: entity type, entity ID, action, actor (user ID), timestamp, before state, and after state.

---

## 6. API Design & Validation

- **Validate every input.**
  Every request body, query parameter, and route parameter must be validated using Zod schemas. Never trust raw user input.
- **Sanitize all user data.**
  Strip, escape, or reject any data that could be used for injection attacks before it reaches the database or any downstream system.
- **Use RBAC on all protected endpoints.**
  Every non-public API endpoint must enforce Role-Based Access Control. Define allowed roles explicitly per endpoint. No endpoint may rely on authentication alone without authorization.
- **Enforce least-privilege permissions.**
  Every role must have only the permissions it strictly needs. Default to deny; explicitly grant access.
- **Never expose sensitive data in API responses.**
  Strip passwords, internal IDs, system fields, and any PII that is not required by the client from every API response.
- **Log security-relevant events.**
  Authentication attempts (success and failure), permission denials, and any access to sensitive data must be logged with actor, timestamp, and context.
- **Follow RESTful conventions.**
  Use correct HTTP verbs. Return appropriate HTTP status codes. Use consistent error response shapes.
- **OpenAPI spec must stay in sync.**
  Every new or modified endpoint must be reflected in the OpenAPI specification. Run codegen after every API change.

---

## 7. Accounting & Financial Rules

- **Never violate double-entry accounting.**
  Every journal entry must balance: total debits must equal total credits. This must be enforced at the service layer and validated before any posting.
- **Posted transactions are immutable.**
  Once a journal entry is posted, it cannot be edited or deleted under any circumstances.
- **Reversal entries only.**
  Corrections to posted entries must be made exclusively through reversal journal entries that create an offsetting record.
- **Fiscal periods control every posting.**
  No entry may be posted to a closed fiscal period. Period status must be checked at the service layer before every posting operation.
- **Every financial operation must be auditable.**
  The full lifecycle of every financial transaction — draft, review, approval, posting, reversal — must be traceable through audit logs.
- **Never allow direct balance manipulation.**
  Account balances must only change as a result of posted journal entries. No direct balance field updates are permitted.
- **Currency and precision.**
  All monetary values must be stored as integers (halala/cents) or `Decimal` with sufficient precision. Never use floating-point arithmetic for financial calculations.

---

## 8. Performance

- **Avoid N+1 database queries.**
  Use Prisma `include` or `select` to eager-load related data in a single query. Never fetch related records inside a loop.
- **Use pagination by default.**
  Every list endpoint must support and default to cursor-based or offset pagination. Never return unbounded result sets.
- **Add indexes where necessary.**
  Profile slow queries. Add composite indexes for multi-column filters and sort keys.
- **Optimize expensive queries.**
  Any query that scans a large table must be reviewed and optimized before it reaches production. Use `EXPLAIN ANALYZE` to verify query plans.

---

## 9. Testing

- **Every backend feature must include unit tests.**
  Services and utility functions must be covered by unit tests with mocked dependencies.
- **Critical accounting workflows require integration tests.**
  Journal entry creation, posting, reversal, fiscal period management, and account balance calculations must be covered by integration tests against a real test database.
- **No sprint is complete without passing tests.**
  A sprint is not closed until all tests pass, TypeScript reports zero errors, and the build succeeds cleanly.

---

## 10. Internationalisation & Accessibility

- **Arabic is the primary language.**
  All user-facing text must have an Arabic translation. Arabic translations take precedence in case of conflict.
- **RTL support is mandatory.**
  Every UI component, layout, and page must render correctly in right-to-left mode. Never hard-code left/right directional values in CSS; use `start`/`end` logical properties.
- **English is the secondary language.**
  The application must function fully in both Arabic and English. Language switching must not require a page reload.

---

## 11. Security

- **Never commit secrets or credentials.**
  API keys, tokens, passwords, and connection strings must always live in environment variables or Replit Secrets. Never hard-code them.
- **Validate every input.** *(see § 6)*
- **Sanitize all user data.** *(see § 6)*
- **Enforce least-privilege permissions.** *(see § 6)*
- **Never expose sensitive data in API responses.** *(see § 6)*
- **Log security-relevant events.** *(see § 6)*

---

## 12. Documentation

- **Update documentation after every completed sprint.**
  The following must be updated at sprint close: `README.md` (if applicable), API documentation, any affected module-level docs, and `replit.md` project overview.
- **Keep this document current.**
  If a rule changes or a new standard is adopted, update this file in the same commit that introduces the change.

---

## 13. Version Control

- **Commit messages must be descriptive.**
  Follow the format: `type(scope): short description`. Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
- **One logical change per commit.**
  Do not bundle unrelated changes. Each commit must represent a single coherent unit of work.
- **Never force-push to main.**
  The `main` branch is protected. All changes go through review before merge.

---

## 14. Release Process

Each sprint is considered complete only when **all six gates** are passed in order:

| Gate | Requirement |
|------|-------------|
| 1 | Documentation updated |
| 2 | All tests passing |
| 3 | TypeScript reports zero errors |
| 4 | Build succeeds cleanly |
| 5 | Database migrations verified and applied |
| 6 | Architect gives explicit approval before the next sprint begins |

**No sprint may advance past Gate 6 without written confirmation from the technical architect.**

---

*Document version: 2.0*
*Last updated: 2026-06-30*
*Owner: Technical Architect — Mans ERP Project*
*Priority: HIGHEST — supersedes all other conventions*
