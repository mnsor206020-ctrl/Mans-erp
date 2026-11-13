---
name: Test environment isolation
description: Safe checks for a separate test project without requiring legacy Neon identifiers.
---
Verify the test project's actual development-database scope before writes; do not require a Neon `ep-` identifier on current Replit-managed database infrastructure. The name `heliumdb` alone does not identify a unique database.

**Why:** Requiring legacy endpoint identifiers repeatedly stalled setup without establishing isolation. Current Replit documentation describes app-scoped development connections; not all databases expose Neon endpoint identifiers.

**How to apply:** Consult current official documentation and inspect project-scoped resource metadata. Do not expose connection strings or inspect secret values. If the TEST project is outside the current workspace, establish authorized access rather than running setup against the original project's database.
