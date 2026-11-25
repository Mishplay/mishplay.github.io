import { test, expect } from '@playwright/test'
import { mockApi } from './mocks'

// The very first frame (before the JS bundle runs), the React splash, the welcome screen and Home must all render
// at normal scale on phones: layout viewport == visual viewport, no pinch-zoom, logo capped relative to the screen.
const PHONES = [[360, 800], [375, 812], [390, 844], [412, 915], [430, 932]] as const

for (const [w, h] of PHONES) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, screen: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
    test.beforeEach(async ({ context }) => { await mockApi(context) })

    test('first frame is correct before any JavaScript runs', async ({ page }) => {
      await page.route(/\/assets\/index-.*\.js/, async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue() })
      await page.goto('/', { waitUntil: 'commit' })
      await expect(page.locator('#boot')).toBeVisible()
      const m = await page.evaluate(() => {
        const logo = document.querySelector('#boot img')!.getBoundingClientRect()
        const de = document.documentElement
        return { logoPct: (logo.width / innerWidth) * 100, bg: getComputedStyle(document.body).backgroundColor, scale: visualViewport!.scale, scrollW: de.scrollWidth, clientW: de.clientWidth, innerW: innerWidth, vvW: visualViewport!.width, metaCount: document.querySelectorAll('meta[name=viewport]').length }
      })
      expect(m.metaCount).toBe(1)
      expect(m.scale).toBe(1)
      expect(m.vvW).toBe(m.innerW)               // visual viewport == layout viewport (nothing is zoomed)
      expect(m.scrollW).toBeLessThanOrEqual(m.clientW)
      expect(m.bg).toBe('rgb(7, 10, 15)')        // dark from the first frame: no white flash
      expect(m.logoPct).toBeLessThanOrEqual(27)  // logo capped at 26vw
    })

    test('React splash, welcome and Home keep normal scale; bottom nav is visible', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('dialog', { name: 'Welcome to MishPlay' })).toBeVisible()
      const welcome = await page.evaluate(() => {
        const logo = document.querySelector('[role=dialog] img')!.getBoundingClientRect()
        return { logoPct: (logo.width / innerWidth) * 100, scale: visualViewport!.scale, scrollW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }
      })
      expect(welcome.scale).toBe(1)
      expect(welcome.scrollW).toBeLessThanOrEqual(welcome.vw)
      expect(welcome.logoPct).toBeLessThanOrEqual(17)
      await page.getByRole('button', { name: 'Skip' }).click()
      const nav = page.getByRole('navigation', { name: 'Primary' })
      await expect(nav).toBeVisible()
      const box = await nav.boundingBox()
      expect(Math.round(box!.y + box!.height)).toBe(h)   // sits on the bottom edge of the screen
      const home = await page.evaluate(() => ({ scale: visualViewport!.scale, scrollW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, root: document.getElementById('root')!.getBoundingClientRect().width }))
      expect(home.scale).toBe(1); expect(home.scrollW).toBeLessThanOrEqual(home.vw); expect(home.root).toBe(w)
    })

    test('diagnostics page reports normal scale', async ({ page }) => {
      await page.goto('/diag.html')
      await expect(page.locator('#verdict')).toHaveClass(/ok/)
      const r = JSON.parse((await page.locator('#raw').textContent())!)
      expect(r.zoom).toBeCloseTo(1, 1); expect(r.innerW).toBe(w); expect(r.rootPx).toBe(16)
    })
  })
}
