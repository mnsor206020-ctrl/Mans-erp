# Deployment Guide — Mans ERP

This document describes how to deploy Mans ERP to a production environment
using the Docker images and Compose stack introduced in Sprint 2.14.

## Prerequisites

- Docker Engine + Docker Compose plugin (v2, Compose spec 3.9+) on the
  target host.
- A production PostgreSQL 16 instance (the bundled `postgres` service in
  `docker-compose.yml` is suitable for single-host deployments; use a
  managed database for larger/HA deployments).
- A production Clerk application (separate from your development Clerk
  instance) with its own publishable/secret key pair.
- `.env` populated from `.env.production.example` (see below).

## 1. Configure environment variables

```bash
cp .env.production.example .env
# edit .env with real production values
```

See **"Required environment variables"** below for the full list. Never
commit `.env` — it is git-ignored.

## 2. Build the images

```bash
docker compose build
```

This builds `api-server` and `mans-erp` from their respective multi-stage
Dockerfiles (`artifacts/api-server/Dockerfile`, `artifacts/mans-erp/Dockerfile`).
Both produce minimal, non-root runtime images — see Milestone 1's report for
the build internals.

Note: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL`, and `BASE_PATH`
are baked into the frontend bundle at **build time** — if you change them,
you must rebuild the `mans-erp` image, not just restart the container.

## 3. Run the database migration

Before starting the application for the first time (or after pulling new
code that includes new Prisma migrations), apply pending migrations:

```bash
docker compose run --rm api-server pnpm --filter @workspace/prisma run migrate:deploy
```

See **migration procedure** below for details.

## 4. Start the stack

```bash
docker compose up -d
```

Startup order (enforced by `depends_on` + healthchecks in `docker-compose.yml`):

1. `postgres` starts and must report healthy (`pg_isready`).
2. `api-server` starts once Postgres is healthy, and must itself report
   healthy (`GET /api/healthz` returns 200) before...
3. `mans-erp` starts.

Check status:

```bash
docker compose ps
docker compose logs -f api-server
```

## 5. Verify the deployment

- `curl https://<api-domain>/api/healthz` → `{"status":"ok"}`
- Load the frontend URL in a browser and confirm sign-in works (production
  Clerk instance) and API calls succeed (no CORS errors — confirm
  `CORS_ALLOWED_ORIGINS` includes the frontend's exact URL).

## Startup commands (reference)

| Service    | Command                                         | Port (default) |
|------------|--------------------------------------------------|-----------------|
| postgres   | (official Postgres 16 entrypoint)                | 5432            |
| api-server | `node --enable-source-maps dist/index.mjs`       | 8080            |
| mans-erp   | `vite preview --config vite.config.ts --host 0.0.0.0 --port $PORT` | 8081 |

## Required environment variables

See `.env.production.example` for the authoritative, documented list.
Summary:

**Postgres:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (if using
the bundled Postgres service) or a full `DATABASE_URL` pointing at your
managed database.

**api-server:** `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ALLOWED_ORIGINS`,
`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `LOG_LEVEL` (optional),
`RATE_LIMIT_*` (optional), `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS`
(only if using file-attachment features).

**mans-erp:** `PORT`, `BASE_PATH`, `VITE_CLERK_PUBLISHABLE_KEY`,
`VITE_CLERK_PROXY_URL` (both baked in at build time).

## Object storage constraint

`artifacts/api-server/src/lib/objectStorage.ts` uses Replit's App Storage
sidecar (a local token-exchange endpoint at `127.0.0.1:1106`) rather than
raw Google Cloud Storage credentials. This works out of the box inside a
Replit deployment. If you deploy this stack **outside** Replit (e.g. a bare
Docker host or another cloud), the sidecar endpoint will not exist and any
attachment/upload feature relying on `ObjectStorageService` will fail until
you either: (a) run the deployment on Replit, or (b) replace
`objectStorageClient`'s credential source with real GCS service-account
credentials and adjust `PRIVATE_OBJECT_DIR`/`PUBLIC_OBJECT_SEARCH_PATHS`
accordingly. This is a deployment-environment constraint, not a bug — no
code changes were made to this file as part of this milestone.

## Clerk production configuration

Create a **separate, production** Clerk application in the Clerk dashboard
(do not reuse development keys). You need:

- `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` for `api-server`.
- `VITE_CLERK_PUBLISHABLE_KEY` (same publishable key) and
  `VITE_CLERK_PROXY_URL` for `mans-erp`, matching your production domain's
  `/api/__clerk` proxy path (see `CLERK_PROXY_PATH` in
  `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`).
- Configure your production domain(s) as allowed origins in the Clerk
  dashboard.

## Migration procedure

Mans ERP uses Prisma migrations (`lib/prisma/prisma/migrations/`). In
production, always use `migrate:deploy` (never `migrate:dev` or `db push`,
which are dev-only and can be destructive):

```bash
# Run before starting/restarting api-server after a code deploy that
# includes new migrations.
docker compose run --rm api-server pnpm --filter @workspace/prisma run migrate:deploy
```

`migrate:deploy`:
- Applies only pending migrations, in order.
- Does not generate new migrations or prompt for input (safe for CI/CD).
- Fails loudly if a migration cannot be applied — do not proceed with
  starting `api-server` if this command fails.

Always take a backup (see `backup.md`) before running migrations against a
production database.

## Rollback procedure

If a deployment introduces a regression:

1. **Application rollback (no schema change involved):**
   ```bash
   docker compose down
   git checkout <previous-known-good-tag-or-commit>
   docker compose build
   docker compose up -d
   ```

2. **Application rollback involving a Prisma migration:**
   Prisma does not auto-generate "down" migrations. To roll back a schema
   change safely:
   - Restore the database from the pre-migration backup taken in step
     above (see `restore.md`), **or**
   - Write and apply a new forward migration that reverses the schema
     change (preferred when data was written after the migration ran, since
     restoring from backup would lose that data).
   - Then redeploy the previous application version.

3. **Always verify after rollback:**
   ```bash
   curl https://<api-domain>/api/healthz
   docker compose ps
   ```

Rolling back is a deliberate, manual decision — this project does not
auto-rollback on health check failure.
