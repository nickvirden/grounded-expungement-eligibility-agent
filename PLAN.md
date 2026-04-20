# Phased Execution Plan

This document outlines the commit-by-commit execution plan for the WipeRecord Eligibility 2026 modernization project. Each phase lives on its own stacked feature branch.

## Branching Strategy

```
main
 └── phase/01-monorepo-scaffold
      └── phase/02-kb-extraction
           └── phase/03-backend-foundation
                └── phase/04-security-stack
                     └── phase/05-agent-harness
                          └── phase/06-fe-foundation
                               └── phase/07-quick-form
                                    └── phase/08-agent-chat
                                         └── phase/09-e2e-hardening
                                              └── phase/10-docs-release
```

Each phase branches from the previous phase's branch (stacked PR pattern). Reviewers can inspect per-phase diffs independently.

---

## Phase 0 — Repo Bootstrap · `main`

- [x] Create private repo `nickvirden/grounded-expungement-eligibility-agent`
- [x] Repo-scoped git identity (local only)
- [x] Initial scaffold: README, LICENSE, .gitignore, PLAN.md

---

## Phase 1 — Monorepo Scaffold + Edge Proxy · `phase/01-monorepo-scaffold`

- [ ] pnpm + uv monorepo scaffold with tool-versions, env example, Makefile
- [ ] Biome config with noInlineStyles rule
- [ ] Gitleaks config and pre-commit hook
- [ ] Docker Compose with Caddy, web, and API service stubs

---

## Phase 2 — Knowledge Base Extraction · `phase/02-kb-extraction`

- [ ] Extract Texas decision tree to JSON
- [ ] Extract service catalog to JSON
- [ ] JSON Schema validation
- [ ] (Stretch) Extract Florida decision tree

---

## Phase 3 — Backend Foundation + Rule Engine · `phase/03-backend-foundation`

- [ ] FastAPI skeleton with uv, distroless Dockerfile, healthz
- [ ] SQLModel models, Pydantic schemas, Alembic initial migration
- [ ] Deterministic rule engine and tree loader
- [ ] Eligibility and states routers
- [ ] Pytest fixtures for 4 Texas paths

---

## Phase 4 — Security Middleware Stack · `phase/04-security-stack`

- [ ] Response-header middleware (CSP, HSTS, COOP, COEP, Referrer)
- [ ] Exact-origin CORS with Sec-Fetch-Site enforcement
- [ ] Double-submit CSRF token middleware
- [ ] Per-IP and per-intake rate limiting
- [ ] Structlog PII-redaction processor
- [ ] Security test suite

---

## Phase 5 — Agent Harness · `phase/05-agent-harness`

- [ ] Provider abstraction (OpenAI + Anthropic adapters)
- [ ] Typed tools (extract_case_facts, lookup_state_tree, assess_eligibility, recommend_services, persist_intake)
- [ ] Guardrails (max steps, confidence threshold, jurisdiction allowlist, prompt-injection sentinel)
- [ ] Eligibility agent definition and AgentRunner with run/step persistence
- [ ] Intakes router with SSE stream, POST, and DELETE-for-erasure
- [ ] Harness end-to-end test with TestModel

---

## Phase 6 — Frontend Foundation · `phase/06-fe-foundation`

- [ ] Next.js 15 App Router scaffold with styled-components v6 and distroless Dockerfile
- [ ] Security middleware (CSP nonce, HSTS headers) and nonce-aware styled-components SSR registry
- [ ] Shared libs (csrf, sanitize, api-client, schemas) with node:test specs
- [ ] Landing page with state picker and mode chooser

---

## Phase 7 — Quick Form Flow · `phase/07-quick-form`

- [ ] Quick Form stepper component (react-hook-form + zod)
- [ ] Quick Form page with server-rendered first node
- [ ] Eligibility report component and result page

---

## Phase 8 — Agent Chat Flow + Trace · `phase/08-agent-chat`

- [ ] /api/chat route handler (SSE proxy with CSRF + Origin checks)
- [ ] Agent chat and Case File card components
- [ ] (Droppable) Agent run trace timeline page

---

## Phase 9 — E2E + Container Hardening · `phase/09-e2e-hardening`

- [ ] Playwright config and quick-form happy path
- [ ] (Droppable) Talk-to-agent happy path with stubbed LLM
- [ ] Security spec (no inline styles, CSP nonce unique, no-store on PII pages)
- [ ] Finalize container hardening flags in Compose

---

## Phase 10 — Docs + Release · `phase/10-docs-release`

- [ ] DECISIONS.md final pass (all 11 sections)
- [ ] README quickstart, threat model, demo script, screenshots
- [ ] PLAN.md final status update
- [ ] Release v0.1.0
