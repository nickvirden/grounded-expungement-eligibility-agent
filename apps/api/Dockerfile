FROM python:3.13-slim AS base

WORKDIR /app

RUN adduser --disabled-password --uid 10001 appuser

# Placeholder — replaced in Phase 3 with full FastAPI app
RUN echo "ok" > /app/health.txt

FROM gcr.io/distroless/python3-debian12:nonroot

WORKDIR /app
COPY --from=base /app/health.txt /app/

EXPOSE 8000

CMD ["--version"]
