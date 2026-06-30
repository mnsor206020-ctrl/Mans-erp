# Mans ERP — Project Roadmap

> Cloud ERP for nonprofit organizations and charities in Saudi Arabia.
> A scalable, bilingual (Arabic/English), production-ready platform built on modern web technologies.

---

## Vision

Mans ERP aims to become the standard operating platform for the Saudi nonprofit sector — giving charities, foundations, and NGOs the financial control, operational visibility, and compliance infrastructure they need to fulfill their missions with confidence.

---

## Release Stages

### Foundation (Completed)

The project foundation is live. The following have been implemented:

| Area | Status | Details |
|---|---|---|
| Project scaffold | Done | pnpm monorepo, TypeScript 5, React 18, Vite, Tailwind CSS 4 |
| Authentication | Done | Clerk (Replit-managed), email/password + Google/GitHub SSO |
| Database ORM | Done | PostgreSQL + Prisma ORM, 22 tables |
| API layer | Done | Express 5, OpenAPI spec, Orval codegen, TanStack Query hooks |
| Dashboard UI | Done | Sidebar layout, header, stats cards, activity feed |
| Landing page | Done | Bilingual public-facing marketing page |
| Organization management | Done | List, create, update organizations |
| User management | Done | Profile view and update |
| Settings page | Done | User profile |
| Arabic RTL support | Done | Full bidirectional layout, Noto Sans Arabic, language toggle |
| Dark/light theme | Done | next-themes, persistent preference |
| Database schema | Done | 22 tables, UUID PKs, soft delete, indexes, foreign keys |
| Reference data | Done | 11 currencies, 11 Saudi banks, 47 COA entries, 6 roles, 133 permissions |

---

## Phase 1 — Core Accounting Module

**Goal:** Enable organizations to record, review, and close their books.

### 1.1 Chart of Accounts Management
- View the seeded 5-level COA tree (Assets / Liabilities / Equity / Revenue / Expenses)
- Create, edit, and deactivate accounts
- Move accounts within the hierarchy
- Import/export COA as Excel

### 1.2 Fiscal Year Management
- Create and manage fiscal years
- Open / Close / Lock fiscal years
- Prevent posting to closed periods

### 1.3 Journal Entry Module
- Manual journal entry creation (debit/credit lines)
- Auto-balance validation before posting
- Multi-currency entries with exchange rate lookup
- Cost center allocation per line
- Draft → Post → Void workflow
- Journal entry search, filter, and print

### 1.4 Cost Center Management
- View and manage the seeded 8 cost center hierarchy
- Assign cost centers to journal entry lines
- Cost center budget allocation (future)

### 1.5 Currency & Exchange Rate Management
- View 11 seeded currencies (SAR base + GCC + major)
- Add/update exchange rates
- Daily rate import

### 1.6 General Ledger Reports
- Trial balance
- Account statement (ledger card)
- Income statement (revenue vs. expense)
- Balance sheet

---

## Phase 2 — Cash & Banking Module

**Goal:** Track every dirham entering and leaving the organization.

### 2.1 Bank Account Management
- Register bank accounts (linked to 11 seeded Saudi banks)
- Opening balance setup
- Account statement view

### 2.2 Cash Box Management
- Create and manage petty cash boxes per branch
- Opening balance tracking

### 2.3 Receipt Vouchers
- Record cash and bank receipts
- Link to donor / payer
- Payment method: cash, bank transfer, cheque, online
- Auto-generate journal entry on confirmation
- Cheque tracking (number, date, bank)

### 2.4 Payment Vouchers
- Record cash and bank payments
- Link to vendor / payee
- Auto-generate journal entry on confirmation
- Cheque management

### 2.5 Petty Cash Management
- Record IN / OUT petty cash transactions
- Category assignment
- Petty cash replenishment voucher
- Balance tracking

### 2.6 Bank Reconciliation
- Statement import (manual entry)
- Match bank transactions to system records
- Reconciliation report

---

## Phase 3 — Donors & Beneficiaries Module

**Goal:** Track who gives and who receives.

### 3.1 Donor Management
- Donor registry (individuals + corporations)
- Donation history per donor
- Donor classification (regular, major, anonymous, zakat)
- Donor receipts and acknowledgement letters

### 3.2 Beneficiary Management
- Beneficiary registry with eligibility criteria
- Case management
- Aid history per beneficiary
- Family unit tracking

### 3.3 Donation Types
- One-time donations
- Recurring donations
- Restricted donations (project-specific)
- Zakat donations
- Waqf (endowment) contributions

---

## Phase 4 — Projects & Programs Module

**Goal:** Manage the organization's programs from budget to completion.

### 4.1 Project Registry
- Create and categorize projects / programs
- Budget allocation per project
- Project timeline (start/end dates)
- Status: Planning / Active / Completed / Suspended

### 4.2 Project Budgeting
- Budget lines per project (by COA account)
- Budget vs. actual tracking
- Budget amendment workflow

### 4.3 Project Reporting
- Project financial summary
- Budget utilization report
- Project-level income/expense statement

---

## Phase 5 — Human Resources Module

**Goal:** Manage staff and volunteers.

### 5.1 Employee Registry
- Employee profiles (Arabic + English)
- Department and branch assignment
- Employment type: full-time, part-time, contractor

### 5.2 Volunteer Management
- Volunteer registry
- Activity log
- Volunteer hours tracking

### 5.3 Payroll (Basic)
- Salary structure
- Monthly payroll run
- Payroll journal entry generation
- Payslip generation

---

## Phase 6 — Compliance & Reporting Module

**Goal:** Satisfy Saudi regulatory and internal audit requirements.

### 6.1 Zakat & Tax Reporting
- Zakat computation worksheet
- VAT tracking (if applicable)
- Government report formats

### 6.2 Audit Module
- Full audit log viewer (already recorded in DB)
- Audit trail reports by user, date, entity
- Immutable log export

### 6.3 Board Reports
- Executive summary dashboard
- Quarterly financial reports
- Annual report package export (PDF)

### 6.4 Document Management
- Attachment upload to any entity (already modeled in DB)
- Document versioning
- Folder-based organization

---

## Phase 7 — Advanced Features

### 7.1 Multi-Organization Support
- Organization switching
- Consolidated group reports

### 7.2 Role-Based Access Control (UI)
- Permission matrix management screen
- Role assignment UI
- Fine-grained route/feature guards

### 7.3 Notifications & Alerts
- In-app notification center
- Email notifications for approvals, confirmations, deadlines
- Budget overspend alerts

### 7.4 Mobile App
- React Native / Expo companion app
- Quick receipts entry on the go
- Approval workflows

### 7.5 Integrations
- Saudi Open Banking API (Tarabut Gateway)
- Mada payment gateway
- Ministry of Human Resources API
- Absher e-Government portal

---

## Technical Debt & Ongoing Work

| Item | Priority |
|---|---|
| OpenAPI spec coverage for all new Phase 1 endpoints | High |
| End-to-end test suite (Playwright) | High |
| Error boundary and global error handling on frontend | Medium |
| Rate limiting on API server | Medium |
| Database connection pooling (PgBouncer) | Medium |
| Docker Compose for local dev | Low |
| CI/CD pipeline | Low |

---

## Release Naming Convention

| Stage | Name |
|---|---|
| Foundation | `v0.1` |
| Phase 1 | `v1.0` — First public release |
| Phase 2 | `v1.1` |
| Phase 3 | `v1.2` |
| Phase 4 | `v1.3` |
| Phase 5 | `v2.0` |
| Phase 6 | `v2.1` |
| Phase 7 | `v3.0` |
