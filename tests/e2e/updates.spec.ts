import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { startHost } from './helpers/versionServer'
import { fx, json, mockApi } from './mocks'

// Offline-first + user-controlled updates, tested against TWO real builds (v1 and v2) served by a host we can break.
const V1 = 'dist-v1', V2 = 'dist-v2', TAG1 = '1.0.0-A', TAG2 = '1.0.0-B'
test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  for (const [dir, tag] of [[V1, TAG1], [V2, TAG2]]) execSync(`npx vite build --outDir ${dir} --emptyOutDir`, { env: { ...process.env, MISH_BUILD: tag }, stdio: 'pipe' })
})

type Host = Awaited<ReturnType<typeof startHost>>
const hosts: Host[] = []
test.afterEach(async () => { for (const h of hosts.splice(0)) await h.close() })
const host = async (root: string) => { const h = await startHost(root); hosts.push(h); return h }

/** First visit: skip welcome, let the worker install, reload so it controls the page (how a real second launch behaves). */
async function install(page: Page, url: string) {
  await page.goto(url + '/')
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}
const loadYesterday = async (page: Page) => { await page.getByRole('button', { name: 'Yesterday' }).click(); await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible(); await page.waitForTimeout(700) }
const openSettings = (page: Page) => page.getByRole('link', { name: 'Settings' }).click()
const ping = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online')))   // the app's own "connectivity returned → check for update" path
const banner = (page: Page) => page.getByRole('alertdialog', { name: /Update available/ })
const versionRow = (page: Page) => page.getByText(/App version/).locator('..')

async function readyEnv(context: BrowserContext) { await mockApi(context) }

test('A · normal launch: installs, serves from its own cache, shows its version', async ({ context, page }) => {
  await readyEnv(context); const h = await host(V1)
  await install(page, h.url)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await openSettings(page)
  await expect(page.getByText(TAG1)).toBeVisible()
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { scope: r?.scope, state: r?.active?.state, waiting: !!r?.waiting } })
  expect(sw.state).toBe('activated'); expect(sw.waiting).toBe(false)
  const caches = await page.evaluate(() => globalThis.caches.keys())
  expect(caches.some((k) => k.includes('precache'))).toBe(true)
})

test('B · host (Cloudflare) unavailable: a fresh launch still opens from the local cache, no error page', async ({ context, page }) => {
  await readyEnv(context); const h = await host(V1)
  await install(page, h.url); await loadYesterday(page)
  h.setMode('down')                                         // every request now returns a Cloudflare-style 503/1033 page
  for (const path of ['/', '/league/eng.1', '/settings']) {
    const launch = await context.newPage()                  // a cold launch of the installed app
    await launch.goto(h.url + path)
    await expect(launch.getByRole('navigation', { name: 'Primary' }), path).toBeVisible()
    await expect(launch).toHaveTitle('MishPlay')
    expect(await launch.locator('body').innerText()).not.toMatch(/Cloudflare|1033|Error 5/i)
    expect(new URL(launch.url()).hostname).toBe('localhost')
    await launch.close()
  }
})

test('C · no internet: UI and previously fetched data stay available and are labelled as saved', async ({ context, page }) => {
  await readyEnv(context); const h = await host(V1)
  await install(page, h.url); await loadYesterday(page)
  await context.setOffline(true)
  const launch = await context.newPage()
  await launch.goto(h.url + '/')
  await expect(launch.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(launch.getByText(/Offline — showing saved data · last updated/)).toBeVisible()
  await launch.getByRole('button', { name: 'Yesterday' }).click()
  await expect(launch.getByRole('region', { name: 'Premier League' })).toBeVisible()   // from IndexedDB
  await launch.goto(h.url + '/league/eng.1'); await expect(launch.getByRole('navigation', { name: 'Primary' })).toBeVisible()
})

test('C2 · a saved "live" score is never shown as live once offline', async ({ context, page }) => {
  await readyEnv(context)
  const board = JSON.parse(fx('espn_scoreboard.json'))
  board.events[0].status = { clock: 1800, displayClock: "30'", type: { id: '2', name: 'STATUS_FIRST_HALF', state: 'in', completed: false, description: 'First Half' } }
  await context.route(/site\.api\.espn\.com.*eng\.1\/scoreboard/, (r) => r.fulfill(json(JSON.stringify(board))))
  const h = await host(V1)
  await install(page, h.url); await loadYesterday(page)
  await expect(page.getByText(/^LIVE · 30'/)).toBeVisible()                              // fresh data: genuinely live
  await context.setOffline(true)
  const launch = await context.newPage(); await launch.goto(h.url + '/')
  await launch.getByRole('button', { name: 'Yesterday' }).click()
  await expect(launch.getByText(/LAST SCORE ·/).first()).toBeVisible()
  await expect(launch.getByText(/^LIVE/)).toHaveCount(0)
})

test('D · new version deployed: detected in the background, user is notified, nothing changes until they choose; data kept', async ({ context, page }) => {
  await readyEnv(context); const h = await host(V1)
  await install(page, h.url)
  await page.goto(h.url + '/league/eng.1'); await page.getByRole('button', { name: 'Favourite competition' }).click()
  await page.goto(h.url + '/'); await loadYesterday(page)
  h.setRoot(V2)                                            // "deploy" version 2
  await ping(page)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await expect(banner(page)).toContainText('A new version of MishPlay is ready')
  await expect(banner(page)).toContainText('favourites and saved data are kept')
  await page.waitForTimeout(1500)                          // a waiting worker must NOT take over by itself
  await openSettings(page)
  await expect(page.getByText(TAG1)).toBeVisible(); await expect(page.getByText(TAG2)).toHaveCount(0)
  await Promise.all([page.waitForEvent('load'), banner(page).getByRole('button', { name: 'Update now' }).click()])
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await page.goto(h.url + '/settings'); await expect(page.getByText(TAG2)).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mish.settings.v1') ?? '{}').favLeagues)).toContain('eng.1')   // favourites survived
  const idb = await page.evaluate(() => new Promise<number>((res) => { const o = indexedDB.open('mish-football'); o.onsuccess = () => { const t = o.result.transaction('kv'); const c = t.objectStore('kv').count(); c.onsuccess = () => res(c.result) } }))
  expect(idb).toBeGreaterThan(0)                           // football data survived
})

test('E · update postponed: v1 keeps working, no nagging this session, update stays available later', async ({ context, page }) => {
  await readyEnv(context); const h = await host(V1)
  await install(page, h.url); h.setRoot(V2); await ping(page)
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await banner(page).getByRole('button', { name: 'Later' }).click()
  await expect(banner(page)).toHaveCount(0)
  await page.reload(); await page.waitForTimeout(1500)
  await expect(banner(page)).toHaveCount(0)                // not repeated during this session
  await openSettings(page)
  await expect(page.getByText(TAG1)).toBeVisible()        // still the current, working version
  await expect(page.getByText(/update ready/)).toBeVisible()
  const later = await context.newPage(); await later.goto(h.url + '/')   // a later session: the waiting update is still there
  await expect(banner(later)).toBeVisible({ timeout: 20_000 })
  await banner(later).getByRole('button', { name: 'Update now' }).click()
  await later.waitForEvent('load'); await later.goto(h.url + '/settings')
  await expect(later.getByText(TAG2)).toBeVisible()
})

test('F · interrupted update: current version intact, update retried when connectivity returns', async ({ context, page }) => {
  await readyEnv(context); const h = await host(V1)
  await install(page, h.url)
  h.setRoot(V2); h.setMode('assets-down')                 // sw.js(v2) downloads, but its assets fail → the install must fail safely
  await ping(page); await page.waitForTimeout(4000)
  await expect(banner(page)).toHaveCount(0)               // a half-downloaded update is never offered
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await openSettings(page); await expect(page.getByText(TAG1)).toBeVisible()
  expect(await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r?.waiting, installing: !!r?.installing, active: r?.active?.state } })).toEqual({ waiting: false, installing: false, active: 'activated' })
  h.setMode('up'); await ping(page)                       // connectivity returns → retry
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(TAG1)).toBeVisible()        // still v1 until the user decides
  // and the retried update is complete and usable: applying it yields a working v2
  await Promise.all([page.waitForEvent('load'), banner(page).getByRole('button', { name: 'Update now' }).click()])
  await page.goto(h.url + '/settings'); await expect(page.getByText(TAG2)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
})

test('G · first installation with no internet is impossible and the app does not pretend otherwise', async ({ browser }) => {
  const h = await host(V1)
  const ctx = await browser.newContext({ offline: true }); const page = await ctx.newPage()
  await expect(page.goto(h.url + '/')).rejects.toThrow(/ERR_INTERNET_DISCONNECTED|ERR_NETWORK/)   // nothing cached yet: the browser cannot load it
  await ctx.close()
})
