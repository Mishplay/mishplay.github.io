import { test, expect } from '@playwright/test'
// Real network, no mocks. Skipped unless LIVE=1 because live data changes.
test.skip(!process.env.LIVE, 'set LIVE=1 to hit real providers')
test('live smoke: real ESPN data renders with crests', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('link', { name: / vs / }).first()).toBeVisible({ timeout: 40_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-basithh-Project-mishfootball/c968a9f3-6729-4e69-808c-e2297a60e7d8/scratchpad/live-home.png' })
  await page.getByRole('link', { name: / vs / }).first().click()
  await page.getByRole('tab', { name: 'Lineups' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-basithh-Project-mishfootball/c968a9f3-6729-4e69-808c-e2297a60e7d8/scratchpad/live-match.png' })
})
