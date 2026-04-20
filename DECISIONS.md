# Architecture Decision Log

This document records every significant architectural and technical decision made during the build. Each section explains the choice, the alternatives considered, and the trade-offs accepted.

---

## 1. Stack: Next.js 15 + styled-components / FastAPI / SQLite + SQLModel

**Decision:** Next.js 15 (App Router, React 19) with styled-components v6 for the frontend; FastAPI with Pydantic v2 for the backend; SQLite via SQLModel for persistence.

**Why:** Next.js 15 gives us React Server Components and streaming SSR for fast TTFB, while preserving CSR for interactive flows (chat UI). styled-components is chosen to leverage deep existing expertise — the trade-off is the SSR registry boilerplate required in App Router. FastAPI is async-native with free OpenAPI docs and ergonomically matches Pydantic AI. SQLite + SQLModel is zero-ops for a demo while being a one-line swap to Postgres for production.

---

## 2. Agent Framework: Pydantic AI

**Decision:** Use Pydantic AI as the agent engine with a custom harness layer on top.

**Alternatives rejected:**
- **Hand-rolled ReAct loop:** Silent bugs in parse/act cycles are time-expensive to debug; parser brittleness provides marginal showcase gain for significant implementation risk within the 5-hour budget.
- **LangGraph:** Powerful state-machine framework, but its learning curve is disproportionate to the demo scope. It's an excellent choice for production multi-agent systems, but the investment/payoff ratio doesn't fit a time-boxed showcase.

**Why Pydantic AI:** Type-safe tool calling, structured output, streaming, and a `TestModel` for deterministic testing — all out of the box. Our thin harness adds provider abstraction, guardrails, run/step persistence, and SSE streaming.

---

## 3. Provider Abstraction

**Decision:** Pluggable LLM provider via `LLM_PROVIDER` env var (openai | anthropic | ollama).

**Why:** Demonstrates production thinking (vendor lock-in avoidance, cost routing potential, offline demo capability). At scale, this layer would add fallback chains, cost-based routing, and circuit breakers.

---

## 4. Hallucination Defense

**Decision:** The agent cannot state an eligibility outcome without calling the deterministic `assess_eligibility` tool. The system prompt forbids it, and tests assert that every `EligibilityReport` carries a tool-derived `traversed_path`.

**Why:** Criminal-history PII demands correctness over fluency. The deterministic tool boundary means the LLM orchestrates but never decides.

---

## 5. Knowledge Base: Extracted JSON Trees

**Decision:** Extract legacy `questionnaire-api` decision trees to static JSON rather than using embedding/RAG.

**Why:** The eligibility rules are deterministic decision trees, not unstructured corpora. JSON gives us auditability, versioning, and zero hallucination risk. For real legal corpora (case law citations, statutory text), we'd add vector retrieval — documented as the production path.

---

## 6. Persistence: SQLite + SQLModel

**Decision:** SQLite for the demo with Alembic migrations.

**Why:** Zero-ops, portable, fast for single-writer workloads. SQLModel (by FastAPI's author) gives us Pydantic models that double as SQLAlchemy models. The one-line Postgres swap path: change `DATABASE_URL` and add `asyncpg`.

---

## 7. Observability

**Decision:** structlog JSON logs with a PII-redaction processor, DB-backed agent run traces, optional Logfire/OTel.

**Why:** The PII redaction processor is non-negotiable — criminal-history data must never leak to log aggregators. DB-persisted `agent_run` + `agent_step` rows provide a portable audit trail independent of any external tracing vendor.

---

## 8. Frontend Conventions

**Decision:** No inline styles (lint-enforced + e2e-asserted), per-component co-location, lift-when-shared rule, styled-components SSR with CSP nonce.

**Why `node:test` over Vitest:** Zero additional dependencies, native to Node 22, faster cold start, simpler CI. For a showcase project, fewer deps = smaller attack surface and clearer intent.

**Why no inline styles:** CSP `style-src` can be strict (`'nonce-...'` only, no `'unsafe-inline'`) when there are zero inline styles. This is a security decision masquerading as a style decision.

---

## 9. Security Posture

**Threat model:** Criminal-history PII (past offenses, dispositions, dates) — weaponizable for employment, housing, and immigration discrimination.

**Layered defenses:** TLS at Caddy → CSP nonce → CSRF + Origin enforcement → Pydantic strict validation → prompt-injection delimiters → deterministic tool boundary → PII-redacting logs → minimized at-rest data.

**Deferred (documented):** Full KMS envelope encryption, SOC2 controls, formal penetration testing, SIEM integration.

---

## 10. Mocked External Services

**Services not implemented (interface stubs preserved):** Salesforce, PayPal, Mailgun, AdWords, ActiveCampaign, ScheduleOnce, Million Verifier.

**Why:** These are orthogonal to the eligibility determination flow. The interfaces exist for future integration; mocking them keeps the demo focused on the agent + rule engine showcase.

---

## 11. What We'd Do With More Time

- Prompt evaluation harness (systematic evals across edge cases)
- All 20+ state decision trees extracted and tested
- Vector retrieval over case-law citations for richer agent context
- Cost-based LLM routing with fallback chains
- Human-in-the-loop escalation workflow
- Real auth (OAuth2 / passkeys)
- Real payment integration
- Formal SOC2-aligned audit trail with immutable event sourcing
