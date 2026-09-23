import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/**
 * Playwright configuration.
 *
 * The `webServer` block starts real services before the test suite runs:
 *   - FastAPI API on port 8001 (using a dedicated test SQLite DB, LLM stubbed via TestModel)
 *   - Next.js web on port 3000 (pointed at the test API)
 *
 * In local dev, `reuseExistingServer: true` lets you pre-start the servers
 * with `make dev` and skip the startup overhead between runs.
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
      command:
        'cd .. && DATABASE_URL=sqlite:///./apps/api/data/test_e2e.db LLM_PROVIDER=testmodel CSRF_SECURE=false RATE_LIMIT_ENABLED=false ALLOWED_ORIGINS=http://localhost:3000,https://localhost:3000 uv run --directory apps/api uvicorn app.main:app --port 8001',
      url: 'http://localhost:8001/healthz',
      reuseExistingServer: !isCI,
      timeout: 45_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Next.js dev server pointed at the test API
      command: 'cd ../apps/web && INTERNAL_API_URL=http://localhost:8001 pnpm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !isCI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
