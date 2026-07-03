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
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /repo

# Only the manifests needed to resolve @workspace/mans-erp's dependency graph.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json tsconfig.base.json ./
COPY artifacts/mans-erp/package.json artifacts/mans-erp/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json

# vite is a devDependency but is required at runtime for `vite preview`
# (the project's existing production serving approach), so devDependencies
# are installed for this image.
RUN pnpm install --frozen-lockfile --filter @workspace/mans-erp...

# ---------------------------------------------------------------------------
# Stage 2: build production assets
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo

COPY lib/api-client-react lib/api-client-react
COPY artifacts/mans-erp artifacts/mans-erp

ARG BASE_PATH=/
ARG PORT=8081
ENV BASE_PATH=${BASE_PATH}
ENV PORT=${PORT}
ENV NODE_ENV=production

RUN pnpm --filter @workspace/mans-erp run build

# Self-contained dependency set, including devDependencies (vite is required
# to run the existing `serve` script in production).
RUN pnpm --filter @workspace/mans-erp deploy --legacy /prod/mans-erp

# ---------------------------------------------------------------------------
# Stage 3: minimal production runtime image
# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r app \
  && useradd -r -g app -m app

WORKDIR /app

COPY --from=build --chown=app:app /prod/mans-erp/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/artifacts/mans-erp/dist ./dist
COPY --from=build --chown=app:app /repo/artifacts/mans-erp/package.json ./package.json
COPY --from=build --chown=app:app /repo/artifacts/mans-erp/vite.config.ts ./vite.config.ts

ENV NODE_ENV=production
# BASE_PATH must also be supplied at container runtime (not just at build
# time): `vite preview` re-evaluates vite.config.ts on startup, which
# requires BASE_PATH to be set.
EXPOSE 8081

USER app

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "node_modules/.bin/vite preview --config vite.config.ts --host 0.0.0.0 --port ${PORT}"]
