import { test, expect } from '@playwright/test'
import { mockLive } from './mocks'

// Home Dashboard with REAL live data (captured from a real browser), 10 competitions, on true phone emulation.
// Run with the root overflow guard both ON and OFF: Home itself must fit, not merely be clipped by a guard.
const PHONES = [[360, 800], [375, 812], [390, 844], [412, 915], [430, 932]] as const

for (const guard of [true, false]) for (const [w, h] of PHONES) {
  test.describe(`${w}x${h} live Home, root guard ${guard ? 'on' : 'OFF'}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
    test.beforeEach(async ({ context }) => { await mockLive(context) })

    test('dashboard fits the viewport; horizontal scrolling stays inside the decks', async ({ page }) => {
      await page.goto('/'); await page.getByRole('button', { name: 'Skip' }).click()
      await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
      await page.waitForTimeout(2500)
      if (!guard) await page.addStyleTag({ content: 'html,body{overflow-x:visible !important}' })
      const m = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const rect = (el: Element) => el.getBoundingClientRect()
        const offenders = [...document.querySelectorAll('body *')].filter((el) => !el.closest('.hide-scroll') && rect(el).width > 0 && rect(el).right > vw + 1).map((el) => el.tagName + '.' + String((el as HTMLElement).className).slice(0, 40))
        const scrollers = [...document.querySelectorAll('[data-testid=deck-scroller]')]
        window.scrollTo(200, 0)
        return {
          innerW: innerWidth, vw, scrollW: document.documentElement.scrollWidth, scale: visualViewport!.scale, scrollX: window.scrollX,
          root: rect(document.querySelector('[data-testid=home-root]')!).width, offenders,
          decks: scrollers.length, cards: document.querySelectorAll('a[aria-label*=" vs "]').length,
          scrollerBoxes: scrollers.map((s) => [Math.round(rect(s).left), Math.round(rect(s).right), s.scrollWidth > s.clientWidth]),
        }
      })
      expect(m.cards).toBeGreaterThan(10)                       // real, populated data
      expect(m.innerW).toBe(w); expect(m.scale).toBe(1)         // nothing enlarged the layout viewport
      expect(m.scrollW).toBeLessThanOrEqual(w); expect(m.scrollX).toBe(0)
      expect(m.root).toBe(w)                                    // dashboard root == viewport width
      expect(m.offenders, 'elements past the right edge outside deck scrollers').toEqual([])
      for (const [l, r, scrolls] of m.scrollerBoxes) { expect(l).toBe(0); expect(r).toBe(w); expect(scrolls).toBe(true) } // scrolling confined to the decks
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    })

    test('Home → match → back keeps Home intact', async ({ page }) => {
      await page.goto('/'); await page.getByRole('button', { name: 'Skip' }).click()
      await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
      await page.getByRole('link', { name: / vs / }).first().click()
      await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
      expect(await page.evaluate(() => innerWidth)).toBe(w)
      await page.goBack()
      await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
      const back = await page.evaluate(() => ({ innerW: innerWidth, scrollW: document.documentElement.scrollWidth }))
      expect(back.innerW).toBe(w); expect(back.scrollW).toBeLessThanOrEqual(w)
    })
  })
}
