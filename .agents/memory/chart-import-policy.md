---
name: Chart import numbering policy
description: Account codes and hierarchy are supplied by each organization, not inferred from numbering conventions
---

Treat imported account codes as opaque identifiers. Never infer hierarchy from code prefixes, code lengths, or numeric increments; use the explicit parent account code.

**Why:** The user needs to import different accounting charts regardless of their numbering or hierarchy structure, including Arabic and English names.

**How to apply:** Preserve textual codes and leading zeros. Import adds new accounts only; conflicts require review rather than automatic overwrites or changes to existing posted accounting data.
