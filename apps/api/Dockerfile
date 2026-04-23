# Build context must be the monorepo root (set in docker-compose.yml).
# This lets us copy packages/shared/ (decision trees + service catalog)
# which lives at the root, not inside apps/api/.

# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM python:3.13-slim AS builder

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy only the dependency manifest first for layer-cache efficiency
COPY apps/api/pyproject.toml ./

# Install all production deps (uv reads [project.dependencies] from pyproject.toml)
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy the full API source
COPY apps/api/ .

# Copy the shared knowledge base (decision trees + service catalog)
COPY packages/shared/ /shared/

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.13-slim AS runtime

RUN adduser --disabled-password --uid 10001 appuser
RUN mkdir -p /app/data /shared && chown -R appuser:appuser /app/data /shared

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app .
COPY --from=builder /shared /shared

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
