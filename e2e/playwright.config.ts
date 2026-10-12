import { defineConfig, devices } from '@playwright/test';
import { webMode } from './webMode';

const isCI = !!process.env.CI;

const webServerByMode = {
  dev: {
    // Next.js dev server pointed at the test API
    command: 'cd ../apps/web && INTERNAL_API_URL=http://localhost:8001 pnpm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  production: {
    // Runs the same server.js layout the Dockerfile runs (see start:standalone).
    // HOSTNAME is explicit because the standalone server binds to process.env.HOSTNAME,
    // which on many machines is the machine name rather than a loopback address.
    // Reuse is always off so a dev server left on port 3000 can never be mistaken for
    // the production build. The build is a prerequisite, and `next build` rewrites .next,
    // so stop any `next dev` running from the same checkout before building.
    command:
      'cd ../apps/web && INTERNAL_API_URL=http://localhost:8001 PORT=3000 HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1 pnpm run start:standalone',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
} as const;

/**
 * Playwright configuration.
 *
 * The `webServer` block starts real services before the test suite runs:
 *   - FastAPI API on port 8001 (using a dedicated test SQLite DB, LLM stubbed via TestModel)
 *   - Next.js web on port 3000 (pointed at the test API)
 *
 * In local dev, `reuseExistingServer: true` lets you pre-start the servers
 * with `make dev` and skip the startup overhead between runs.
 *
 * The web server runs in one of two modes (`E2E_WEB_MODE`, see webMode.ts):
 *   - `dev` (default): `next dev`, whose relaxed CSP differs from production.
 *   - `production`: the standalone build that ships. CI uses this, and
 *     `pnpm e2e:prod` opts in locally. It requires `pnpm --filter web build` first.
 */
export default defineConfig({
  testDir: './tests',
  // Sequential so tests share a clean DB state without race conditions
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // FastAPI on a dedicated test port with ephemeral DB
      // ALLOWED_ORIGINS includes http (no TLS) for local dev/test. The API splits it on
      // commas (app/config.py), so it must be a plain comma-separated list, not JSON.
      // RATE_LIMIT_ENABLED=false: test retries and CI re-runs hit POST /api/intakes from the
      // same shared budget repeatedly, which would otherwise trip the 2/minute limit.
      // SSE_SIGNING_KEY: agent-mode POST /api/intakes 503s without this configured, before
      // the stream route is even reached -- a value here (a throwaway test-only key, not a
      // real secret) is what lets talk-to-agent.spec.ts's happy path mint and verify a
      // token end-to-end.
      command:
        'cd .. && DATABASE_URL=sqlite:///./apps/api/data/test_e2e.db LLM_PROVIDER=testmodel CSRF_SECURE=false RATE_LIMIT_ENABLED=false SSE_SIGNING_KEY=e2e-test-sse-signing-key-32-chars-min ALLOWED_ORIGINS=http://localhost:3000,https://localhost:3000 uv run --directory apps/api uvicorn app.main:app --port 8001',
      url: 'http://localhost:8001/healthz',
      reuseExistingServer: !isCI,
      timeout: 45_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    webServerByMode[webMode],
  ],
});
