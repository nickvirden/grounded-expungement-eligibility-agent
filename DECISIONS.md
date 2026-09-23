# Architecture Decision Log

This document records every significant architectural and technical decision made during the build. Each section explains the choice, the alternatives considered, and the trade-offs accepted.

---

## 1. Stack: Next.js 15 + styled-components / FastAPI / Postgres + SQLModel

**Decision:** Next.js 15 (App Router, React 19) with styled-components v6 for the frontend; FastAPI with Pydantic v2 for the backend; SQLModel for persistence, on Postgres in the Docker Compose deploy and SQLite for local dev/tests (see §6).

**Why:** Next.js 15 gives us React Server Components and streaming SSR for fast TTFB, while preserving CSR for interactive flows (chat UI). styled-components is chosen to leverage deep existing expertise — the trade-off is the SSR registry boilerplate required in App Router. FastAPI is async-native with free OpenAPI docs and ergonomically matches Pydantic AI. SQLModel keeps one set of models across both databases.

---

## 2. Agent Framework: Pydantic AI

**Decision:** Use Pydantic AI as the agent engine with a custom harness layer on top.

**Alternatives rejected:**
- **Hand-rolled ReAct loop:** Silent bugs in parse/act cycles are time-expensive to debug; parser brittleness provides marginal showcase gain for significant implementation risk within the 5-hour budget.
- **LangGraph:** Powerful state-machine framework, but its learning curve is disproportionate to the demo scope. It's an excellent choice for production multi-agent systems, but the investment/payoff ratio doesn't fit a time-boxed showcase.

**Why Pydantic AI:** Type-safe tool calling, structured output, streaming, and a `TestModel` for deterministic testing — all out of the box. Our thin harness adds provider abstraction, guardrails, run/step persistence, and SSE streaming.

---

## 3. Provider Abstraction

**Decision:** Pluggable LLM provider via `LLM_PROVIDER` env var (`testmodel`, `openai`, `anthropic`, `ollama`), with real providers behind an `ALLOW_REAL_LLM_PROVIDERS` opt-in that defaults off.

**Why:** Demonstrates production thinking (vendor lock-in avoidance, cost routing potential, offline demo capability). At scale, this layer would add fallback chains, cost-based routing, and circuit breakers.

**Current state:** all three real providers construct correctly, each via its `Provider` object (`OpenAIProvider`/`AnthropicProvider`/`OllamaProvider`), passed to the model class rather than credentials on the model class directly. The deployed site keeps `ALLOW_REAL_LLM_PROVIDERS` off and `LLM_PROVIDER=testmodel`, on purpose, to guarantee $0 ongoing spend -- this is a product decision, not a remaining bug. Two independent layers keep a real provider from firing while the opt-in is off: `make_model()` in `app/agents/providers.py` refuses to construct one at all, and `pydantic_ai.models.ALLOW_MODEL_REQUESTS` is set to `False` at startup, which every real OpenAI/Anthropic/Ollama request path checks before firing (and which `TestModel` never checks, so the default path is unaffected). A third, independent layer -- `DAILY_SPEND_CAP_USD`, defaulting to `0.0` -- sums today's recorded cost before every run and refuses anything that would exceed it, checked inside the agent harness itself so it protects every caller, not just the HTTP route. "Free" is decided from the model's actual price-table entry, never inferred from a token count or a flat per-provider assumption: a genuinely free run (`testmodel`, or Ollama against a verified-local host) is unaffected by prior spend, while every other model -- including a remote Ollama host, which has no real per-token price but isn't actually free -- is refused outright at the $0 default, with no override based on the cap alone. Turning real providers on for a real deployment means flipping the opt-in, raising the cap, and providing credentials -- documented as a deliberate, reviewable step, not a default.

---

## 4. Hallucination Defense

**Decision:** The agent cannot state an eligibility outcome without calling the deterministic `assess_eligibility` tool. The system prompt forbids it, and tests assert that every `EligibilityReport` carries a tool-derived `traversed_path`.

**Why:** Criminal-history PII demands correctness over fluency. The deterministic tool boundary means the LLM orchestrates but never decides.

---

## 5. Knowledge Base: Extracted JSON Trees

**Decision:** Extract legacy `questionnaire-api` decision trees to static JSON rather than using embedding/RAG.

**Why:** The eligibility rules are deterministic decision trees, not unstructured corpora. JSON gives us auditability, versioning, and zero hallucination risk. For real legal corpora (case law citations, statutory text), we'd add vector retrieval — documented as the production path.

---

## 6. Persistence: Postgres + SQLModel + Alembic, SQLite for the inner loop

**Decision:** The Docker Compose deploy runs Postgres 16, with its schema owned by Alembic migrations (`apps/api/alembic/`) applied by an explicit `make migrate`. Local dev without Docker and the default pytest run use SQLite, with tables created from the models (`create_all`) on startup. SQLModel (by FastAPI's author) gives us Pydantic models that double as SQLAlchemy models for both.

**Why Postgres for the deploy:** Concurrent writers (every agent step persists from its own session), a real network database, and production-realistic behavior — SQLite and Postgres differ in type coercion, case sensitivity, and constraint/transaction semantics, so the deployed database should be the one we'd actually run.

**Why keep SQLite for dev/tests:** Zero-ops inner loop and a fast default test suite. The same suite runs against Postgres by pointing `DATABASE_URL` at a migrated database (see README → Running Tests).

**Driver: psycopg3 (sync), not asyncpg.** The DB layer is fully synchronous (`Session`, not `AsyncSession`) across every router and the agent harness. An async driver would force rewriting all of those call sites for no functional gain at this scale.

**Migrations are an explicit step, not run on boot.** Auto-migrating on container start is simpler, but it applies a bad migration with no separate approval gate and races when more than one API instance starts. For the same reason, `create_all` only runs on SQLite: on Postgres it would silently create tables Alembic never recorded, and the next `alembic upgrade head` would fail on already-existing tables.

**Migration hygiene:** Autogenerated revisions are drafts — read and hand-check each one against `app/models.py` before committing. Every revision must downgrade cleanly (`alembic downgrade base && alembic upgrade head`).

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

## 11. Frontend Routing: Two Entry Points, One Rule Engine

**Decision:** The same deterministic rule engine powers both the Quick Form (pure REST) and Talk-to-Agent (AI + SSE) flows. Users pick the experience that matches their comfort level.

**Quick Form architecture:** Server Component fetches the entry question (SSR for fast TTFB). Client Component drives the stepper with a minimal state machine. On terminal answer, result data travels in URL search params to the result page (no round-trip required).

**Talk-to-Agent architecture:** A Next.js Route Handler at `/api/chat` creates the intake (server-to-server call with matching CSRF token pair — safe because CSRF protects browsers, not server proxies). A second Route Handler at `/api/chat/[id]/stream` transparently proxies FastAPI's SSE stream. The `useChatStream` hook consumes the stream, accumulates text chunks into a single growing agent bubble, and sets the final `EligibilityReport` on the `final` SSE event.

**Why separate hooks over `useChat` from Vercel AI SDK:** The FastAPI SSE format (`{type, text/report/error}`) doesn't map cleanly to AI SDK message format. A bespoke `useChatStream` is 80 lines and fully transparent — preferable over an opaque SDK adapter in a showcase context where reviewers want to see the streaming mechanics.

---

## 12. Server-to-Server CSRF Bypass Pattern

**Decision:** The Next.js Route Handler generates a matching CSRF token pair (`randomBytes(32).toString('base64url')`) and sends both `Cookie: __Host-csrf=TOKEN` and `X-CSRF-Token: TOKEN` headers to FastAPI.

**Why this is safe:** CSRF attacks exploit the browser's automatic cookie inclusion on cross-origin requests. A server-side proxy has no browser context — it explicitly constructs every header. Providing a matching double-submit pair satisfies the middleware contract without adding a special service-auth path.

**Alternative considered:** A `INTERNAL_SERVICE_TOKEN` header bypass in the CSRF middleware. Rejected because it adds a second authentication surface; the matching-pair pattern reuses the existing contract.

---

## 13. Rate Limiting: Per-Route slowapi Decorators, No Per-Client Identification

**Decision:** `@limiter.limit(intakes_per_minute)` on `POST /api/intakes` and `GET /api/intakes/{id}/stream` only — the two routes that trigger LLM/DB cost, each with its own independent 2/minute budget (`key_style="endpoint"` keys the counter by route, not by URL, so rotating the intake ID in the stream URL doesn't reset it). `@limiter.exempt` on `/healthz` and `/readyz` so uptime probes are never rate-limited. slowapi's default key function is `get_remote_address`, which reads the IP off the raw connection — but every request in this app's actual deployment passes through the Next.js server (`apps/web/src/app/api/backend/[...path]/route.ts` and friends) before reaching the API, and none of those proxy routes forward the original client's IP. So in practice `get_remote_address` sees the Next.js server's own outbound address(es) rather than the visitor's, collapsing all visitors onto a budget that's effectively shared per API instance rather than per-IP/per-NAT.

**Why not a more precise per-visitor limit:** A per-IP limit would still be coarse — a shared IP (office NAT, campus network) shares one budget — but that's moot here since the proxying described above already collapses every visitor onto one key. A more precise identifier (session cookie, fingerprint) was considered and rejected: for a demo with no real traffic to speak of, plumbing per-visitor identification through the Next.js proxy layer is more machinery than the actual risk (a shared 2/minute budget on cost-triggering routes) justifies right now.

**Accepted tradeoff — in-memory storage resets per instance:** slowapi's default storage is an in-process counter. Each serverless instance (e.g. each warm Vercel lambda) keeps its own counter, and that counter resets to zero on every cold start. In practice this means the real-world limit is approximately N× the configured per-minute number, where N is however many instances happen to be warm at once — not a fixed, precise cap. For a low-traffic demo this is an acceptable tradeoff, not a bug: a shared store (Redis) would fix it, but adds an operational dependency this project doesn't otherwise need.

---

## 14. SSE Stream Authorization: Signed, Single-Purpose Tokens

**Decision:** `GET /api/intakes/{id}/stream` requires a short-lived (120s), `itsdangerous`-signed
token bound to one intake ID, minted by `POST /api/intakes` and sent as `Authorization: Bearer
<token>` (never a query param, which would leak into logs and any `Referer` header). The token is
checked before the intake is ever looked up in the database, so an invalid token gets the same
response whether or not the requested ID is real -- it can't be used to enumerate intake IDs.
Failure modes are distinct: missing/malformed/expired token → `401` with `WWW-Authenticate:
Bearer`; a token minted for a different intake → `403`; the signing key itself unset or too short
→ `503`.

**Why fail closed per-feature, not at API boot:** Quick Form, health checks, and every other route
have nothing to do with Talk-to-Agent, so a missing optional secret for one feature shouldn't be
able to take the rest of the API down with it. A boot-time crash on a missing `SSE_SIGNING_KEY`
would do exactly that. `app/security/stream_token.py`'s `is_configured()` is checked wherever this
matters (`POST /api/intakes` for agent-mode intakes, `GET .../stream`) and turns a missing/too-short
key into a `503` there, not a crash anywhere else.

**Why not a query param or `EventSource`:** `EventSource` has no API for setting request headers,
which would otherwise push a token into the URL itself -- and a token in the URL ends up in server
access logs and gets forwarded as `Referer` on any same-page outbound request. `useChatStream`
already reads its SSE stream via `fetch()` and a `ReadableStream`, not `EventSource`, which makes a
header-based token straightforward to send alongside the request.

**Why the token isn't single-use:** it's bound to a TTL and one intake ID, not tracked as
spent-or-not server-side. The thing that actually stops a second billable run on the same intake is
the replay guard's atomic claim in `app/agents/replay_guard.py`, not the token -- reusing a
still-valid token against its own intake correctly reaches that 409, rather than a redundant second
layer of single-use bookkeeping doing the same job.

**Deploy-order tolerance:** `apps/web` and `apps/api` deploy from the same push as two independent
Vercel projects, not atomically. The web side treats `stream_token` in the create-intake response
as optional and only sends the header when present, so a web deploy landing slightly ahead of the
API's doesn't crash -- it just doesn't send a token yet, which an older API doesn't require either.
The reverse order (new API, old web) is the one direction that's a genuine breaking change: the
API requires the header unconditionally, since that's the actual point of this feature.

---

## 15. What We'd Do With More Time



- Prompt evaluation harness (systematic evals across edge cases)
- All 20+ state decision trees extracted and tested
- Vector retrieval over case-law citations for richer agent context
- Cost-based LLM routing with fallback chains
- Human-in-the-loop escalation workflow
- Real auth (OAuth2 / passkeys)
- Real payment integration
- Formal SOC2-aligned audit trail with immutable event sourcing
