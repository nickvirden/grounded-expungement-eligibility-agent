.PHONY: up down logs lint test e2e seed extract-trees audit format

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

lint:
	pnpm lint
	cd apps/api && uv run ruff check . && uv run mypy .

format:
	pnpm format
	cd apps/api && uv run ruff format .

test:
	cd apps/api && uv run pytest -q
	pnpm test

e2e:
	pnpm e2e

seed:
	cd apps/api && uv run python -m app.scripts.seed_services

extract-trees:
	node scripts/extract_state_tree.mjs

audit:
	cd apps/api && uv run pip-audit
	pnpm audit
