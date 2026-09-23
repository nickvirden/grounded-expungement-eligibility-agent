## [2.0.0](https://github.com/nickvirden/grounded-expungement-eligibility-agent/compare/v1.0.1...v2.0.0) (2026-09-23)

### ⚠ BREAKING CHANGES

* **api,web:** GET /api/intakes/{id}/stream requires
Authorization: Bearer <stream_token> from POST /api/intakes's response
for agent-mode intakes; re-streaming an already-claimed intake returns
409 (from the replay guard); SSE_SIGNING_KEY (16+ characters) must be
set for Talk-to-Agent to work, though its absence only disables that one
feature rather than the whole API.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

### Features

* **api,web:** require a signed stream token for the intake SSE stream ([ce2a43e](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/ce2a43e2d0b43f14eda5b6df96c78a8d00648631))
* **api:** add a replay guard and a $0-by-default spend cap ([a2bbbfc](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/a2bbbfce50d11a8c63729237cae70b3a12283c8a))
* **api:** fix real-LLM provider construction, keep it opt-in and off ([47c2486](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/47c2486b65cfc3de252265b1b26da45aeb6db10c))
* **api:** rate-limit intake creation and the agent stream ([e2e3577](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/e2e357770c3eaf89cf135fb303468b8efbeee1d1))

### Bug Fixes

* **api:** create a real Intake row before inserting an AgentRun in tests ([b3e4be4](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/b3e4be476cbfb9809426f7a03a81dbdbbae0ba73))

## [1.0.1](https://github.com/nickvirden/grounded-expungement-eligibility-agent/compare/v1.0.0...v1.0.1) (2026-09-23)

### Bug Fixes

* **docs:** correct the backend test count in the README ([06ad219](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/06ad219e82c9dcd8eb89d43b77620680dfe5dbce))

## [0.11.1](https://github.com/nickvirden/grounded-expungement-eligibility-agent/compare/v0.11.0...v0.11.1) (2026-09-23)

### Bug Fixes

* **api:** regenerate uv.lock for the 1.0.0 version bump ([f27acb6](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/f27acb6428c542df1021bb12cdf01efd8390ffb7))

## [0.11.0](https://github.com/nickvirden/grounded-expungement-eligibility-agent/compare/v0.10.0...v0.11.0) (2026-09-23)

### Features

* **api:** make apps/api deployable to Vercel's Python runtime ([f419dbe](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/f419dbeb56b1734a02651651aab04a6b2283bcca))

### Bug Fixes

* **web,api:** complete the DELETE-204 fix end to end, correct stale comments ([56c86ad](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/56c86ade0d4838d91d2a4a0ee2c04c752de1fab8))
* **web,api:** fix Docker CSRF routing, DELETE 204 body, and DB URL scheme ([a4bcf91](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/a4bcf919eb21231526c9d2cc13ab3deb9babce3a))
* **web:** enforce same-origin on server-to-server CSRF-proxy routes ([27a30e9](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/27a30e91daac6b5f2fa51cca632811c0c0a318ad))
* **web:** proxy client-side API calls through a same-origin route ([cad1314](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/cad13141c675e4f01db540d3b87dfc5c84b65cf1))
* **web:** set Permissions-Policy in next.config.ts for the Vercel deploy ([d3d7809](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/d3d780919c6414442e0e898f67e71c845cfd8bce))

## [0.10.0](https://github.com/nickvirden/grounded-expungement-eligibility-agent/compare/v0.9.3...v0.10.0) (2026-09-22)

### Features

* **api:** add Alembic migrations with an initial schema revision ([9405287](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/9405287f7e1c25d12d518e7a0706ad482ad5258f))
* run the Compose deploy on Postgres with an explicit make migrate ([e2ef6ca](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/e2ef6ca835e3e4bac8ba513dd6f4704fc32c22e1))

### Bug Fixes

* **api:** distinguish unreachable/unmigrated/stale-code readyz states ([f7a309e](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/f7a309ed26fc51de4b151a1111ee715fd8ef9abd))
* three real gaps found by the Phase 7 opus verifier ([c2041e7](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/c2041e727f7bbeb450496415fba0f9eca2836502))

## [0.9.3](https://github.com/nickvirden/grounded-expungement-eligibility-agent/compare/v0.9.2...v0.9.3) (2026-09-22)

### Bug Fixes

* **api:** default LLM_PROVIDER to testmodel, fail fast on openai/anthropic ([8c87b6d](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/8c87b6dd679b27eb1e04d1797dde1b6e572ba246))
* **api:** two real gaps found by the opus verifier in the v1 safety default ([c7de054](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/c7de054bae5f86a505ed9515722a569e7ed9be6b))

## [0.9.2](https://github.com/nickvirden/grounded-expungement-eligibility-agent/compare/v0.9.1...v0.9.2) (2026-09-22)

### Bug Fixes

* **api:** collapse nested conditionals, use comprehensions, remove dead code ([7fd2b37](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/7fd2b37e3daf0b58510bf067c5ae385ea2e890fb))
* **api:** correct false justification on the providers.py lint exemption ([b4a9eb5](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/b4a9eb535b1842563903d5933db5b02106552e17))
* **api:** drop unused imports and stale noqa directives, sort imports, modernize typing syntax ([30669fb](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/30669fb3bc02e492f7e7e02e250dc0e08b53dffe))
* **api:** hoist function-local imports to module level ([65a18f8](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/65a18f8019071f20bd1bac468750801ab3ebb94b))
* **api:** resolve logging findings without leaking PII into tracebacks ([96f2b79](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/96f2b79a34972a412cd64d55c917a26be0f48acb))
* **api:** satisfy mypy --strict outside the LLM provider factory ([38275ab](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/38275ab1d93ca3402737af0460cd86a2e778d0cc))
* **api:** scope providers.py's known-broken real-LLM construction out of the gates ([e5d90e5](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/e5d90e5b5db6dd227454c5807d63bf55cadfa769))
* **web:** resolve Biome lint findings ([b8749cb](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/b8749cb6f150fee615613242a53964f53c9ec7bc))

## [0.9.1](https://github.com/nickvirden/grounded-expungement-eligibility-agent/compare/v0.9.0...v0.9.1) (2026-09-22)

### Bug Fixes

* **ci:** drop invalid setup-uv python-version input, format .releaserc.json ([1d3bf64](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/1d3bf64c775b0b8432de1049f56fa135e4f57bb0))
* **ci:** drop pnpm/action-setup's explicit version input ([84b03fa](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/84b03fadf0f056871a417a2993e1958264d1ec07))
* **ci:** harden release.yml with a concurrency group and timeout ([00fc257](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/00fc257666ad80e2d330c7f3dc087c3e9f8c6bad))
* **ci:** pin CI's Python to 3.13, fix misleading "gates the merge" comment, harden workflow ([b7be988](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/b7be988bfb08f76cba87f94840bca05d8cd863b7))
* **docs:** correct README quickstart URLs to match the actual Caddy topology ([9846501](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/98465010cd579b79380464d8354650504f3e1370))
* rebrand in-app product identity from WipeRecord to ClearSlate ([ab28795](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/ab2879572fe7b4ff8ef9dcb65a3860268f3d7be8))
* **shared:** correct schema $id fields to resolvable URLs ([7d9ad67](https://github.com/nickvirden/grounded-expungement-eligibility-agent/commit/7d9ad676ea5f0e69c9f40ad3349493932cf9bed5))
