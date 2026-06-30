# Mans ERP — AI Development Rules

> These rules govern all AI-assisted development on the Mans ERP project.
> They are binding for every sprint, every feature, and every code change.
> No exception is permitted without explicit written approval from the technical architect.

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

## 2. Code Quality Standards

- **Production-ready code only.**
  No placeholders, no TODO comments in shipped code, no mock data in production paths, no console.log statements left in production builds.
- **Keep TypeScript strict mode at all times.**
  `strict: true` must remain enabled in every `tsconfig.json`. No use of `any` without a documented justification comment. No `@ts-ignore` without an explanation.
- **Keep the codebase enterprise-grade.**
  Every module must be clean, well-structured, and maintainable by a team. Avoid shortcuts that create technical debt.
- **Keep components reusable.**
  UI components must be generic and composable. Business logic must not be embedded inside presentational components.
- **Prefer clean architecture.**
  Separate concerns clearly: routes → controllers → services → repositories → database. No business logic in route handlers.
- **Never remove code without explanation.**
  Any deletion must be accompanied by a comment in the pull request or commit message explaining what was removed and why.
- **Never break existing features.**
  Before merging any change, verify that all previously working features remain functional. Run regression checks on affected modules.

---

## 3. Database & Schema Rules

- **Always use Prisma migrations.**
  Never modify the database schema manually or directly via SQL DDL outside of a tracked Prisma migration.
- **Never modify database schema without a migration.**
  Every schema change — column add, column rename, index, relation — must go through `prisma migrate dev` in development and `prisma migrate deploy` in production.
- **Soft-delete only.**
  Never use `prisma.xxx.delete()`. All records must use `deletedAt` timestamps. Always filter with `where: { deletedAt: null }` in queries.
- **Audit Logs for every data mutation.**
  Every create, update, and delete operation on any business entity must produce a corresponding audit log entry recording: entity type, entity ID, action, actor (user ID), timestamp, before state, and after state.

---

## 4. API Design & Validation

- **Write validation for every API endpoint.**
  Every request body, query parameter, and route parameter must be validated using Zod schemas. Never trust raw user input.
- **Use RBAC on all protected endpoints.**
  Every non-public API endpoint must enforce Role-Based Access Control. Define allowed roles explicitly per endpoint. No endpoint may rely on authentication alone without authorization.
- **Follow RESTful conventions.**
  Use correct HTTP verbs (GET, POST, PUT, PATCH, DELETE). Return appropriate HTTP status codes. Use consistent error response shapes.
- **OpenAPI spec must stay in sync.**
  Every new or modified endpoint must be reflected in the OpenAPI specification. Run codegen after every API change.

---

## 5. Accounting & Financial Rules

- **Follow accounting best practices at all times.**
  Double-entry bookkeeping must be enforced. Every journal entry must balance (debits = credits). Fiscal periods must be respected.
- **Never allow direct balance manipulation.**
  Account balances must only change as a result of posted journal entries. No direct balance field updates.
- **Financial data is immutable once posted.**
  Posted journal entries cannot be edited or deleted. Corrections must be made through reversing entries.
- **Currency and precision.**
  All monetary values must be stored as integers (halala/cents) or `Decimal` with sufficient precision. Never use floating-point arithmetic for financial calculations.

---

## 6. Internationalisation & Accessibility

- **Arabic is the primary language.**
  All user-facing text must have an Arabic translation. Arabic translations take precedence in case of conflict.
- **RTL support is mandatory.**
  Every UI component, layout, and page must render correctly in right-to-left mode. Never hard-code left/right directional values in CSS; use `start`/`end` logical properties.
- **English is the secondary language.**
  The application must function fully in both Arabic and English. Language switching must not require a page reload.

---

## 7. Documentation

- **Update documentation after every completed sprint.**
  The following must be updated at sprint close: `README.md` (if applicable), API documentation, any affected module-level docs, and `replit.md` project overview.
- **Keep `PROJECT_RULES.md` current.**
  If a rule changes or a new standard is adopted, update this file in the same commit that introduces the change.

---

## 8. Security

- **Never commit secrets or credentials.**
  API keys, tokens, passwords, and connection strings must always live in environment variables or Replit Secrets. Never hard-code them.
- **Sanitize all user input.**
  Validate and sanitize every value that touches the database, the filesystem, or an external API.
- **Enforce least privilege.**
  Every role must have only the permissions it strictly needs. Default to deny; explicitly grant access.

---

## 9. Version Control

- **Commit messages must be descriptive.**
  Follow the format: `type(scope): short description`. Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
- **One logical change per commit.**
  Do not bundle unrelated changes. Each commit must represent a single coherent unit of work.
- **Never force-push to main.**
  The `main` branch is protected. All changes go through review before merge.

---

*Last updated: 2026-06-30*
*Owner: Technical Architect — Mans ERP Project*
