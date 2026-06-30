# Mans ERP — Database Design

---

## Overview

- **Engine:** PostgreSQL (Replit-managed, database: `heliumdb`)
- **ORM:** Prisma 6 (`lib/prisma/prisma/schema.prisma`)
- **Primary keys:** UUID v4 everywhere (`@default(uuid()) @db.Uuid`)
- **Soft delete:** `deletedAt DateTime?` on all mutable entities
- **Timestamps:** `createdAt` and `updatedAt` on all tables
- **Bilingual:** Every entity with a human-readable name carries `nameEn` + `nameAr`
- **Monetary precision:** `Decimal(18,4)` for amounts, `Decimal(18,8)` for exchange rates

---

## Entity Relationship Overview

```
Organization ──< Branch
Organization ──< FiscalYear
Organization ──< ChartOfAccount (self-referential tree)
Organization ──< CostCenter (self-referential tree)
Organization ──< BankAccount >── Bank
Organization ──< CashBox
Organization ──< JournalEntry >── FiscalYear
Organization ──< Receipt >── BankAccount / CashBox
Organization ──< Payment >── BankAccount / CashBox

JournalEntry ──< JournalEntryLine >── ChartOfAccount
JournalEntryLine >── CostCenter

CashBox ──< PettyCash

User >── Organization
User >── Branch
User ──< UserRole >── Role
Role ──< RolePermission >── Permission

Receipt / Payment / PettyCash ──< Attachment
AuditLog >── User
```

---

## Module: Identity & Access

### `users`

The user record is created automatically on first sign-in using the Clerk `userId` as the foreign key.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clerk_id` | TEXT UNIQUE | Maps to Clerk's user ID |
| `email` | TEXT UNIQUE | |
| `first_name_en` | TEXT? | |
| `last_name_en` | TEXT? | |
| `first_name_ar` | TEXT? | |
| `last_name_ar` | TEXT? | |
| `avatar_url` | TEXT? | |
| `phone` | TEXT? | |
| `status` | ENUM | `ACTIVE \| INACTIVE \| SUSPENDED` |
| `organization_id` | UUID FK → organizations | Nullable (super admins have no org) |
| `branch_id` | UUID FK → branches | Nullable |
| `deleted_at` | TIMESTAMPTZ? | Soft delete |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

**Indexes:** `clerk_id`, `email`, `organization_id`, `status`, `deleted_at`

---

### `roles`

System roles are seeded and protected with `is_system = true`. Custom roles can be created by admins.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name_en` | TEXT | |
| `name_ar` | TEXT | |
| `description` | TEXT? | |
| `is_system` | BOOLEAN | System roles cannot be deleted |
| `deleted_at` | TIMESTAMPTZ? | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Seeded system roles:**

| Role | Arabic | Purpose |
|---|---|---|
| Super Admin | مدير النظام | All permissions |
| Organization Admin | مدير المؤسسة | Full org access |
| Accountant | محاسب | Accounting + finance |
| Branch Manager | مدير الفرع | Branch-scoped access |
| Auditor | مراجع الحسابات | Read + export only |
| Viewer | مشاهد | Read-only |

---

### `permissions`

A permission is defined by a `(resource, action)` pair. There are **133 permissions** seeded across 19 resources × 7 actions.

**Resources:** `organizations`, `branches`, `users`, `roles`, `fiscal_years`, `chart_of_accounts`, `cost_centers`, `journal_entries`, `currencies`, `exchange_rates`, `banks`, `bank_accounts`, `cash_boxes`, `receipts`, `payments`, `petty_cash`, `attachments`, `audit_logs`, `reports`

**Actions:** `create`, `read`, `update`, `delete`, `export`, `approve`, `void`

---

### `user_roles` / `role_permissions`

Junction tables enforcing many-to-many relationships with unique constraints.

```sql
-- user_roles unique constraint
UNIQUE (user_id, role_id)

-- role_permissions unique constraint
UNIQUE (role_id, permission_id)
```

---

## Module: Organization Structure

### `organizations`

The top-level entity. All financial data is scoped to an organization.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name_en` | TEXT | |
| `name_ar` | TEXT | |
| `type` | ENUM | `CHARITY \| FOUNDATION \| NGO \| ASSOCIATION \| GOVERNMENT \| OTHER` |
| `status` | ENUM | `ACTIVE \| INACTIVE \| SUSPENDED \| PENDING` |
| `registration_number` | TEXT? | Ministry of Human Resources registration |
| `tax_number` | TEXT? | ZATCA tax number |
| `email` | TEXT? | |
| `phone` | TEXT? | |
| `website` | TEXT? | |
| `address` | TEXT? | |
| `city` | TEXT? | |
| `country` | TEXT | Default: `SA` |
| `logo_url` | TEXT? | |
| `fiscal_year_start` | INT | Month number (1 = January) |
| `base_currency_code` | TEXT | Default: `SAR` |
| `deleted_at` | TIMESTAMPTZ? | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

### `branches`

Physical or administrative branches of an organization. One branch is marked as headquarters.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK → organizations | |
| `name_en` | TEXT | |
| `name_ar` | TEXT | |
| `code` | TEXT | Unique within organization |
| `address` | TEXT? | |
| `city` | TEXT? | |
| `phone` | TEXT? | |
| `email` | TEXT? | |
| `is_headquarters` | BOOLEAN | |
| `deleted_at` | TIMESTAMPTZ? | |

**Unique constraint:** `(organization_id, code)`

---

### `fiscal_years`

Defines the accounting period. Only one fiscal year should be marked `is_default = true` per organization.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK → organizations | |
| `name_en` | TEXT | e.g., "Fiscal Year 2026" |
| `name_ar` | TEXT | e.g., "السنة المالية 2026" |
| `start_date` | DATE | |
| `end_date` | DATE | |
| `status` | ENUM | `OPEN \| CLOSED \| LOCKED` |
| `is_default` | BOOLEAN | Current active fiscal year |
| `closed_at` | TIMESTAMPTZ? | When the year was closed |
| `closed_by_user_id` | UUID? | Who closed it |

**Unique constraint:** `(organization_id, start_date, end_date)`

**Business rules:**
- Only OPEN fiscal years accept new journal entries
- CLOSED years allow adjustment entries only
- LOCKED years are read-only

---

## Module: Chart of Accounts

### `chart_of_accounts`

A hierarchical tree structure. Accounts are organized into 5 levels with parent-child relationships.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK → organizations | |
| `parent_id` | UUID? FK → chart_of_accounts | Self-referential |
| `code` | TEXT | Unique within organization |
| `name_en` | TEXT | |
| `name_ar` | TEXT | |
| `type` | ENUM | `ASSET \| LIABILITY \| EQUITY \| REVENUE \| EXPENSE` |
| `nature` | ENUM | `DEBIT \| CREDIT` |
| `level` | INT | 1–5 |
| `is_group` | BOOLEAN | Group accounts cannot receive direct entries |
| `is_active` | BOOLEAN | |
| `allow_direct_entry` | BOOLEAN | Inverse of is_group |
| `currency_code` | TEXT? | For foreign-currency accounts |

**Seeded COA Structure (47 accounts):**

```
1000  Assets                    [GROUP]
  1100  Current Assets          [GROUP]
    1110  Cash on Hand
    1120  Cash at Banks
    1130  Petty Cash
    1140  Accounts Receivable
    1150  Prepaid Expenses
  1200  Non-Current Assets      [GROUP]
    1210  Fixed Assets          [GROUP]
      1211  Land & Buildings
      1212  Furniture & Fixtures
      1213  Vehicles
      1214  Accumulated Depreciation

2000  Liabilities               [GROUP]
  2100  Current Liabilities     [GROUP]
    2110  Accounts Payable
    2120  Accrued Expenses
    2130  Zakat & Tax Payable
  2200  Non-Current Liabilities [GROUP]
    2210  Long-term Loans

3000  Equity / Net Assets       [GROUP]
  3100  Endowment Fund
  3200  Unrestricted Net Assets
  3300  Restricted Net Assets
  3400  Retained Surplus/Deficit

4000  Revenue                   [GROUP]
  4100  Donations & Grants      [GROUP]
    4110  Public Donations
    4120  Corporate Sponsorships
    4130  Government Grants
    4140  Zakat Receipts
  4200  Investment Income
  4300  Program Revenue
  4400  Membership Fees

5000  Expenses                  [GROUP]
  5100  Program Expenses        [GROUP]
    5110  Beneficiary Aid
    5120  Project Costs
    5130  Volunteer Expenses
  5200  Administrative Expenses [GROUP]
    5210  Salaries & Wages
    5220  Rent & Utilities
    5230  Office Supplies
    5240  Transportation
    5250  Communication
  5300  Fundraising Expenses
  5400  Depreciation
```

**Account Nature by Type:**

| Account Type | Normal Balance | Increases with | Decreases with |
|---|---|---|---|
| Asset | Debit | Debit | Credit |
| Liability | Credit | Credit | Debit |
| Equity | Credit | Credit | Debit |
| Revenue | Credit | Credit | Debit |
| Expense | Debit | Debit | Credit |

---

## Module: Cost Centers

### `cost_centers`

A hierarchical tree for tracking costs by program, department, or activity.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK → organizations | |
| `parent_id` | UUID? FK → cost_centers | Self-referential |
| `code` | TEXT | Unique within organization |
| `name_en` | TEXT | |
| `name_ar` | TEXT | |
| `description` | TEXT? | |
| `is_active` | BOOLEAN | |

**Seeded Cost Centers (8):**

```
CC-00   General | عام
CC-01   Programs & Projects | البرامج والمشاريع
  CC-01-01  Humanitarian Aid | المساعدات الإنسانية
  CC-01-02  Education | التعليم
  CC-01-03  Healthcare | الرعاية الصحية
  CC-01-04  Housing | الإسكان
CC-02   Administration | الإدارة
CC-03   Fundraising | جمع التبرعات
```

---

## Module: Currencies

### `currencies`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `code` | TEXT UNIQUE | ISO 4217 (SAR, USD, EUR…) |
| `name_en` | TEXT | |
| `name_ar` | TEXT | |
| `symbol` | TEXT | ر.س, $, € … |
| `decimal_places` | INT | 2 (most), 3 (KWD, BHD, OMR) |
| `is_base` | BOOLEAN | Only one currency should be base (SAR) |
| `status` | ENUM | `ACTIVE \| INACTIVE` |

**Seeded:** SAR (base), USD, EUR, GBP, AED, KWD, BHD, OMR, QAR, JOD, EGP

### `exchange_rates`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `currency_code` | TEXT FK → currencies | |
| `rate` | Decimal(18,8) | Units of SAR per 1 unit of currency |
| `rate_date` | DATE | |
| `source` | TEXT? | e.g., "SAMA" |

**Unique constraint:** `(currency_code, rate_date)`

---

## Module: Banking

### `banks`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name_en` | TEXT | |
| `name_ar` | TEXT | |
| `swift_code` | TEXT? UNIQUE | SWIFT/BIC code |
| `iban_prefix` | TEXT? | Country code prefix |
| `country` | TEXT | Default: `SA` |
| `logo_url` | TEXT? | |
| `is_active` | BOOLEAN | |

**Seeded:** 11 major Saudi banks (Al Rajhi, SNB, Riyad, Banque Saudi Fransi, ANB, SABB, Alinma, Al Jazira, Al Bilad, SAB, GIB, SAIB)

### `bank_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK → organizations | |
| `branch_id` | UUID? FK → branches | |
| `bank_id` | UUID FK → banks | |
| `currency_code` | TEXT FK → currencies | |
| `account_number` | TEXT | |
| `iban` | TEXT? | |
| `account_name_en` | TEXT | |
| `account_name_ar` | TEXT | |
| `type` | ENUM | `CURRENT \| SAVINGS \| FIXED_DEPOSIT \| PETTY_CASH` |
| `opening_balance` | Decimal(18,4) | |
| `current_balance` | Decimal(18,4) | Maintained by system |
| `gl_account_id` | UUID? | Linked COA account |
| `is_active` | BOOLEAN | |

**Unique constraint:** `(organization_id, account_number)`

### `cash_boxes`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK | |
| `branch_id` | UUID? FK → branches | |
| `currency_code` | TEXT FK → currencies | |
| `name_en` | TEXT | |
| `name_ar` | TEXT | |
| `code` | TEXT | Unique within organization |
| `opening_balance` | Decimal(18,4) | |
| `current_balance` | Decimal(18,4) | Maintained by system |
| `gl_account_id` | UUID? | Linked COA account |

**Unique constraint:** `(organization_id, code)`

---

## Module: Accounting Transactions

### `journal_entries`

The core accounting record. Every financial event results in a journal entry.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK | |
| `branch_id` | UUID? FK | |
| `fiscal_year_id` | UUID FK → fiscal_years | |
| `number` | TEXT | Sequential, unique per org |
| `entry_date` | DATE | |
| `type` | ENUM | `MANUAL \| AUTOMATIC \| OPENING \| CLOSING \| ADJUSTMENT` |
| `status` | ENUM | `DRAFT \| POSTED \| VOIDED` |
| `currency_code` | TEXT | |
| `exchange_rate` | Decimal(18,8) | |
| `total_debit` | Decimal(18,4) | Must equal total_credit when POSTED |
| `total_credit` | Decimal(18,4) | |
| `description_en` | TEXT? | |
| `description_ar` | TEXT? | |
| `reference` | TEXT? | Source document reference |
| `source_type` | TEXT? | `receipt`, `payment`, `petty_cash` |
| `source_id` | UUID? | ID of the source document |
| `posted_at` | TIMESTAMPTZ? | |
| `posted_by_user_id` | UUID? | |
| `voided_at` | TIMESTAMPTZ? | |
| `voided_by_user_id` | UUID? | |
| `void_reason` | TEXT? | |
| `created_by_user_id` | UUID? | |

**Unique constraint:** `(organization_id, number)`

**Indexes:** `status`, `type`, `entry_date`, `(source_type, source_id)`

### `journal_entry_lines`

Each line in a journal entry (double-entry bookkeeping).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `journal_entry_id` | UUID FK → journal_entries | Cascade delete |
| `account_id` | UUID FK → chart_of_accounts | |
| `cost_center_id` | UUID? FK → cost_centers | |
| `line_number` | INT | Display order within entry |
| `description_en` | TEXT? | |
| `description_ar` | TEXT? | |
| `debit` | Decimal(18,4) | In transaction currency |
| `credit` | Decimal(18,4) | In transaction currency |
| `debit_base` | Decimal(18,4) | In base currency (SAR) |
| `credit_base` | Decimal(18,4) | In base currency (SAR) |
| `reference` | TEXT? | |

---

## Module: Cash & Payments

### `receipts`

Records money received by the organization.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK | |
| `branch_id` | UUID? FK | |
| `number` | TEXT | Sequential, unique per org |
| `receipt_date` | DATE | |
| `payment_method` | ENUM | `CASH \| BANK_TRANSFER \| CHEQUE \| CREDIT_CARD \| ONLINE \| OTHER` |
| `status` | ENUM | `DRAFT \| CONFIRMED \| RECONCILED \| VOIDED` |
| `currency_code` | TEXT FK | |
| `exchange_rate` | Decimal(18,8) | |
| `amount` | Decimal(18,4) | In transaction currency |
| `amount_base` | Decimal(18,4) | In SAR |
| `bank_account_id` | UUID? FK → bank_accounts | For bank receipts |
| `cash_box_id` | UUID? FK → cash_boxes | For cash receipts |
| `payer_name` | TEXT? | |
| `payer_name_ar` | TEXT? | |
| `payer_type` | TEXT? | `donor`, `member`, `other` |
| `payer_id` | UUID? | FK to donor entity (future) |
| `cheque_number` | TEXT? | |
| `cheque_date` | DATE? | |
| `cheque_bank_name` | TEXT? | |
| `journal_entry_id` | UUID? | Auto-generated JE on confirmation |
| `confirmed_at` | TIMESTAMPTZ? | |
| `voided_at` | TIMESTAMPTZ? | |
| `void_reason` | TEXT? | |

**Unique constraint:** `(organization_id, number)`

### `payments`

Mirror of receipts — records money paid out. Same structure with `payee_*` instead of `payer_*`.

### `petty_cash`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `cash_box_id` | UUID FK → cash_boxes | |
| `type` | ENUM | `IN \| OUT` |
| `transaction_date` | DATE | |
| `amount` | Decimal(18,4) | |
| `description_en` | TEXT | |
| `description_ar` | TEXT | |
| `reference` | TEXT? | |
| `receipt_number` | TEXT? | Physical receipt number |
| `category_id` | UUID? | Expense category (future) |
| `gl_account_id` | UUID? | Linked COA account |
| `cost_center_id` | UUID? FK → cost_centers | |
| `journal_entry_id` | UUID? | Auto-generated JE |
| `approved_by_user_id` | UUID? | |
| `approved_at` | TIMESTAMPTZ? | |

---

## Module: System

### `attachments`

Polymorphic file attachment record. Links to any entity by `(entity_type, entity_id)`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `entity_type` | TEXT | `receipt`, `payment`, `petty_cash`, etc. |
| `entity_id` | UUID | ID of the parent entity |
| `file_name` | TEXT | Storage filename |
| `original_name` | TEXT | Original upload filename |
| `file_url` | TEXT | Storage URL |
| `mime_type` | TEXT | e.g., `application/pdf` |
| `file_size` | BIGINT | Bytes |
| `description` | TEXT? | |
| `uploaded_by_user_id` | UUID? FK → users | |

**Index:** `(entity_type, entity_id)`

---

### `audit_logs`

Immutable append-only log. Never updated or deleted.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID? FK → users | `SetNull` on user delete |
| `user_email` | TEXT? | Denormalized for log integrity |
| `action` | ENUM | `CREATE \| UPDATE \| DELETE \| LOGIN \| LOGOUT \| EXPORT \| IMPORT \| APPROVE \| REJECT \| VOID \| POST` |
| `entity_type` | TEXT | Table/domain name |
| `entity_id` | UUID? | ID of the affected record |
| `old_values` | JSON? | State before change |
| `new_values` | JSON? | State after change |
| `description` | TEXT? | Human-readable description |
| `ip_address` | TEXT? | |
| `user_agent` | TEXT? | |
| `created_at` | TIMESTAMPTZ | Auto-set, never updated |

**Note:** `audit_logs` has no `updated_at` or `deleted_at` — it is strictly append-only.

**Indexes:** `user_id`, `action`, `(entity_type, entity_id)`, `created_at`

---

## Index Strategy

Indexes are created on:
1. All foreign key columns
2. `status`, `type`, and `is_*` boolean columns used in WHERE clauses
3. Date columns used for range queries
4. Soft-delete `deleted_at` for filtering active records
5. Composite unique constraints (organization + code, organization + number)

---

## Soft Delete Convention

All mutable entities (except `audit_logs`, `permissions`, `exchange_rates`) carry a `deleted_at TIMESTAMPTZ?` column.

**Query pattern — always filter soft-deleted records:**
```typescript
// Prisma
prisma.organization.findMany({ where: { deletedAt: null } })

// Raw SQL
SELECT * FROM organizations WHERE deleted_at IS NULL;
```

**Soft-delete a record:**
```typescript
prisma.organization.update({
  where: { id },
  data: { deletedAt: new Date() }
})
```

Records are **never** physically deleted from the database. Hard deletes require explicit DBA action.

---

## Seed Data Commands

```bash
# Run full seed (currencies, banks, roles, permissions, demo org, COA, cost centers)
pnpm --filter @workspace/prisma run seed

# Push schema changes (development only)
pnpm --filter @workspace/prisma run push

# Generate Prisma client after schema changes
pnpm --filter @workspace/prisma run generate
```
