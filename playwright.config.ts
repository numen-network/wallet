import { defineConfig, devices } from '@playwright/test'

/**
 * Signing flows are the paths that lose money when they break, and they are the
 * ones manual testing skips. Everything that touches a signature belongs here.
 *
 * A port of its own, since the dev server runs against a real node on 5173 and
 * reuseExistingServer would hand these tests that node instead of the mock.
 * That fails a run at best and passes one against the wrong chain at worst.
 */
const PORT = 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_CHAIN: 'mock' },
  },
})
