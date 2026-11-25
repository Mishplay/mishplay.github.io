import { test, expect, type Page } from '@playwright/test'
import { mockApi } from './mocks'

// Every viewport size the product must support. Phones/tablet use touch + mobile emulation.
const SIZES = [
  { w: 360, h: 800, mobile: true }, { w: 375, h: 812, mobile: true }, { w: 390, h: 844, mobile: true },
  { w: 412, h: 915, mobile: true }, { w: 430, h: 932, mobile: true }, { w: 768, h: 1024, mobile: true },
  { w: 800, h: 360, mobile: true }, { w: 915, h: 412, mobile: true }, // landscape phones
  { w: 1366, h: 768, mobile: false },
]
const SHOTS = process.env.SHOTS ? '/private/tmp/claude-501/-Users-basithh-Project-mishfootball/c968a9f3-6729-4e69-808c-e2297a60e7d8/scratchpad' : ''

async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const bad: string[] = []
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      // elements inside a deliberate horizontal scroller are allowed to extend past the viewport
      if (el.closest('.hide-scroll, [data-testid=pitch]')) return
      if (getComputedStyle(el).position === 'fixed' && r.width <= vw + 1) return
      if (r.right > vw + 1 || r.left < -1) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} [${Math.round(r.left)}..${Math.round(r.right)}]`)
    })
    return { scrollW: document.documentElement.scrollWidth, vw, bad: bad.slice(0, 5) }
  })
}
async function smallTargets(page: Page, min = 44) {
  return page.evaluate((min) => [...document.querySelectorAll<HTMLElement>('button, a, [role=tab], input')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && (r.width < min || r.height < min) && getComputedStyle(el).opacity !== '0' })
    .map((el) => `${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`), min)
}

for (const v of SIZES) {
  test.describe(`${v.w}x${v.h}`, () => {
    test.use({ viewport: { width: v.w, height: v.h }, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: v.mobile ? 2 : 1 })
    test.beforeEach(async ({ context }) => { await mockApi(context) })

    test('every screen fits the viewport with no horizontal overflow', async ({ page }) => {
      const report: string[] = []
      const check = async (name: string) => {
        await page.waitForTimeout(500)
        const o = await overflow(page); const t = await smallTargets(page)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/vp-${v.w}-${name}.png` })
        if (t.length) report.push(`  [${name}] small targets: ${t.join(', ')}`)
        expect(o.scrollW, `${name}: page scrolls horizontally`).toBeLessThanOrEqual(o.vw)
        expect(o.bad, `${name}: elements outside viewport`).toEqual([])
      }
      await page.goto('/'); await page.getByRole('button', { name: 'Skip' }).click()
      await page.getByRole('button', { name: 'Yesterday' }).click()
      await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
      await check('home')
      await page.getByRole('link', { name: 'Premier League ›' }).click(); await check('league')
      await page.getByRole('tab', { name: 'Table' }).click(); await check('table')
      await page.goBack(); await page.goBack().catch(() => {})
      await page.goto('/match/eng.1/' + encodeURIComponent('eng.1|2026-11-21|man city|fulham'))
      await expect(page.getByText('FULL TIME').first()).toBeVisible(); await check('match-overview')
      await page.getByRole('tab', { name: 'Lineups' }).click(); await expect(page.getByTestId('pitch')).toBeVisible(); await page.waitForTimeout(900); await check('match-lineups')
      await page.getByRole('button', { name: /Haaland/ }).click(); await check('player-sheet'); await page.keyboard.press('Escape')
      await page.getByRole('tab', { name: 'Timeline' }).click(); await check('match-timeline')
      await page.getByRole('tab', { name: 'Stats' }).click(); await check('match-stats')
      for (const path of ['/discover', '/favourites', '/settings']) { await page.goto(path); await check(path.slice(1)) }
      if (report.length) console.log(`${v.w}x${v.h}\n${report.join('\n')}`)
    })
  })
}
