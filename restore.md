# Restore Guide — Mans ERP

This document describes how to restore the PostgreSQL database from a
backup produced per `backup.md`. Always restore into a **scratch/staging
database first** to verify integrity before ever restoring over a live
production database.

## Prerequisites

- A `.dump` file produced by `pg_dump --format=custom` (see `backup.md`).
- `pg_restore` available (matching or newer PostgreSQL 16 client tools).
- The application (`api-server`) should be stopped or in maintenance mode
  during a restore onto its live database, to avoid writes racing the
  restore.

## Restore procedure

### Option A: Restoring into the bundled `postgres` Compose service

```bash
# 1. Stop the API so nothing writes to the database mid-restore.
docker compose stop api-server

# 2. Copy the dump file into the postgres container.
docker cp backup_20260703_120000.dump workspace-postgres-1:/tmp/restore.dump

# 3. Drop and recreate the target database (destructive — confirm you
#    have the right backup file and the right database name first).
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

# 4. Restore.
docker compose exec -T postgres pg_restore \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  /tmp/restore.dump

# 5. Restart the API.
docker compose start api-server
```

### Option B: Restoring into a managed/external Postgres instance

```bash
pg_restore --dbname="$DATABASE_URL" --no-owner --no-privileges \
  --clean --if-exists backup_20260703_120000.dump
```

`--clean --if-exists` drops existing objects before recreating them, so
this can be run against a database that already has (stale) data in it.

## Post-restore verification

1. **Migration history check** — confirm the restored `_prisma_migrations`
   table matches what the currently-deployed application code expects:
   ```bash
   docker compose run --rm api-server pnpm --filter @workspace/prisma run migrate:deploy
   ```
   This should report "No pending migrations" if the backup already
   included every migration the running code needs. If it applies new
   migrations, that's expected when restoring an older backup onto newer
   code — verify the applied migrations are non-destructive to existing
   data before proceeding.

2. **Application health check**:
   ```bash
   curl https://<api-domain>/api/healthz
   ```

3. **Spot-check data** — confirm a few known records exist and look
   correct via the application UI or a direct query, before considering
   the restore complete.

## Important notes

- Never run a restore directly against production without first testing
  the exact same dump file and commands against a scratch database — a
  bad restore can be as damaging as the incident you're recovering from.
- `--no-owner --no-privileges` avoids restore failures caused by role/owner
  mismatches between the environment the dump was taken in and the one
  it's being restored into; grants should be reapplied per your
  environment's actual role setup afterward if they differ from defaults.
- If restoring as part of a rollback (see `deployment.md`), redeploy the
  application version that matches the restored schema, not the version
  that was running when the incident occurred.
