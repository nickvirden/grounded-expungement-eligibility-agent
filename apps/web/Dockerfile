FROM node:22-alpine AS base

WORKDIR /app

# Placeholder — replaced in Phase 6 with full Next.js build
RUN echo '<!DOCTYPE html><html><body>ok</body></html>' > index.html

FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app
COPY --from=base /app/index.html /app/

EXPOSE 3000

CMD ["--version"]
