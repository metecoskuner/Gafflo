import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'smoke.spec.js',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    storageState: { cookies: [], origins: [] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    // This suite specifically asserts real signed-out behavior (the magic-link screen, not
    // dev-bypass's RoleSelection flow) — it must not depend on whatever VITE_DEV_BYPASS_AUTH a
    // developer's own .env.local happens to have set for their separate manual UI testing, or it
    // fails deterministically for anyone who normally runs `npm run dev` with bypass on. Vite env
    // resolution prefers a real process env var over one from a .env file, so this reliably wins.
    env: { VITE_DEV_BYPASS_AUTH: 'false' },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
