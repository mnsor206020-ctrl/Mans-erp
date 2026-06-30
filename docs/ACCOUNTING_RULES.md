# Mans ERP — Accounting Rules

> This document defines the accounting principles, business rules, and data integrity constraints that govern all financial operations in Mans ERP. These rules must be enforced at both the application layer (backend validation) and the database layer (constraints and triggers where applicable).

---

## Governing Standards

Mans ERP follows:

1. **IPSAS** — International Public Sector Accounting Standards (primary reference for nonprofits)
2. **IFRS for NPOs** — Where IPSAS is silent, IFRS guidance applies
3. **Saudi GAAP (SOCPA)** — Saudi Organization for Certified Public Accountants standards
4. **ZATCA Guidelines** — Zakat, Tax and Customs Authority requirements
5. **Ministry of Human Resources** — Requirements for licensed charitable organizations

---

## Double-Entry Bookkeeping

Mans ERP uses **double-entry bookkeeping**. Every financial transaction is recorded in at least two accounts: a debit in one account and a credit in another. The fundamental equation must always hold:

```
Assets = Liabilities + Equity
Debits = Credits  (for every journal entry)
```

### Account Normal Balances

| Account Type | Normal Balance | Increases with | Decreases with |
|---|---|---|---|
| Asset | Debit | Debit entry | Credit entry |
| Liability | Credit | Credit entry | Debit entry |
| Equity / Net Assets | Credit | Credit entry | Debit entry |
| Revenue | Credit | Credit entry | Debit entry |
| Expense | Debit | Debit entry | Credit entry |
| Contra-Asset (e.g., Accum. Depreciation) | Credit | Credit entry | Debit entry |

### Validation Rule — Journal Entry Balance
A journal entry **cannot be posted** unless:
```
SUM(all debit lines) = SUM(all credit lines)
```
This is a hard constraint enforced in the application before updating `status` to `POSTED`.

---

## Journal Entry Lifecycle

```
DRAFT ──► POSTED ──► VOIDED
  │
  └──► (deleted while DRAFT — soft delete only)
```

| Status | Description | Allowed Actions |
|---|---|---|
| `DRAFT` | Entry is being prepared; not reflected in balances | Edit, Delete (soft), Post |
| `POSTED` | Entry is finalized; reflected in account balances | View, Void |
| `VOIDED` | Entry is reversed; a reversal entry is created | View only |

### Posting Rules

Before transitioning `DRAFT → POSTED`, the system must verify:

1. `total_debit = total_credit` (balanced)
2. `total_debit > 0` (non-zero entry)
3. Fiscal year `status = OPEN` (cannot post to CLOSED or LOCKED years)
4. `entry_date` is within the fiscal year's `start_date` and `end_date`
5. All referenced accounts exist and have `is_active = true` and `allow_direct_entry = true`
6. All referenced cost centers exist and have `is_active = true`
7. All referenced currencies exist and have `status = ACTIVE`

### Voiding Rules

When voiding a POSTED entry (`POSTED → VOIDED`):

1. A `void_reason` must be provided
2. A **reversal journal entry** is automatically created with the same lines but debits and credits swapped
3. The reversal entry is immediately posted with `type = ADJUSTMENT`
4. Account balances are updated to reflect the reversal
5. The fiscal year must still be OPEN (cannot void entries in a LOCKED year)

### Entry Types

| Type | When Created | Posted By |
|---|---|---|
| `MANUAL` | Manually by accountant | User |
| `AUTOMATIC` | By system on receipt/payment confirmation | System |
| `OPENING` | Opening balances for a new fiscal year | System/User |
| `CLOSING` | Year-end closing entries | System |
| `ADJUSTMENT` | Corrections and reversals | System/User |

---

## Chart of Accounts Rules

### Account Hierarchy

Accounts are organized in a tree with up to 5 levels. The standard structure is:

```
Level 1: Major account type (1000 Assets, 2000 Liabilities…)
Level 2: Sub-category (1100 Current Assets, 1200 Non-Current Assets)
Level 3: Account group (1110 Cash on Hand, 1120 Cash at Banks)
Level 4: Sub-account
Level 5: Detailed sub-account
```

### Account Codes

Account codes must follow the numeric prefix convention:
- `1xxx` — Assets
- `2xxx` — Liabilities
- `3xxx` — Equity / Net Assets
- `4xxx` — Revenue
- `5xxx` — Expenses

### Group Accounts vs. Leaf Accounts

- **Group accounts** (`is_group = true`, `allow_direct_entry = false`): Used for classification only. Journal entry lines **cannot** reference group accounts.
- **Leaf accounts** (`is_group = false`, `allow_direct_entry = true`): Journal entry lines reference only leaf accounts.

### Account Deactivation Rules

An account **cannot** be deactivated (`is_active = false`) if:
1. It has a non-zero balance
2. It is referenced in any DRAFT journal entry

---

## Fiscal Year Rules

### Period Control

| Fiscal Year Status | New Journal Entries | Adjustments | Closing Entries |
|---|---|---|---|
| `OPEN` | Allowed | Allowed | Allowed |
| `CLOSED` | Not allowed | Allowed (ADJUSTMENT type only) | Allowed |
| `LOCKED` | Not allowed | Not allowed | Not allowed |

### Year-End Closing Process

At fiscal year end, the system performs closing entries:

1. **Revenue accounts** (4xxx) are closed: Debit each revenue account, Credit retained surplus (3400)
2. **Expense accounts** (5xxx) are closed: Credit each expense account, Debit retained surplus (3400)
3. Net surplus/deficit flows into account 3400 (Retained Surplus/Deficit)
4. Fiscal year `status` is set to `CLOSED`
5. Opening balances for the new fiscal year are created from the closing balances of all balance sheet accounts (1xxx, 2xxx, 3xxx)

### Overlapping Fiscal Years

Two fiscal years for the same organization **cannot** have overlapping date ranges. This is enforced by the unique constraint `(organization_id, start_date, end_date)` and validated in application logic.

---

## Multi-Currency Rules

### Base Currency

The organization's `base_currency_code` is the reporting currency (default: SAR). All reports are presented in the base currency.

### Exchange Rate Policy

- Exchange rates are stored as the number of **base currency units per 1 unit of foreign currency**
- Example: If USD rate is 3.75, then 1 USD = 3.75 SAR
- Rates are dated; the system uses the rate for the `entry_date` of the transaction
- If no rate exists for the exact date, use the most recent rate before that date

### Multi-Currency Journal Entries

When a journal entry is in a foreign currency:

1. `currency_code` = the transaction currency (e.g., USD)
2. `exchange_rate` = rate on `entry_date` (e.g., 3.75)
3. Each line stores:
   - `debit` / `credit` — in transaction currency
   - `debit_base` / `credit_base` — in base currency (`debit * exchange_rate`)
4. Reporting always uses `debit_base` / `credit_base`
5. Balance check: `SUM(debit_base) = SUM(credit_base)` (rounding differences < 0.01 SAR are acceptable)

### Foreign Exchange Gain/Loss

When a foreign-currency balance is revalued at a different exchange rate:
- The difference is posted to a dedicated FX Gain/Loss account
- This account should be created in the COA under Revenue (gain) or Expense (loss)

---

## Receipts & Payments Rules

### Numbering

Every receipt and payment has a sequential `number` that is unique per organization. Format: `RCV-YYYY-NNNNNN` for receipts and `PMT-YYYY-NNNNNN` for payments.

### Status Lifecycle

```
Receipt / Payment:  DRAFT → CONFIRMED → RECONCILED
                      │
                      └──► VOIDED (from DRAFT or CONFIRMED)
```

### Confirmation Rules

On confirming a receipt (`DRAFT → CONFIRMED`):

1. A journal entry is automatically created with `type = AUTOMATIC`:
   - **Debit:** Cash or Bank account (linked to `cash_box_id.gl_account_id` or `bank_account_id.gl_account_id`)
   - **Credit:** Revenue account appropriate for the receipt type
2. `journal_entry_id` is stored on the receipt
3. The cash box or bank account `current_balance` is incremented by `amount`

On confirming a payment (`DRAFT → CONFIRMED`):

1. A journal entry is automatically created:
   - **Debit:** Expense or liability account
   - **Credit:** Cash or Bank account
2. The cash box or bank account `current_balance` is decremented by `amount`

### Voiding Rules

Voiding a CONFIRMED receipt or payment:
1. Reverses the automatic journal entry
2. Reverses the balance change on the cash box / bank account
3. Sets status to `VOIDED`
4. Records `voided_at` and `void_reason`

### Payment Method Constraints

| Payment Method | Required Fields |
|---|---|
| `CASH` | `cash_box_id` |
| `BANK_TRANSFER` | `bank_account_id` |
| `CHEQUE` | `bank_account_id`, `cheque_number`, `cheque_date` |
| `CREDIT_CARD` | `bank_account_id` |
| `ONLINE` | `bank_account_id` |

---

## Petty Cash Rules

### Cash Box Balance

The cash box `current_balance` is the running total of:
- `opening_balance`
- Plus all `PettyCash` entries with `type = IN`
- Minus all `PettyCash` entries with `type = OUT`

### Replenishment

When a cash box runs low, a replenishment is recorded as:
- A `Payment` from the main bank account to the petty cash box
- A petty cash `IN` entry for the replenishment amount

### Petty Cash Authorization

Petty cash entries above a configurable threshold require approval (`approved_by_user_id`). The threshold is set per organization. Unapproved entries above the threshold should be held in a pending state.

---

## Bank Reconciliation Rules

Bank reconciliation matches the organization's bank account records against the bank's statement.

### Reconciliation Process

1. Download or manually enter the bank statement for the period
2. Match bank statement lines against confirmed receipts, payments, and transfers
3. Identify unmatched items in either direction:
   - **In books, not on statement:** Outstanding cheques, deposits in transit
   - **On statement, not in books:** Bank charges, interest, errors
4. Create adjustment journal entries for items on the statement not yet in books
5. Mark matched items as `RECONCILED`
6. A bank account is reconciled when: `Statement Balance = Book Balance`

### Reconciliation Equation

```
Bank Statement Ending Balance
  + Deposits in Transit
  - Outstanding Cheques
= Adjusted Bank Balance

Book Balance (current_balance)
  + Bank Credits not in books
  - Bank Charges not in books
= Adjusted Book Balance

Adjusted Bank Balance must equal Adjusted Book Balance
```

---

## Zakat Rules (Saudi Nonprofit Context)

Zakat is an Islamic religious obligation. Charitable organizations receive Zakat from donors and distribute it according to Sharia-specified categories.

### Zakat Segregation

Zakat funds must be **strictly segregated** from general donations:
- Use restricted net assets account (3300) for Zakat funds
- Tag all Zakat receipts with `payer_type = 'zakat'`
- Cost center: Assign Zakat receipts and disbursements to a dedicated Zakat cost center

### Eligible Zakat Recipients (ZATCA / Sharia)

The eight Zakat-eligible categories per Quran (9:60):
1. Al-Fuqaraa (the poor)
2. Al-Masakin (the needy)
3. Amileen Alayha (Zakat administrators)
4. Al-Muallafatu Qulubuhum (reconciling hearts)
5. Fir-Riqaab (freeing captives)
6. Al-Gharimeen (debtors)
7. Fi Sabeel Allah (in the path of God)
8. Ibn As-Sabeel (the wayfarer)

Mans ERP will tag beneficiary aid records with the applicable Zakat category.

### Zakat Reporting

Organizations that receive Zakat must maintain auditable records and file reports with ZATCA. The system must produce:
- Zakat receipts ledger (by donor, by date)
- Zakat disbursements ledger (by beneficiary category)
- Zakat balance report (received vs. distributed)

---

## Audit Trail Rules

Every financial record change must produce an `AuditLog` entry. This is non-negotiable.

### What Must Be Logged

| Event | `action` | `entity_type` |
|---|---|---|
| Create journal entry | `CREATE` | `journal_entry` |
| Post journal entry | `POST` | `journal_entry` |
| Void journal entry | `VOID` | `journal_entry` |
| Confirm receipt | `APPROVE` | `receipt` |
| Void receipt | `VOID` | `receipt` |
| Confirm payment | `APPROVE` | `payment` |
| Void payment | `VOID` | `payment` |
| Delete any record (soft) | `DELETE` | `{entity}` |
| Export financial report | `EXPORT` | `report` |
| User login | `LOGIN` | `user` |
| User logout | `LOGOUT` | `user` |

### Audit Log Integrity

- `audit_logs` rows are **never updated or deleted**
- `old_values` and `new_values` store JSON snapshots of the record state
- `user_email` is **denormalized** into the log (so the audit is not broken if a user is deleted)

---

## Report Definitions

### Trial Balance

Lists all accounts with their debit and credit totals and closing balances for a period.

```
For each account (where allow_direct_entry = true):
  opening_balance = sum of debit_base - sum of credit_base for all entries before period
  period_debits   = sum of debit_base for entries in period
  period_credits  = sum of credit_base for entries in period
  closing_balance = opening_balance + period_debits - period_credits
```

### Income Statement (Statement of Activities)

```
Revenue (4xxx accounts)     = SUM of credit_base - debit_base
Expenses (5xxx accounts)    = SUM of debit_base - credit_base
───────────────────────────────────────────────────────────
Net Surplus / (Deficit)     = Revenue - Expenses
```

### Balance Sheet (Statement of Financial Position)

```
ASSETS (1xxx)
  Current Assets
  Non-Current Assets
  Total Assets

LIABILITIES (2xxx)
  Current Liabilities
  Non-Current Liabilities
  Total Liabilities

NET ASSETS / EQUITY (3xxx)
  Unrestricted Net Assets
  Restricted Net Assets
  Retained Surplus / (Deficit)
  Total Net Assets

TOTAL LIABILITIES + NET ASSETS = TOTAL ASSETS  ← Must balance
```
