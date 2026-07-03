# syntax=docker/dockerfile:1
#
# NOTE: this workspace's pnpm-workspace.yaml overrides deliberately exclude
# musl-variant native binaries (rollup, lightningcss, @tailwindcss/oxide),
# since the Replit dev environment is glibc-based. Alpine (musl libc) images
# are therefore incompatible with this dependency graph — use a Debian-based
# (glibc) Node image instead.

# ---------------------------------------------------------------------------
# Stage 1: install workspace dependencies (frozen lockfile)
# ---------------------------------------------------------------------------
FROM node:24-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /repo

# Only the manifests needed to resolve @workspace/api-server's dependency graph.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json tsconfig.base.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/prisma/package.json lib/prisma/package.json

RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

# ---------------------------------------------------------------------------
# Stage 2: generate Prisma client and build the server bundle
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo

COPY lib/db lib/db
COPY lib/api-zod lib/api-zod
COPY lib/prisma lib/prisma
COPY artifacts/api-server artifacts/api-server

RUN pnpm --filter @workspace/prisma run generate
RUN pnpm --filter @workspace/api-server run build

# Produce a self-contained, production-only dependency set for the server.
RUN pnpm --filter @workspace/api-server --prod deploy --legacy /prod/api-server

# `pnpm deploy` re-resolves node_modules from the content-addressable store
# under a different peer-dependency hash (no `prisma` CLI in the prod graph),
# landing on a pristine, ungenerated @prisma/client stub. Copy over the
# actual generated client (engine binary, generated types, schema) produced
# by the `generate` step above so the deployed copy matches the one built.
RUN set -e; \
    GEN_DIR="$(find /repo/node_modules/.pnpm -maxdepth 1 -type d -name '@prisma+client@*' | head -n1)/node_modules/.prisma/client"; \
    for DEST in /prod/api-server/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client; do \
      cp -rf "$GEN_DIR"/. "$DEST"/; \
    done

# ---------------------------------------------------------------------------
# Stage 3: minimal production runtime image
# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r app \
  && useradd -r -g app -m app

WORKDIR /app

COPY --from=build --chown=app:app /prod/api-server/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/artifacts/api-server/dist ./dist
COPY --from=build --chown=app:app /repo/artifacts/api-server/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 8080

USER app

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
