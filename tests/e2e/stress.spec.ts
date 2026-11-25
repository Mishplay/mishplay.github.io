import { test, expect, type Page } from '@playwright/test'
import { mockApi } from './mocks'

// ROOT-CAUSE GUARD. On a phone, ONE element wider than the screen makes Chrome enlarge the layout viewport, which rescales the
// whole page and every position:fixed overlay (splash, welcome, nav). So the true assertion is innerWidth === screen width on
// EVERY screen, with realistic long names, including while the welcome overlay is still covering Home.
const PHONES = [[320, 640], [360, 800], [375, 812], [390, 844], [412, 915], [430, 932]] as const

async function expectScale(page: Page, w: number, where: string) {
  await page.waitForTimeout(350)
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const culprits = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => {
      if (el.closest('.hide-scroll, [data-testid=pitch]')) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.right > vw + 1
    }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}[${String(el.className).slice(0, 50)}] right=${Math.round(el.getBoundingClientRect().right)}`)
    return { innerW: innerWidth, scale: visualViewport!.scale, scrollW: document.documentElement.scrollWidth, vw, culprits }
  })
  expect(m.innerW, `${where}: layout viewport was enlarged (culprits: ${m.culprits.join(' | ')})`).toBe(w)
  expect(m.scale).toBe(1)
  expect(m.scrollW, `${where}: page wider than screen`).toBeLessThanOrEqual(w)
}

for (const [w, h] of PHONES) {
  test.describe(`${w}x${h} long-name stress`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
    test.beforeEach(async ({ context }) => { await mockApi(context, { stress: true }) })

    test('every screen keeps the layout viewport at screen width', async ({ page }) => {
      await page.goto('/')
      await page.waitForTimeout(1500)
      await expectScale(page, w, 'splash/welcome overlay over loading Home')
      await page.getByRole('button', { name: 'Skip' }).click()
      await page.getByRole('button', { name: 'Yesterday' }).click()
      await expect(page.getByRole('region', { name: 'Premier League' })).toBeVisible()
      await expectScale(page, w, 'home')
      await page.getByRole('link', { name: /Real Racing Club.* vs Wolverhampton/ }).click()
      await expect(page.getByText('FULL TIME').first()).toBeVisible(); await expectScale(page, w, 'match overview')
      await page.getByRole('tab', { name: 'Lineups' }).click(); await page.waitForTimeout(900); await expectScale(page, w, 'lineups')
      await page.getByRole('button', { name: /Haaaa/ }).click(); await expectScale(page, w, 'player sheet'); await page.keyboard.press('Escape')
      await page.getByRole('tab', { name: 'Timeline' }).click(); await expectScale(page, w, 'timeline')
      await page.getByRole('tab', { name: 'Stats' }).click(); await expectScale(page, w, 'stats')
      for (const star of await page.getByRole('button', { name: /^Favourite / }).all()) await star.click()   // long club names into Favourites
      await page.goto('/league/eng.1'); await page.getByRole('button', { name: 'Yesterday' }).click(); await expect(page.getByRole('link', { name: / vs / }).first()).toBeVisible(); await expectScale(page, w, 'league matches')
      for (const path of ['/favourites', '/discover', '/settings']) { await page.goto(path); await expectScale(page, w, path) }
    })
  })
}
