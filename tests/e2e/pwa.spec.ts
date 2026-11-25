import { test, expect, type Page } from '@playwright/test'
import { mockApi } from './mocks'

// PWA installability + service-worker regression suite (runs against the production build).

type Icon = { src: string; sizes: string; type: string; purpose?: string }

async function skipWelcome(page: Page) {
  await page.getByRole('button', { name: 'Skip' }).click()
}

/** Wait until the service worker is activated AND controlling this page (needs one reload on first visit). */
async function waitForControlled(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

test.beforeEach(async ({ context }) => { await mockApi(context) })

test('manifest: linked, valid JSON, correct MIME type, all required members', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  expect(href).toBeTruthy()
  const res = await request.get(new URL(href!, page.url()).toString())
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/manifest+json')
  const m = await res.json() // throws if invalid JSON
  expect(m.name).toBe('MishPlay')
  expect(m.short_name.length).toBeGreaterThan(0)
  expect(m.short_name.length).toBeLessThanOrEqual(12)
  expect(m.id).toBe('/')
  expect(m.start_url).toBe('/')
  expect(m.scope).toBe('/')
  expect(m.display).toBe('standalone')
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
  expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  expect(m.orientation).toBe('any')
})

test('manifest icons: every icon loads and the PNGs really are the size they declare; maskable present', async ({ page, request }) => {
  await page.goto('/')
  const m = await (await request.get('/manifest.webmanifest')).json()
  const icons: Icon[] = m.icons
  for (const ic of icons) {
    const r = await request.get(ic.src)
    expect(r.status(), ic.src).toBe(200)
    expect(r.headers()['content-type'], ic.src).toContain(ic.type)
    if (ic.type === 'image/png') {
      const b = await r.body()
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20)       // PNG IHDR
      expect(`${w}x${h}`, `${ic.src} actual size`).toBe(ic.sizes)
    }
  }
  const png = (s: string, purpose?: string) => icons.some((i) => i.type === 'image/png' && i.sizes === s && (i.purpose ?? 'any') === (purpose ?? 'any'))
  expect(png('192x192')).toBe(true)
  expect(png('512x512')).toBe(true)
  expect(png('512x512', 'maskable')).toBe(true)
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200) // iOS ignores manifest icons
})

test("Chrome's own installability check reports no errors (localhost)", async ({ page, context }) => {
  await waitForControlled(page)
  const cdp = await context.newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  expect(installabilityErrors, JSON.stringify(installabilityErrors)).toEqual([])
  const { errors } = await cdp.send('Page.getAppManifest')
  expect(errors).toEqual([])
})

test('service worker: registers at scope /, activates, controls the page, no errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/espn|CORS|ERR_FAILED|Failed to load resource/.test(m.text()) && errors.push(m.text()))
  await waitForControlled(page)
  const info = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return { scope: reg?.scope, state: reg?.active?.state, script: reg?.active?.scriptURL, waiting: !!reg?.waiting }
  })
  expect(new URL(info.scope!).pathname).toBe('/')
  expect(info.state).toBe('activated')
  expect(new URL(info.script!).pathname).toBe('/sw.js')
  expect(info.waiting).toBe(false) // no update stuck waiting → no stale/inconsistent state
  expect(errors).toEqual([])
})

test('production build: every same-origin asset loads (no 404s, no failed requests)', async ({ page }) => {
  const bad: string[] = []
  page.on('response', (r) => { if (new URL(r.url()).origin === new URL(page.url() || 'http://localhost:4173').origin && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`) })
  page.on('requestfailed', (r) => { if (r.url().startsWith('http://localhost:4173')) bad.push(`FAILED ${r.url()}`) })
  await page.goto('/'); await skipWelcome(page)
  await page.getByRole('button', { name: 'Yesterday' }).click()
  await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
  expect(bad).toEqual([])
})

test('offline: app shell loads from the service worker, including deep links', async ({ page, context }) => {
  await page.goto('/'); await skipWelcome(page)
  await waitForControlled(page)
  await context.setOffline(true)
  for (const path of ['/', '/league/eng.1', '/settings']) {
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: 'Primary' }), `${path} offline`).toBeVisible()
    await expect(page.locator('#root')).not.toBeEmpty()
  }
  await expect(page.getByText(/Offline — showing saved data/)).toBeVisible()
  await context.setOffline(false)
})

// NOTE: headless Chromium cannot enter real standalone mode, so matchMedia is stubbed. This verifies the app's
// standalone *logic* (no install nag, safe-area layout). Real standalone must be confirmed on a device.
test('standalone logic: install prompt hidden and safe-area layout when display-mode is standalone', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = window.matchMedia.bind(window)
    window.matchMedia = (q: string) => (q.includes('display-mode: standalone') ? ({ ...orig('all'), matches: true, media: q } as MediaQueryList) : orig(q))
  })
  await page.goto('/'); await skipWelcome(page)
  expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true)
  await expect(page.getByText('Install MishPlay')).toHaveCount(0)
  await expect(page.getByText("Can't install from this address")).toHaveCount(0)
  // safe-area aware: viewport-fit=cover and env() insets in use
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /viewport-fit=cover/)
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav).toBeVisible()
  expect(await nav.evaluate((el) => getComputedStyle(el).paddingBottom)).toBeDefined()
})

test('launch URL: manifest start_url opens the Home route inside scope', async ({ page, request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json()
  const start = new URL(m.start_url, 'http://localhost:4173/')
  const scope = new URL(m.scope, 'http://localhost:4173/')
  expect(start.pathname.startsWith(scope.pathname)).toBe(true)
  await page.goto(start.toString())
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  // deep links stay inside the scope as well
  expect(new URL('/match/eng.1/x', scope).pathname.startsWith(scope.pathname)).toBe(true)
})

test('insecure address: explains why install is unavailable instead of failing silently', async ({ page }) => {
  test.skip(!process.env.LAN_URL, 'set LAN_URL=http://<laptop-ip>:4173 to run')
  await page.goto(process.env.LAN_URL!)
  expect(await page.evaluate(() => isSecureContext)).toBe(false)
  expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(false) // why Chrome says "cannot be installed"
  await skipWelcome(page)
  await expect(page.getByText("Can't install from this address")).toBeVisible()
})
