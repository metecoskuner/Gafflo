import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  // Seeds one real, throwaway, authenticated Supabase session (see e2e/global-setup.js) so the
  // marketplace suite runs behind the real auth boundary by default. Auth-flow tests
  // (e2e/auth.spec.js) explicitly override storageState to start signed out.
  globalSetup: './e2e/global-setup.js',
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
