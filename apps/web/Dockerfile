# Build context must be the monorepo root (set in docker-compose.yml).
# This lets us access pnpm-lock.yaml and pnpm-workspace.yaml which live
# at the root, not inside apps/web/.

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace manifests first for layer-cache efficiency
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --filter web...

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --filter web...

# Copy app source (after install so the above layers are cached on dep-only changes)
COPY apps/web/ ./apps/web/

WORKDIR /app/apps/web
RUN pnpm build

# ── Stage 3: runner (distroless) ─────────────────────────────────────────────
FROM gcr.io/distroless/nodejs22-debian12:nonroot

# In a pnpm workspace, Next.js standalone preserves the workspace directory
# structure: server.js ends up at apps/web/ inside the standalone dir, not at
# the root. We keep WORKDIR at /app (workspace root) so relative paths resolve.
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# The standalone dir already contains apps/web/server.js + root node_modules
COPY --from=builder --chown=65532:65532 /app/apps/web/.next/standalone ./

# Static assets and public must sit where server.js expects them (apps/web/)
COPY --from=builder --chown=65532:65532 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=65532:65532 /app/apps/web/public/ ./apps/web/public/

EXPOSE 3000

# node binary in distroless/nodejs22-debian12 is /nodejs/bin/node (the entrypoint)
CMD ["apps/web/server.js"]
