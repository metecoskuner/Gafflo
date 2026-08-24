import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['smoke.spec.js', '**/*.test.js'],
  fullyParallel: true,
  reporter: 'list',
  // Seeds one real, throwaway, authenticated Supabase session (see e2e/global-setup.js) so the
  // marketplace suite runs behind the real auth boundary by default. Auth-flow tests
  // (e2e/auth.spec.js) explicitly override storageState to start signed out.
  globalSetup: './e2e/global-setup.js',
  // Cleans up this run's own throwaway identities/data (Stage S) — opt-in via
  // GAFFLO_E2E_CLEANUP_DB_URL/GAFFLO_E2E_CLEANUP_SERVICE_ROLE_KEY; every run works exactly as
  // before with neither set, just skipping cleanup with a logged warning. See
  // e2e/global-teardown.js.
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    storageState: './e2e/.auth/state.json',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    // This suite seeds real, authenticated Supabase sessions (global-setup.js) and asserts
    // against real signed-in behavior — it must not depend on whatever VITE_DEV_BYPASS_AUTH a
    // developer's own .env.local happens to have set for separate manual UI testing, or every
    // frontend-touching spec silently runs as the fake dev-bypass identity instead of the real
    // seeded session (confirmed live: the app rendered RoleSelection under
    // "Signed in as dev-bypass@localhost" instead of the real tenant's property page). Same fix
    // already applied to playwright.smoke.config.js's webServer for the same reason.
    env: { VITE_DEV_BYPASS_AUTH: 'false' },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
