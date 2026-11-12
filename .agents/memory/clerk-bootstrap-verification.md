---
name: Fresh-login verification
description: Seeded local users can hide failures between Clerk sign-in and ERP account initialization
---
Test first-time access with a Clerk-only identity as well as an existing organization-assigned account.

**Why:** The existing seeded test account rendered financial pages successfully while a fresh Clerk identity reproduced the reported `User not found` failures. Passing seeded-account checks alone concealed the initialization dependency.

**How to apply:** Reuse the existing local-account initialization rules. Treat organization assignment as an explicit access prerequisite; never repair a migrated login by silently assigning an organization or granting roles.
