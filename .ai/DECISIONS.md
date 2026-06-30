# Mans ERP — Architecture Decision Records (ADR)

> This file is a permanent log of every important architectural and business decision made during the development of Mans ERP.
> Historical decisions are never deleted. Superseded decisions are marked as such and linked to the decision that replaces them.
> Every future decision must follow the ADR format below.

---

## ADR-001

**Decision:** PostgreSQL is the only supported database.

**Reason:** PostgreSQL provides the strongest guarantees for financial data: ACID compliance, row-level locking, mature support for `Decimal` precision, and robust indexing. It is well-supported in cloud environments relevant to Saudi infrastructure. Supporting multiple database engines would introduce inconsistency and increase maintenance cost.

**Consequences:** All schema design, query optimization, and migration tooling is PostgreSQL-specific. No SQLite, MySQL, or other engines are permitted — not even for local development or testing.

---

## ADR-002

**Decision:** Prisma is the ORM.

**Reason:** Prisma provides type-safe database access tightly integrated with TypeScript, a declarative schema language, first-class migration tooling, and excellent developer experience. It eliminates raw SQL errors and keeps the schema as the single source of truth.

**Consequences:** All database access goes through Prisma Client. Raw SQL is only permitted for performance-critical queries that cannot be expressed through Prisma's API, and must be documented with justification. `prisma.xxx.delete()` is forbidden — soft-delete via `deletedAt` is used everywhere.

---

## ADR-003

**Decision:** TypeScript only — no JavaScript files in the codebase.

**Reason:** TypeScript enforces type correctness at compile time, which is critical for a financial application where data shape errors can cause accounting inconsistencies. `strict: true` is enabled in all `tsconfig.json` files.

**Consequences:** All source files (frontend, backend, shared libraries) must be `.ts` or `.tsx`. No `.js` files. No `any` without documented justification. No `@ts-ignore` without an explanation comment.

---

## ADR-004

**Decision:** Arabic is the primary language of the application.

**Reason:** The target users are Saudi nonprofit organizations operating primarily in Arabic. Arabic must be the default language and must have complete translation coverage. English is the secondary language.

**Consequences:** Every user-facing string must have an Arabic translation. The Arabic translation is added first. Missing Arabic translations are treated as bugs, not enhancements.

---

## ADR-005

**Decision:** RTL (right-to-left) layout is mandatory throughout the application.

**Reason:** Arabic is written right-to-left. The entire UI must be designed and implemented for RTL from the start, not retrofitted. A non-RTL interface is unusable for Arabic-speaking users.

**Consequences:** All CSS must use logical properties (`start`/`end`, `inline`/`block`) instead of physical properties (`left`/`right`). Every new component must be tested in RTL mode before it is considered complete. `dir="rtl"` is set at the document root.

---

## ADR-006

**Decision:** UUID primary keys for all database tables.

**Reason:** UUIDs prevent sequential ID enumeration attacks, allow client-side ID generation, and are safe for use in URLs and API responses without exposing record counts or insertion order.

**Consequences:** All `id` fields use `String @id @default(uuid())` in Prisma schema. Integer auto-increment IDs are not permitted. UUIDs are used in all API routes and responses.

---

## ADR-007

**Decision:** Soft delete by default — no hard deletes on business entities.

**Reason:** Financial and operational data must be recoverable and auditable. Hard deletes destroy the audit trail and may violate regulatory requirements. Soft delete preserves data integrity and supports compliance.

**Consequences:** Every business entity table has a `deletedAt DateTime?` column. All queries must include `where: { deletedAt: null }` to exclude soft-deleted records. `prisma.xxx.delete()` is forbidden. Delete operations set `deletedAt` to the current timestamp.

---

## ADR-008

**Decision:** Audit logs are written for every data mutation.

**Reason:** Financial systems require a complete, tamper-evident history of every change to business data. This is required for internal governance, external audits, and regulatory compliance.

**Consequences:** Every create, update, and soft-delete operation on a business entity must produce an audit log entry containing: entity type, entity ID, action type, actor (user ID), timestamp, before-state (JSON), and after-state (JSON). No mutation may bypass audit logging.

---

## ADR-009

**Decision:** RBAC (Role-Based Access Control) is enforced on all protected API endpoints.

**Reason:** Different user roles (accountant, auditor, manager, admin) have different data access rights. Authentication alone is insufficient — authorization must be checked at every endpoint.

**Consequences:** Every non-public endpoint must declare its required role(s) explicitly. The RBAC middleware runs after authentication. The default stance is deny — access is granted only when a role is explicitly permitted. Roles and permissions are stored in the database and enforced at the service layer.

---

## ADR-010

**Decision:** Business rules belong exclusively in the service layer, never in controllers or route handlers.

**Reason:** Controllers that contain business logic cannot be unit-tested without HTTP overhead, cannot be reused across different entry points, and violate the single-responsibility principle. Keeping business logic in services ensures it is testable, reusable, and consistent.

**Consequences:** Controller methods do exactly three things: parse and validate the request, call a service method, and return the response. All domain decisions, validations, calculations, and side effects (audit logs, notifications) live in service classes. Reviewers will reject PRs that place business logic in controllers.

---

## ADR-011

**Decision:** Posted accounting transactions are immutable.

**Reason:** Double-entry accounting requires that the historical record cannot be altered. Editing or deleting posted journal entries would invalidate the ledger, destroy the audit trail, and violate fundamental accounting principles.

**Consequences:** Once a journal entry status is set to `POSTED`, no field of that entry or its lines may be updated. Any correction must be made through a reversal entry that creates an equal and opposite transaction. The API must reject any attempt to modify a posted entry with a `409 Conflict` response.

---

## ADR-012

**Decision:** No feature is considered complete without documentation and passing tests.

**Reason:** Code without tests cannot be safely refactored or extended. Documentation without tests creates false confidence. In a financial application, untested code is a liability.

**Consequences:** Every sprint gate requires: unit tests for all service methods, integration tests for critical accounting workflows, TypeScript zero errors, build success, and documentation updated. A feature that passes code review but lacks tests is not merged.

---

*Document version: 1.0*
*Last updated: 2026-06-30*
*Owner: Technical Architect — Mans ERP Project*
*Rule: Historical decisions are never deleted. Superseded decisions are annotated, not removed.*
