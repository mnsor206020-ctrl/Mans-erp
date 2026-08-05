---
name: Paginated envelope unwrap in list hooks
description: Generated list hooks return { data: [...] } envelopes; five banking components treat them as arrays and crash entire routes
---
Rule: every consumer of the generated list hooks (bank accounts, cash boxes, banks, currencies) must unwrap the paginated envelope before array ops — same pattern the chart-of-accounts consumer already uses: `(raw as any)?.data ?? (Array.isArray(raw) ? raw : [])`.

**Why:** QA audits (Aug 2026) found /receipts, /payments, /petty-cash, New Bank Account, and New Cash Box all crash with `.filter/.map/.find is not a function` from this one mistake, taking down the whole banking module.

**How to apply:** when fixing those crashes or writing any new component consuming a list hook, unwrap first; better, fix the hook/codegen layer once so components receive arrays.
