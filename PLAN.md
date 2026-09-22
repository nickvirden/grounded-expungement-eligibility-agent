# Phased Execution Plan

This document outlines the commit-by-commit execution plan for the Grounded Expungement Eligibility
Agent rebuild — a modernization of the WipeRecord eligibility questionnaire, modeled on a real-world
record-clearing workflow. Each phase lives on its own stacked feature branch.

## Branching Strategy

```
main
 └── phase/01-monorepo-scaffold
      └── phase/02-kb-extraction
           └── phase/03-backend-foundation
                └── phase/04-security-stack
                     └── phase/05-agent-harness
                          └── phase/06-fe-scaffold
                               └── phase/07-fe-quick-form
                                    └── phase/08-fe-agent-chat
                                         └── phase/09-polish-docs
```

Each phase branches from the previous phase's branch, so its diff is reviewable independently of later
phases. Each phase then merges into `main` on its own, in order — `main` picks up phase 01 first,
phase 02 next, and so on — rather than the whole stack landing as one merge at the end.

---

## Phase 0 — Repo Bootstrap · `main`

- [x] Create public repo `nickvirden/grounded-expungement-eligibility-agent`
- [x] Repo-scoped git identity (local only)
- [x] Initial scaffold: README, LICENSE, .gitignore, PLAN.md

---

## Phase 1 — Monorepo Scaffold + Edge Proxy · `phase/01-monorepo-scaffold`

- [x] pnpm + uv monorepo scaffold with tool-versions, env example, Makefile
- [x] Biome config with noInlineStyles rule
- [x] Gitleaks config and pre-commit hook
- [x] Docker Compose with Caddy, web, and API service stubs

---

## Phase 2 — Knowledge Base Extraction · `phase/02-kb-extraction`

- [x] Extract Texas decision tree to JSON
- [x] Extract service catalog to JSON
- [x] JSON Schema validation
- [ ] (Stretch) Extract Florida decision tree — deferred; out of scope for the single-state demo

---

## Phase 3 — Backend Foundation + Rule Engine · `phase/03-backend-foundation`

- [x] FastAPI skeleton with uv, distroless Dockerfile, healthz
- [x] SQLModel models, Pydantic schemas, Alembic initial migration
- [x] Deterministic rule engine and tree loader
- [x] Eligibility and states routers
- [x] Pytest fixtures for 4 Texas paths

---

## Phase 4 — Security Middleware Stack · `phase/04-security-stack`

- [x] Response-header middleware (CSP, HSTS, COOP, COEP, Referrer)
- [x] Exact-origin CORS with Sec-Fetch-Site enforcement
- [x] Double-submit CSRF token middleware (CSRF_SECURE env flag for dev/prod parity)
- [x] Per-IP and per-intake rate limiting
- [x] Structlog PII-redaction processor
- [x] Security test suite

---

## Phase 5 — Agent Harness · `phase/05-agent-harness`

- [x] Provider abstraction (OpenAI + Anthropic adapters)
- [x] Typed tools (extract_case_facts, lookup_state_tree, assess_eligibility, recommend_services, persist_intake)
- [x] Guardrails (max steps, confidence threshold, jurisdiction allowlist, prompt-injection sentinel)
- [x] Eligibility agent definition and AgentRunner with run/step persistence
- [x] Intakes router with SSE stream, POST, and DELETE-for-erasure
- [x] Harness end-to-end test with TestModel

---

## Phase 6 — Frontend Foundation · `phase/06-fe-scaffold`

- [x] Next.js 15 App Router scaffold with styled-components v6 and distroless Dockerfile
- [x] Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Cache-Control: no-store on intake pages) in next.config.ts
- [x] Shared libs (csrf, sanitize, api-client, schemas) with node:test specs
- [x] Landing page with state picker and mode chooser

---

## Phase 7 — Quick Form Flow · `phase/07-fe-quick-form`

- [x] Quick Form stepper component (react-hook-form + zod)
- [x] Quick Form page with server-rendered first node
- [x] Eligibility report component and result page

---

## Phase 8 — Agent Chat Flow + Trace · `phase/08-fe-agent-chat`

- [x] /api/chat route handler (SSE proxy with CSRF + Origin checks)
- [x] Agent chat and Case File card components
- [ ] (Droppable) Agent run trace timeline page — deferred; not critical for demo

---

## Phase 9 — E2E + Container Hardening · `phase/09-polish-docs`

- [x] Playwright config and quick-form happy path (5 scenarios)
- [ ] (Droppable) Talk-to-agent happy path with stubbed LLM — deferred
- [x] Security spec (no inline styles runtime check, Cache-Control: no-store on PII pages, security headers)
- [x] Static inline-style scanner (`scripts/check-no-inline-styles.mjs`)
- [x] Container hardening: `read_only`, `cap_drop: ALL`, `security_opt: no-new-privileges`, `pids_limit`, `mem_limit` in docker-compose.yml

---

## Phase 10 — Docs + Release · (merged into phase/09-polish-docs)

- [x] DECISIONS.md final pass (13 sections covering all major architectural choices)
- [x] README quickstart, architecture diagram, demo script, tech stack table
- [x] PLAN.md final status update (this file)

Each phase above is tagged individually as it lands on `main` (`v0.1.0` through `v0.9.0`, one per
phase). Once CI and automated versioning are live, further merges continue versioning from that point
automatically; `v1.0.0` marks the first stable release, cut once the full v1 scope is complete and
gated by CI.

---

## Summary

All phases completed as of v0.9.0. Three items explicitly deferred:

| Item | Reason |
|------|--------|
| Florida tree extraction | Out of scope for single-state demo |
| Agent run trace page | Nice-to-have; adds complexity without changing core demo story |
| Talk-to-agent E2E with stubbed LLM | LLM stubbing in E2E requires non-trivial mock server setup |
