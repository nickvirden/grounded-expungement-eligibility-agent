# Grounded Expungement Eligibility Agent — Audit-Trailed

**ClearSlate** is a modern rewrite of a legacy eligibility questionnaire, demonstrating agentic AI architecture, security-first design, and production-grade engineering.

It's a fictional product, modeled on a real-world record-clearing workflow (WipeRecord) — not affiliated with, endorsed by, or a rebuild of any real company's actual system.

---

## The Problem

Services like WipeRecord help people determine if their criminal record qualifies for expungement or sealing, typically via a server-side decision tree that hands off to human attorneys for processing. That pattern works, but it has no agentic intelligence, no structured persistence, and no way to handle the open-ended narratives users want to share — the gap ClearSlate is built to close.

---

## The Solution

Two entry points, one deterministic rule engine:

| Mode | Path | Description |
|------|------|-------------|
| **Quick Form** | `/intake/[state]/quick` | Guided yes/no stepper; first question server-rendered for fast TTFB |
| **Talk to Agent** | `/intake/[state]/talk` | AI agent chat with live Case File sidebar; streams SSE tokens in real-time |

Both modes drive the same deterministic eligibility rule engine extracted from the legacy `questionnaire-api`. The agent mode wraps it with a Pydantic AI agent that:
- Can't hallucinate an eligibility result (tool boundary enforced in system prompt + guardrails)
- Streams every reasoning step to the UI in real-time
- Persists a full audit trail (`agent_run` + `agent_step`) for every session

---

## Quick Start

### Prerequisites
- Docker Desktop (Engine ≥ 24)
- `make`

### One command
```bash
git clone <this repo>
cd grounded-expungement-eligibility-agent
cp .env.example .env
make up
```

Open (Caddy fronts everything on 443/80, no port needed):
- **UI:** https://localhost
- **API Docs:** https://localhost/api/docs
- **Health:** https://localhost/healthz

### Without Docker (local dev)
```bash
# Terminal 1 — API
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — Web
cd apps/web
pnpm install
NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev
```

---

## Architecture

```
Browser
  │
  ├─ GET /                       → Landing page (SSR, state list from API)
  │
  ├─ /intake/[state]/quick       → Quick Form stepper
  │    └─ POST /api/eligibility/assess  (deterministic rule engine, per step)
  │
  └─ /intake/[state]/talk        → Talk to Agent
       ├─ POST /api/chat          → creates intake on FastAPI
       └─ GET  /api/chat/[id]/stream  → SSE proxy → FastAPI agent stream
            └─ Pydantic AI agent
                 ├─ tool: lookup_state_tree    (deterministic)
                 ├─ tool: assess_eligibility   (deterministic)
                 └─ tool: recommend_services   (deterministic)

FastAPI (apps/api)
  ├─ /api/eligibility  — deterministic rule engine
  ├─ /api/states       — state tree metadata
  ├─ /api/intakes      — intake CRUD + SSE agent stream
  └─ /healthz / /readyz

Persistence (SQLite → swap to Postgres by changing DATABASE_URL)
  ├─ intake
  ├─ eligibility_result
  ├─ agent_run
  └─ agent_step

Security layers: Caddy TLS → SecurityHeaders → CSRF (double-submit) → StrictOrigin
→ CORS → rate limiting → Pydantic strict validation → PII-redacting structured logs
```

---

## Demo Script

### Quick Form (2 minutes)
1. Open https://localhost
2. Select **Texas** from the state picker
3. Click **Quick Form**
4. Answer the questions (try: all "No" responses for the fastest path to a result)
5. Observe the result page with traversed decision path

### Talk to Agent
No API key needed -- the default `LLM_PROVIDER=testmodel` runs a
deterministic demo path: it picks a branch of the decision tree by matching
a few keywords in your narrative (e.g. "dismissed", "convicted"), then
walks the same rule engine the Quick Form uses, with no external LLM call.
It's a stand-in for the real agent, not the agent itself -- `openai`,
`anthropic`, and `ollama` are all rejected at startup today (a known,
currently-broken bug in their provider construction, not a credentials
issue), so there's currently no way to run the real tool-calling agent.
1. From the landing page, select **Texas → Talk to Agent**
2. Type: _"I was arrested in Texas in 2019 for a DUI misdemeanor. The charges were dismissed. I have no other charges."_ (the keyword match is naive substring matching, not semantic understanding -- e.g. "not convicted" contains "convicted" and would be misread as a conviction; phrasing like "dismissed" or "no conviction" avoids that trap)
3. Watch the deterministic result stream in and the Case File card render in real-time

---

## Running Tests

```bash
# Backend: all 86 tests (pytest lives in the dev extra)
cd apps/api
uv run --extra dev pytest tests/ -v

# Frontend: node:test unit tests
cd apps/web
pnpm test

# Type checks
cd apps/web && pnpm next build   # TS errors fail the build
cd apps/api && uv run --extra dev mypy app/  # strict mode
```

---

## Branch Structure

This project uses a stacked feature branch workflow:

| Branch | Phase |
|--------|-------|
| `main` | Phase 0 — repo bootstrap |
| `phase/01-monorepo-scaffold` | Monorepo, Docker Compose, Caddy, Makefile |
| `phase/02-kb-extraction` | Decision tree extraction from legacy JS |
| `phase/03-backend-foundation` | FastAPI, models, rule engine |
| `phase/04-security-stack` | CSRF, CORS, rate limiting, PII redaction |
| `phase/05-agent-harness` | Pydantic AI agent, guardrails, SSE |
| `phase/06-fe-scaffold` | Next.js 15, styled-components SSR, landing page |
| `phase/07-fe-quick-form` | Quick Form stepper |
| `phase/08-fe-agent-chat` | Talk-to-Agent chat UI |
| `phase/09-polish-docs` | Final polish, docs |

Each branch is clean and self-contained. See `DECISIONS.md` for the full architectural reasoning.

---

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | Next.js 15, React 19 | App Router, RSC, streaming SSR |
| Styling | styled-components v6 | Deep expertise; SSR registry in App Router |
| Agent Framework | Pydantic AI | Type-safe tools, TestModel, structured output |
| Backend | FastAPI, Pydantic v2 | Async-native, free OpenAPI, ergonomic with Pydantic AI |
| ORM | SQLModel + Alembic | Pydantic models ↔ SQLAlchemy, zero-config migrations |
| Database | SQLite → Postgres | Zero-ops demo; one-line swap |
| Proxy | Caddy | Auto-TLS, reverse proxy, security headers |
| Containerisation | Docker Compose | Multi-stage distroless builds |
| Python deps | uv | Fast, reproducible |
| Node deps | pnpm | Fast, space-efficient |
| Linting | Biome (TS/JS), ruff + mypy (Python) | Single-tool, fast |
| Testing | pytest, node:test, Playwright (e2e) | Native, zero extra deps |

---

## Architectural Decisions

All major decisions are documented with alternatives and trade-offs in **`DECISIONS.md`**.

---

## License

MIT — see `LICENSE`.
