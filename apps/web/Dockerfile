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

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

WORKDIR /app/apps/web
RUN pnpm build

# ── Stage 3: runner (distroless) ─────────────────────────────────────────────
FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static

EXPOSE 3000

CMD ["server.js"]
