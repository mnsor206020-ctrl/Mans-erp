---
name: Paginated envelope unwrap in list hooks
description: Generated list-hook array types can disagree with paginated runtime response envelopes
---
Rule: verify list endpoints' runtime output rather than trusting generated array return types. Normalize paginated envelopes and bare arrays before calling array methods.

**Why:** Banking hooks declared array results while their endpoints returned paginated envelopes. This caused `.filter/.map/.find is not a function` failures only after data loaded, taking down whole routes.

**How to apply:** normalize at the consumer boundary for scoped fixes without silently changing shared hook contracts. Regression tests should render consumers with actual envelope-shaped fixtures, not only array fixtures, and distinguish loading, empty, and failed requests.
