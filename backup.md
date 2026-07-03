# Backup Guide — Mans ERP

Mans ERP's only stateful, must-be-backed-up component is the PostgreSQL
database (`DATABASE_URL`). Application containers, images, and the frontend
build are stateless and reproducible from source — they do not need backing
up.

If you use the file-attachment feature (`objectStorage.ts`), object storage
contents (Replit App Storage, or GCS if you migrated per `deployment.md`)
should also be backed up per your storage provider's own backup tooling —
this document covers the database only.

## What to back up

- The full PostgreSQL database (schema + data), not just the `public`
  schema data — Prisma's `_prisma_migrations` table must be included so a
  restored database has an accurate migration history.

## Backup procedure

### Option A: Using the bundled `postgres` Compose service

```bash
# Creates a timestamped, compressed SQL dump on the host.
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  > "backup_$(date +%Y%m%d_%H%M%S).dump"
```

- `--format=custom` produces a compressed, `pg_restore`-compatible dump
  (recommended over plain SQL for anything beyond trivial databases).
- Store the resulting `.dump` file off-host (object storage, a backup
  server, etc.) — a backup that lives only on the same host as the database
  protects against nothing.

### Option B: Against a managed/external Postgres instance

```bash
pg_dump "$DATABASE_URL" --format=custom > "backup_$(date +%Y%m%d_%H%M%S).dump"
```

Requires `pg_dump` (PostgreSQL 16 client tools) installed on the machine
running the command; version should match (or be newer than) the server
version.

## When to back up

- **Before every migration** (`migrate:deploy`) run against production —
  see `deployment.md`'s migration procedure.
- **On a recurring schedule** (daily, at minimum) independent of deploys,
  since data changes continuously from normal app usage. Automate the
  Option A/B command above via cron, a systemd timer, or your
  infrastructure's managed backup scheduling.
- **Before any rollback** that might involve restoring an older schema.

## Retention

Keep at minimum:
- The last 7 daily backups.
- The last 4 weekly backups.
- One backup taken immediately before each production migration
  (retained until the next successful migration + a verification window).

Adjust retention to your organization's actual compliance/data-retention
requirements — none are prescribed by the application itself.

## Verifying a backup is usable

A backup file existing is not the same as a backup being restorable. After
each new backup automation change, and periodically thereafter, actually
run through the `restore.md` procedure against a scratch database to
confirm the dump restores cleanly.
