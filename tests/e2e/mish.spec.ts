import { test, expect, type BrowserContext, type Page } from '@playwright/test'

import { fx, json, mockApi } from './mocks'
const MATCH_ID = '401879233'

async function boot(page: Page, skipWelcome = true) {
  await page.goto('/')
  if (skipWelcome) await page.getByRole('button', { name: 'Skip' }).click()
}
async function openMatch(page: Page) {
  await page.getByRole('button', { name: 'Yesterday' }).click()
  await page.getByRole('link', { name: 'Manchester City vs Fulham' }).click()
}

test.beforeEach(async ({ context }) => { await mockApi(context) })

test('startup: branded splash, then Home with competition decks', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status', { name: 'Loading MishPlay' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Welcome to MishPlay' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await page.getByRole('button', { name: 'Yesterday' }).click()
  await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
})

test('fallback source is never shown beside a live source (no duplicate cards)', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Yesterday' }).click()
  const deck = page.getByRole('region', { name: 'Premier League' })
  await expect(deck.getByRole('link', { name: / vs / })).toHaveCount(7)
  await expect(deck.getByRole('link', { name: 'Manchester City vs Fulham' })).toHaveCount(1)
})

test('date navigation: yesterday / today / tomorrow / calendar', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Yesterday' }).click()
  await expect(page.getByRole('button', { name: 'Yesterday' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await expect(page.getByRole('button', { name: 'Tomorrow' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Today' }).click()
  await page.getByLabel('Choose date').fill('2026-11-21')
  await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
})

test('match centre: overview, interactive lineups, player sheet, timeline, stats', async ({ page, isMobile }) => {
  await boot(page); await openMatch(page)
  await expect(page.getByText('FULL TIME').first()).toBeVisible()
  await expect(page.getByText('Rodrigo Muniz').first()).toBeVisible()               // goalscorer on overview

  await page.getByRole('tab', { name: 'Lineups' }).click()
  await expect(page.getByTestId('pitch')).toBeVisible()
  await expect(page.getByTestId('pitch-player')).toHaveCount(11)
  await page.getByRole('button', { name: /Haaland/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Player details' })
  await expect(sheet).toContainText('Erling Haaland')
  await expect(sheet).toContainText('#9')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  await page.getByRole('tab', { name: 'Fulham' }).click()                          // switch to away formation
  await expect(page.getByText('4-3-3')).toBeVisible()
  await expect(page.getByTestId('pitch-player')).toHaveCount(11)

  await page.getByRole('tab', { name: 'Timeline' }).click()
  await expect(page.getByRole('list', { name: 'Match timeline' })).toContainText('Rodrigo Muniz')
  await page.getByRole('tab', { name: 'Stats' }).click()
  await expect(page.getByText('Possession')).toBeVisible()
  if (isMobile) expect((await page.evaluate(() => document.documentElement.scrollWidth)) <= (await page.evaluate(() => innerWidth))).toBe(true)
})

test('team and player screens come from provider data', async ({ page, context }) => {
  await context.route(/teams\/382\/roster/, (r) => r.fulfill(json(fx('espn_roster.json'))))
  await context.route(/teams\/382\/schedule/, (r) => r.fulfill(json(fx('espn_sched.json'))))
  await context.route(/teams\/382$/, (r) => r.fulfill(json(fx('espn_team.json'))))
  await boot(page); await openMatch(page)
  await page.getByRole('link').filter({ has: page.locator('img, div') }).filter({ hasNot: page.locator('b') }).first().waitFor()
  await page.goto('/team/eng.1/382')
  await expect(page.getByRole('heading', { name: 'Manchester City' })).toBeVisible()
  await expect(page.getByText(/Squad \(\d+\)/)).toBeVisible()
  await page.getByRole('link', { name: /Rulli/ }).click()
  await expect(page.getByRole('heading', { name: /Rulli/ })).toBeVisible()
  await expect(page.getByText('Argentina')).toBeVisible()
})

test('favourites persist across reloads', async ({ page }) => {
  await page.goto('/league/eng.1')
  await page.getByRole('button', { name: 'Skip' }).click()
  const star = page.getByRole('button', { name: 'Favourite competition' })
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Favourite competition' })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/favourites')
  await expect(page.getByText('Premier League')).toBeVisible()
})

test('ESPN failure: falls back to published schedule and says so (no live scores invented)', async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: 'UTC' })
  await mockApi(ctx, { espnStatus: 500 })
  const page = await ctx.newPage()
  await page.goto('/'); await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Yesterday' }).click()
  const deck = page.getByRole('region', { name: 'Premier League' })
  await expect(deck).toContainText('Live data unavailable', { timeout: 40_000 })
  await expect(deck.getByRole('link', { name: /Manchester City.* vs Fulham/ })).toHaveCount(1)
  await expect(deck.getByText(/^LIVE/)).toHaveCount(0)   // never presents schedule data as live
  await ctx.close()
})

test('offline: cached matches stay visible with an offline indicator, then recover', async ({ page, context }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Yesterday' }).click()
  await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
  await page.waitForTimeout(800)                                                   // let IndexedDB writes land
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByText(/Offline — showing saved data/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()  // still shown from memory/IndexedDB
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText(/Offline — showing saved data/)).toBeHidden()
})

test('PWA installability: manifest, icons, service worker', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest'); expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m.display).toBe('standalone'); expect(m.start_url).toBe('/'); expect(m.name).toBe('MishPlay')
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes); expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true)
  await page.goto('/')
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)).toBe(true)
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /viewport-fit=cover/)
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveCount(1)
})
