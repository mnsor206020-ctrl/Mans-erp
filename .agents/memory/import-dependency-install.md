---
name: Imported dependency installation
description: Replit package firewall behavior when restoring this project's dependency lockfile
---

An imported lockfile can resolve successfully but still fail while downloading a blocked package tarball. Refreshing only the originally failing parent can reveal another blocked dependency.

**Why:** Restoring this import encountered separate firewall blocks in server, test, and code-generation dependencies. These were not missing registry credentials.

**How to apply:** Keep the firewall enabled. Update the direct dependency that owns the blocked package, inspect runtime requirements and peer compatibility, and verify the affected test suites. Do not interpret a tarball 403 as a reason to request registry credentials.
