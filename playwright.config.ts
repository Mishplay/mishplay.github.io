import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', timezoneId: 'UTC', locale: 'en-GB', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run preview -- --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /viewports|updates/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
})
