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

**Decision:** No inline styles and a leading `'use client'` on every `*.styles.ts` (both enforced in CI by `pnpm check:styles`; inline styles also e2e-asserted), per-component co-location, lift-when-shared rule, styled-components SSR with a per-request CSP nonce (§19).

**Why `node:test` over Vitest:** Zero additional dependencies, native to Node 22, faster cold start, simpler CI. For a showcase project, fewer deps = smaller attack surface and clearer intent.

**Why no inline styles:** CSP `style-src` can be strict (`'nonce-...'` only, no `'unsafe-inline'`) when there are zero inline styles. This is a security decision masquerading as a style decision.

---

## 9. Security Posture

**Threat model:** Criminal-history PII (past offenses, dispositions, dates) — weaponizable for employment, housing, and immigration discrimination.

**Layered defenses:** TLS at Caddy → nonce CSP on web pages, locked-down CSP on API responses (§19) → CSRF + Origin enforcement → Pydantic strict validation → prompt-injection delimiters → deterministic tool boundary → PII-redacting logs → minimized at-rest data.

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

**Why separate hooks over `useChat` from Vercel AI SDK:** The FastAPI SSE format (four event types: `run_started {run_id}`, `text_chunk {text}`, `final {report}`, `error {code, message}`) doesn't map cleanly to AI SDK message format. A bespoke `useChatStream` is small and fully transparent — preferable over an opaque SDK adapter in a showcase context where reviewers want to see the streaming mechanics. The stream is a project-specific event format read with `fetch` and a `ReadableStream`, so the app does not depend on the AI SDK packages (`ai`, `@ai-sdk/react`). The AI SDK's UI hooks (`useChat` and friends) are the option to add if streaming moves to an AI-SDK-style agent protocol.

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

---

## 16. State Tree Node Identity: (group, variant), Not a Unique Node ID

**Decision:** Nodes in an extracted state tree (`packages/shared/state-trees/<state>.json`) are
keyed by `"<group>-<variant>"`, with explicit integer `group` and `variant` fields stored on the
node itself. The legacy questionnaire data model keys both its question text and its answer sets
by `(questionGroupIndex, incomingAnswerPosition)` -- the same group number can host several
distinct question variants, each with its own text and its own answer set, depending on how the
user arrived there. Collapsing a group down to a single node (keeping only the first-seen variant)
silently discards the other variants' real questions and answers, pairing the wrong answer set with
whichever question happens to render. Extraction (`scripts/extract_state_tree.mjs`) discovers each
node's true `(group, variant)` directly from the arguments the legacy handler's own `currentValue`
lookup is called with, rather than re-deriving the handler's override/redirect chain independently.

`rule_engine.step()`'s public signature still addresses by `(question_id, answer_position)` --
plain group number and answer position, no variant. This isn't an oversight: the legacy handler
itself has no memory of which variant produced the question the user is answering, only the group
number and the position of the answer they picked. A transition's destination is therefore fully
determined by `(fromGroup, answerPosition)` alone, regardless of which variant of `fromGroup` the
user was actually looking at -- replicating the API surface by variant as well would imply a
distinction the legacy system itself doesn't make when computing the next step.

**Why not address nodes by a single unique ID end-to-end:** doing so would mean inventing a new
notion of node identity that doesn't correspond to anything in the legacy system's own request
contract, and would require every caller -- engine, agent tool signatures, frontend Zod schemas --
to carry and resolve that ID instead of the two plain integers the legacy app always used. That's a
larger, separate redesign, deferred to issue #27.

**Maintained routing that differs from the legacy handler:** the legacy override chain
(`questionnaire-api/states/texas.js`) has two defects, and the maintained tree routes around them.
Each change is applied identically to the tree, its committed mirror in `apps/api/shared_data/`, and
`apps/api/tests/fixtures/texas_legacy_trace.json`, so the parity tests keep replaying every
`(questionId, answerPosition)` pair; the fixture's `sourceSha256` still pins the original file.
`test_texas_tree_parity.py` names the pairs that differ, and `test_state_tree_integrity.py` asserts
that no answer path cycles and every node is reachable from the entry node.

- **DWI conviction (#25).** In the legacy chain the override for "yes, I was convicted of a DWI"
  at `4-13` (question 4, position 9) is shadowed by an earlier override with an overlapping condition,
  so the answer reached the sex-offender-registration question (`3-9`) and, through it, the felony
  screens and the Conviction Set Aside result, which CCP art. 42A.701(g)(1) excludes for DWI. The
  maintained route is `4-6`, the first-offender question the shadowed override targeted, whose
  wording ("any crime that wasn't just a fine-only traffic offense") follows the statute's
  prior-record condition; "Nope" continues to the BAC, accident and interlock chain
  (GV 411.0731).
- **Redirects back to answered questions (#26).** Three redirects sent users back to group 1, and
  together with the forward edges formed a connected cycle of 16 question variants with no exit. Two
  changes break every cycle:
  - `6-9` "Yes, I am on Deferred Adjudication or Deferred Prosecution" (position 9) ends at
    Does Not Qualify Yet instead of `1-1`: GV 411.072 and 411.0725 require discharge and dismissal
    before nondisclosure for deferred adjudication, and expunction after a pretrial diversion
    program requires completing it (CCP art. 55A.053), so a person still serving either is not yet
    eligible. This matches `2-3`'s "deferred sentence has not been completed".
  - `7-11` "No, I was not a minor when convicted" (position 12) leads to the misdemeanor flow
    instead of `1-2`. Of the Alcoholic Beverage Code offenses, only AL 106.041 (driving under the
    influence by a minor) is excluded from nondisclosure under GV 411.073 and 411.0735, so an adult
    convicted of another alcohol offense rejoins the ordinary misdemeanor flow, which is `7-12`
    after `6-10` and `8-16` after `7-13`. Transitions are addressed by `(group, position)` alone,
    so one node cannot lead to both. `7-13` therefore points at `7-15`, a copy of `7-11` whose "No"
    answer has its own position (18) and leads to `8-16`; `6-10` keeps `7-11`, whose "No" leads to
    `7-12`.

`2-4` "No, I did not successfully complete the terms of pre-trial diversion" leads to `1-2`,
which assumes a conviction exists. That assumption is an open legal question (#81, #74), and with
`6-9` redirected the edge is not on a cycle.

These are readings of the statutes for the content owner's approval, not legal advice. Other routing
the same statutes call into question, such as the 5-year wait at `8-5` and the missing path for a
DWI conviction without community supervision, is tracked in #128 and #130.

Re-extracting from the original legacy file (`make extract-trees`) restores the legacy routing, so
the diff of a re-extraction against the committed tree is the list of changes to re-apply. A
patch or overlay applied during extraction would add a build step and a second representation of
the same routes whose only consumer is a rarely run script.

A duplicate-position case is not a defect: two distinct answers within
the same question can legitimately share a `position` value (the frontend disambiguates them by
array index/text, not position, since `position` is only ever used to pick the next transition, not
to identify an answer on screen).

---

## 17. Decision Path Display: Decoded at Render Time, Not Stored

**Decision:** A user's decision path is persisted (in the Quick Form result URL, and in
`traversed_path` on an `EligibilityReport`) only as a list of `questionId:answerPosition` codes --
never as resolved question/answer text. `apps/web/src/lib/decisionPath.ts` decodes these codes into
readable text at display time, by walking the same state tree the rule engine itself consults,
starting from `entryNodeId` and following each step's matched transition to the next node -- a
faithful replay of `rule_engine.step()`'s own global-first-match lookup, not an approximation of it.

**Why decode at render time instead of storing resolved text:** the alternative (writing the actual
question/answer strings into the result URL or the report at the moment a user completes the flow)
would double the data this app persists for no real benefit, and would still need a tree lookup to
sanitize legacy HTML in the question/help text regardless. The real cost of this choice: if
`packages/shared/state-trees/texas.json` is ever re-extracted with different wording for the same
`(questionId, answerPosition)` codes, an old bookmarked result URL decodes against the *current* tree
and silently shows the new text -- there's no version pin tying a path to the tree it was recorded
against. A genuinely malformed or unresolvable code still falls back to the raw string rather than
guessing, so this risk is "stale but plausible-looking text," not "wrong text with no indication."
Accepted for a demo-scale app; would need a tree version stamped onto the path if this mattered for a
production audit trail.

**The duplicate-position case** (one node has two distinct answers sharing a `position` value -- see
§16) means a single decoded step can legitimately have more than one matching answer. The decoder
surfaces all of them rather than guessing; the display joins them with "or" rather than picking one
arbitrarily, since nothing in the persisted path data (code or report) distinguishes which was
actually picked.

---

## 18. Reading and Deleting an Intake: The ID Is the Credential

**Decision:** `GET /api/intakes/{id}` and `DELETE /api/intakes/{id}` take no authorization beyond
knowing the intake ID. Intake IDs are ULIDs, whose 80 random bits (from the OS CSPRNG) make them
infeasible to guess or enumerate, and a 404 is returned identically for an ID that never existed.
Tracked in #34.

**What is exposed:** `GET` returns the state, mode, status, result key(s), the traversed decision
path and run metadata (provider, status, start time). It does not return the free-text narrative,
which is the most sensitive field the app stores. `DELETE` removes the intake and every record
attached to it; it is the right-to-erasure endpoint, so being callable by whoever holds the ID is
consistent with what it is for.

**Where the ID can leak:** it appears in the path of the Talk-to-Agent stream proxy
(`/api/chat/<id>/stream`), so it can end up in hosting request logs, and a person can share it
deliberately. Anyone who obtains it can read that one intake's metadata or delete it. They gain no
access to any other intake.

**Why not a capability token on these routes:** the stream token (§14) lives 120 seconds, so
protecting GET and DELETE would need a second, longer-lived credential. A stateless signed token
can't be revoked; a stored, hashed token needs a schema migration. Either way it touches the API
schemas, the Next.js proxy, the web client and the tests, and it is a breaking API change. The
web app never calls either endpoint today, so the new credential would guard routes with no caller
while moving the same bearer-secret risk from the ID to the token. The cost outweighs the benefit
at this data sensitivity.

**When to revisit:** add a capability token (stored hash, returned once at creation, sent as a
bearer header) if any of these become true: `GET` starts returning narrative text or anything else
identifying; the web app starts reading intakes back; intake IDs begin appearing in user-visible
URLs or shared links; or the app is used with real, non-demo data.

---

## 19. Content-Security-Policy: Nonce Over 'unsafe-inline'

**Decision:** `apps/web/src/middleware.ts` generates a nonce per request and sets
`script-src 'self' 'nonce-X' 'strict-dynamic'` and `style-src 'self' 'nonce-X'` (built by
`src/lib/buildCsp.ts`), plus `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, `frame-ancestors 'none'` and `upgrade-insecure-requests`. `connect-src` omits
the API origin because the browser only calls same-origin `/api/*` route handlers; the server
proxies to the backend. `next.config.ts` adds `Cross-Origin-Opener-Policy` and
`Cross-Origin-Resource-Policy` (`same-origin`) and a `default-src 'none'` CSP on `/api/*` responses,
which the middleware skips. The FastAPI app's `SecurityHeadersMiddleware` applies a locked-down
`default-src 'none'` CSP to responses produced by the application and its routers. The
interactive docs and the OpenAPI schema are off unless `API_DOCS_ENABLED` is set to true (Docker
Compose, the local quickstart, turns them on by default); only when they are on are the docs pages
left without a CSP, because their CDN-loaded Swagger/ReDoc assets need it. Rejections generated by
the CSRF, origin, CORS and rate-limit middleware carry the CSP too, because it is registered last in
`app/main.py` and so wraps every other middleware. Unhandled 500s do not, since Starlette's
`ServerErrorMiddleware` sits outside all user middleware and answers with a fixed plain-text
`Internal Server Error` body with no attacker-controlled content.

**Why:** the app handles sensitive criminal-history data, and an inline-script allowance would let
any injected markup execute. A nonce makes the policy meaningful against XSS.

**Costs:**
- Every HTML response is rendered per request. `/` loses static generation/ISR (its only data is
  the cached `/api/states` fetch), and HTML cannot be cached by a CDN. `/intake/*` was already
  dynamic and `no-store`.
- Style nonces need plumbing: the root layout reads `x-nonce` from the request headers, passes it to
  the styled-components registry (`ServerStyleSheet({ nonce })`, `StyleSheetManager`) and renders
  `<meta property="csp-nonce">`, which styled-components reads for style tags injected in the
  browser. The no-inline-styles rule (§8) is what lets `style-src` stay nonce-only. styled-components
  emits un-nonced `<style>` elements when a component renders in a Server Component, so every
  `*.styles.ts` carries `'use client'` and client components render through the nonced registry. The
  directive is required even on files only client components import: the next importer may be
  a Server Component. CI serves the standalone production build, so a missing directive fails the
  production e2e run; `pnpm check:styles` catches it earlier and without a browser, and local
  `pnpm e2e` uses the dev server, whose policy allows inline styles. The directive turns every
  export of a styles file into a client reference, which is safe for styled components; a Server
  Component that imported a `css` or `keyframes` value from one would receive that reference, not
  the value. `apps/web/src/app/not-found.tsx` replaces Next's built-in 404, whose inline `<style>`
  and `style` attributes cannot carry a nonce and would be blocked.
- The `csp-nonce` meta tag is not always in the DOM when styled-components first inserts a style.
  When `notFound()` is thrown after an `await`, Next serves an error shell with an empty `<head>`
  and renders the layout in the browser, and styled-components caches the nonce it resolves at
  that first insertion. `apps/web/src/instrumentation-client.ts` therefore sets
  `__webpack_nonce__` from the first nonced script before any application module loads. The
  assignment is guarded because Turbopack (dev) does not define the global, and the dev
  `style-src` allows inline styles anyway. Deleting that file breaks styles on that path in
  production, which the production e2e run in CI catches.
- The development policy differs: `script-src` adds `'unsafe-eval'` (React dev tooling), `style-src`
  swaps the nonce for `'unsafe-inline'` (a nonce makes browsers ignore `'unsafe-inline'`), and
  `upgrade-insecure-requests` is dropped so http://localhost works. CI runs the Playwright suite
  against the standalone production build (`E2E_WEB_MODE=production`, the same `server.js` layout
  the Dockerfile runs), and local `pnpm e2e` uses the dev server, with `pnpm e2e:prod` to opt in.
  CI therefore no longer runs the Turbopack dev server, so dev-only breakage shows up only for
  developers running `pnpm dev`; a CI matrix over both modes would cover it.

**Alternatives rejected:**
- `'unsafe-inline'` for scripts via static `headers()`: keeps `/` static and is a one-line change,
  but permits inline script execution, so it gives little protection against injected script.
- Experimental Subresource Integrity hashes (`experimental.sri`): webpack-only (dev uses Turbopack)
  and does not cover Next's inline bootstrap scripts.
- Adding the API origin to `connect-src`: widens the policy for requests the browser never makes.
- Cross-Origin-Embedder-Policy: nothing needs isolating and it risks breaking embeds.
- Self-hosting the Swagger/ReDoc assets under a docs-only CSP: keeps the docs public and adds a
  second policy to maintain.
- Removing the docs exemption outright: docs that are turned on render blank under
  `default-src 'none'`.

**When to revisit:** if page-load cost from losing static HTML matters, or Next ships first-class
hash-based CSP for inline scripts; if the browser starts calling the API origin directly (add it to
`connect-src`); if the docs must be served publicly (self-host the assets under a docs-scoped CSP);
if unhandled 500s must carry security headers (an Exception handler installed on
`ServerErrorMiddleware` can apply them); if a production build moves to Turbopack, which does not
define `__webpack_nonce__`, it needs an equivalent of `instrumentation-client.ts`.

---

## 20. Help Presentation: Dialog, Reviewed Rule Ledger, Separate Sanitizer Profile

**Decision:** Question help text is shown behind a "Help: <title>" button that opens a native
`<dialog>` (a bottom sheet at 640px and below, a centred dialog above that). Nodes with no help
render no button. A rule sentence is promoted into a "How to answer" box above the button only when
a person has reviewed it: `apps/web/src/lib/helpRuleLedger.json` records, per reviewed node, a
SHA-256 over the state, the question, the rule sentence, the whole help text and the answer labels,
and `decideHelp` promotes a rule only when the current content hashes to a recorded entry. Everything
else stays in the dialog body, never hidden or reworded: a rule that is the single "answer yes/no"
sentence in a promotable position (the first paragraph) is an ordinary bold paragraph there, and
any other sentences are left where the help text puts them.
`apps/web/src/lib/helpTransform.ts` turns the legacy help HTML into a title, an optional rule
sentence and render blocks using its own sanitizer profiles; `sanitizeLegacyHtml` is unchanged and
still serves questions, answers and the decision path (§17). Statute and index lists come back as
data and are rendered by React (labels and entries as text nodes). Content problems found in the
help text itself (#67, and the statute spike #74) are not rewritten here (the trees are pinned by parity
tests, so everything is render-time).

**Why:**
- The legacy titles are `<h5><u>…</u></h5>`; the existing allowlist strips `h5`, which left a bare
  underlined line. Widening that one allowlist would also widen it for questions and answers, so
  help has a separate input profile (adds `h5` and `div`) and a separate output profile (adds
  attribute-free `h3`/`h4`).
- The global reset zeroes margins and padding, so list and paragraph rhythm has to be rebuilt where
  the help is rendered.
- Inline help pushed the answer buttons 900 to 2,300px down the page on a phone. Behind a button the
  answers stay in view and the dialog scrolls on its own.
- Legacy help can contradict its question (for example a node whose question asks about deferred
  adjudication and whose rule sentence says "convicted"; #67). Code cannot judge whether a sentence
  agrees with its question, so promoting a rule into the app's own voice requires a recorded human
  review. The review covers the whole help text because no list of phrasings can
  recognise every way a body could gain a contradicting instruction.
- The client knows the question group but not the node variant (§16), so lookup is by content hash;
  the `<state>:<nodeId>` keys are for reviewers and for the test that ties each entry to the tree.
- The dialog is native: `showModal()` makes the page inert and Esc closes it through the native
  `cancel`/`close`, with no focus-trap code. Four browser differences are handled explicitly:
  - Focus is returned to the button on close, because WebKit does not restore it after a pointer
    open.
  - Initial focus goes to the heading, so WebKit does not outline the whole sheet after a tap.
  - The dialog, Close and Back carry a transparent 1px border so forced-colors mode can draw their
    edges.
  - The dialog frame is not a scroll container (`overflow: hidden`; the body scrolls) and has
    `tabindex="-1"`. In Chromium and WebKit, Tab cycles Close, the body and Back, then leaves for
    the browser UI; in Firefox it leaves for the browser UI. The frame never takes Tab focus in
    any of them, so it can only be focused programmatically. If it is focused, it shows an inset
    2px `--color-blue-500` ring (inset because the frame clips its content), so focus is never
    invisible. It is not focused on open, where focus goes to the heading.
  - A `vh` line precedes `dvh` for the maximum height.
- The backdrop closes the dialog from a JS `click` handler on the dialog. The handler closes only
  when the press also began on the backdrop (a drag that starts inside and ends outside must not
  close it) and the point lies outside the dialog's bounding box (its own edge, padding and
  rounded-corner cutouts also report the dialog as the click target).
- Rejected: native light dismiss (`closedby="any"`). It closes on pointer-up, so on touch the tap's
  follow-up click is delivered to the page behind the backdrop, which can submit an answer.
- Every pointer-initiated close (backdrop, Close, Back to the question) starts a guard window in
  which a capture-phase listener on `document` cancels pointer `click`, `dblclick` and `mousedown`
  events aimed outside the dialog (`apps/web/src/components/pageClickGuard.ts`). Without it the
  second click of a double click or double tap would reach whatever sits under the pointer once
  the dialog has left the top layer: an answer button (the form has no undo) or the Back link.
  Cancelling `mousedown` also keeps focus on the Help button instead of the control under the
  pointer. The windows:
  - 700ms for any pointer click (`detail` of 1 or more): the platform's default double-click time
    (500ms on Windows) plus margin.
  - 1200ms for clicks that continue a multi-click sequence (`detail` of 2 or more): longer than the
    longest double-click time of any platform setting we know of (Windows tops out at 900ms), with
    margin.
  - Touch differs by engine. WebKit and Firefox report `detail` 1 for every tap, so only the 700ms
    window applies to touch there (a third tap of a slow triple tap, for example at about 710ms,
    reaches the page); Chromium counts taps and applies the 1200ms window as well.
  - Keyboard and programmatic clicks (`detail` of 0) are never held back, because they cannot be
    the second half of a pointer double activation. Esc starts no window. An assistive-technology
    activation that a platform synthesizes as a touch (VoiceOver on iOS, for example) probably
    reports `detail` 1, so one within 700ms of a pointer close can be ignored. That is accepted:
    a screen-reader user cannot move to an answer and activate it in that time.
  - A press is judged once, at `mousedown`. If it began inside a window and was cancelled, its
    `click` is cancelled too even when the button is released after the window ends. A press that
    began after the window is never affected. If a window ends while a cancelled press is still
    held, the listeners stay until its click, the next press, or one more second, then remove
    themselves.
  - Opening the dialog again, or the question changing, ends the window.
  - Cost: a deliberate tap on an answer, or on the Help button, within 700ms of closing the
    dialog with the pointer is ignored.
- The Back to the question button is hidden at heights of 480px and below (a phone in landscape,
  200% and 400% zoom) so the body keeps the height; Close and Esc remain.
- The Help button is disabled while an answer is being submitted, because the question is about to
  be replaced and a dialog opened in that window would be removed without a close event.

**Costs:**
- A human review step before a rule can be shown in the box, and a ledger file to maintain.
- Because the hash covers the whole help text, any change to its words withdraws a reviewed box
  until it is reviewed again. Formatting changes that leave the words unchanged do not. Re-review
  only happens on a deliberate re-extraction of the tree, so the cost is small.
- The help needs JavaScript to open, and a closed dialog is neither found by find-in-page nor
  printed.
- Known gaps in the transform and the review hash are tracked: the title guard recognises only
  literal rule phrases (#115), and the review hash ignores block structure and formatting (#116).
- A reviewed entry also covers any other node with identical wording; the review sheet from
  `pnpm --filter web help:review` lists them.

**Alternatives rejected:**
- Keeping the inline callout: it is the source of the answers-off-screen problem.
- One global sanitizer allowlist with `h5` added: it would change what questions and answers can
  contain, which are rendered by a different, security-reviewed profile.
- A keyword check for "the sentence agrees with the question": it passes rules that are wider than
  their question, and failing closed on the keywords withholds rules that are correct.
- CSS-only fixes: styling cannot restore the stripped `h5`, and it leaves the answers off screen.

---

## 21. Texas Tree Wording Corrections Sit on Top of the Legacy Extraction

**Decision:** The wording in `packages/shared/state-trees/texas.json` is the product's source of
truth for question text, answer labels, and help text. A small set of strings in it is corrected
by hand and therefore differs from what `scripts/extract_state_tree.mjs` produces from the legacy
`states/texas.js`: the help rules at 12-3, 16-1 and 14-5 and the 10-7 answer label, yes/no
answer buttons that do not read as answers to their question (2-0, 5-2, 6-1, 7-10, 10-9), the
worked example in 2-0's help, 4-0's help (reduced to the statute-of-limitations introduction),
and references to help that does not apply (2-6, 4-0, 7-10). Each correction is applied
identically to the tree, its committed mirror in `apps/api/shared_data/`, and
`apps/api/tests/fixtures/texas_legacy_trace.json`, so the parity tests that replay every
`(questionId, answerPosition)` pair keep agreeing. No transition, answer position, `group`,
`variant`, or `questionsLeft` value changes.

**Provenance:** the fixture's `sourceSha256` pins the original, uncorrected `texas.js`. The
corrected tree and fixture are not what that file produces. The legacy file shares one help string
between sibling questions (for example 11-11 and 12-3), so reproducing a correction from the
source also means giving the corrected question its own string. Re-extracting from the original
file reverts every correction, and the diff of a re-extraction against the committed files is the
list of corrections to re-apply. The legacy checkout lives outside this repository and its path is
not recorded here.

**Why not store the corrections as a patch or overlay applied during extraction:** that adds a
build step and a second representation of the same wording whose only consumer is a rarely run
script. The cost is that re-extraction needs the re-apply step above. A CI guard that detects a
re-extraction silently reverting a correction is a possible follow-up.
