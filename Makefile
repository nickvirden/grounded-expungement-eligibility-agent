.PHONY: up down dev logs lint test e2e seed extract-trees audit format migrate

up:
	docker compose up -d

down:
	docker compose down

dev:
	@echo "Starting API and Web in development mode..."
	@(cd apps/api && uv run uvicorn app.main:app --reload --port 8000) &
	@(cd apps/web && INTERNAL_API_URL=http://localhost:8000 pnpm dev) &
	@wait

logs:
	docker compose logs -f

# Applies Alembic migrations to the Compose Postgres. Deliberately separate from
# `make up`: the API never migrates itself on boot, so a bad migration is applied
# only when an operator runs this. `run` starts postgres (and waits for its
# healthcheck) if it isn't already up. `--build` matters: `docker compose run`
# doesn't rebuild by default, so without it, pulling a new migration and
# re-running this would apply the OLD image's migrations against the new code.
migrate:
	docker compose run --rm --build api alembic upgrade head

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
