import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
