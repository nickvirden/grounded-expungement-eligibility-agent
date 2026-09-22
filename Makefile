.PHONY: up down dev logs lint test e2e seed extract-trees audit format

up:
	docker compose up -d

down:
	docker compose down

dev:
	@echo "Starting API and Web in development mode..."
	@(cd apps/api && uv run uvicorn app.main:app --reload --port 8000) &
	@(cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:8000 INTERNAL_API_URL=http://localhost:8000 pnpm dev) &
	@wait

logs:
	docker compose logs -f

lint:
	pnpm lint
	cd apps/api && uv run --extra dev ruff check . && uv run --extra dev mypy .

format:
	pnpm format
	cd apps/api && uv run --extra dev ruff format .

test:
	cd apps/api && uv run --extra dev pytest -q
	pnpm test

e2e:
	cd e2e && npx playwright test

e2e-headed:
	cd e2e && npx playwright test --headed

check-styles:
	node scripts/check-no-inline-styles.mjs

seed:
	cd apps/api && uv run python -m app.scripts.seed_services

extract-trees:
	node scripts/extract_state_tree.mjs

audit:
	cd apps/api && uv run --extra dev pip-audit
	pnpm audit
