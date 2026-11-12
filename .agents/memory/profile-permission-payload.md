---
name: Current profile permission payload
description: Generated profile types omit nested permissions already returned by the server.
---

Do not infer permissions from role names or change the API just because generated profile types omit permission details.

**Why:** The existing current-user endpoint returns nested role permissions at runtime, while its generated profile type describes only role names and IDs. Relying only on that type can incorrectly suggest that frontend permission checks require an API change.

**How to apply:** Verify the endpoint's actual serializer before changing contracts. Use explicit resource/action grants, fail closed while the profile loads, and leave backend authorization authoritative.
