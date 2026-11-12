---
name: Chart import numbering policy
description: Account codes and hierarchy are supplied by each organization, not inferred from numbering conventions
---

Treat imported account codes as opaque identifiers. Never infer hierarchy from code prefixes, code lengths, or numeric increments; use the explicit parent account code.

**Why:** The user needs to import different accounting charts regardless of their numbering or hierarchy structure, including Arabic and English names.

**How to apply:** Preserve textual codes and leading zeros. Import adds new accounts only; conflicts require review rather than automatic overwrites or changes to existing posted accounting data.

The default import journey must be upload → automatic column matching → review → confirm. Manual column mapping is optional, except for missing or ambiguous fields that cannot be resolved safely.

**Why:** The user explicitly rejected mandatory manual matching and requested an automatic experience like Qoyod.

**How to apply:** Match recognizable Arabic/English headings automatically, but do not guess ambiguous columns or invent parents. If nature is absent, apply the usual type-based defaults with a visible review notice before confirmation. Explain that contra-accounts may need a nature column; a mapped nature column remains authoritative, including invalid or blank values. Never infer nature from hierarchy levels or payment/collection flags.
