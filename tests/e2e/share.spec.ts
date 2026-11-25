import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fx, json, mockApi, imageHandler } from './mocks'

const SHOTS = process.env.SHOTS_DIR ?? ''
const MATCH_URL = '/match/eng.1/' + encodeURIComponent('eng.1|2026-11-21|man city|fulham')

/** Synthetic datasets (constructed for tests, NOT real matches) built from the real recorded payloads. */
function synthetic(opts: { pens?: [number, number]; hs?: number; as?: number; goals?: [string, string, 'home' | 'away'][]; noMinutes?: boolean; live?: boolean }) {
  const board = JSON.parse(fx('espn_scoreboard.json')), sum = JSON.parse(fx('espn_summary.json'))
  const comps = board.events[0].competitions[0].competitors, hc = sum.header.competitions[0].competitors
  if (opts.hs !== undefined) { comps.find((c: any) => c.homeAway === 'home').score = String(opts.hs); hc.find((c: any) => c.homeAway === 'home').score = String(opts.hs) }
  if (opts.as !== undefined) { comps.find((c: any) => c.homeAway === 'away').score = String(opts.as); hc.find((c: any) => c.homeAway === 'away').score = String(opts.as) }
  if (opts.pens) for (const list of [comps, hc]) { list.find((c: any) => c.homeAway === 'home').shootoutScore = opts.pens[0]; list.find((c: any) => c.homeAway === 'away').shootoutScore = opts.pens[1] }
  if (opts.live) for (const st of [board.events[0].status, sum.header.competitions[0].status]) { st.displayClock = "67'"; st.type = { id: '2', name: 'STATUS_SECOND_HALF', state: 'in', completed: false, description: 'Second Half' } }
  if (opts.goals) {
    const tpl = sum.keyEvents.find((k: any) => k.type?.text === 'Goal')
    const ids = { home: hc.find((c: any) => c.homeAway === 'home').team.id, away: hc.find((c: any) => c.homeAway === 'away').team.id }
    sum.keyEvents = [sum.keyEvents[0], ...opts.goals.map(([player, minute, side]) => ({ ...JSON.parse(JSON.stringify(tpl)), clock: { displayValue: opts.noMinutes ? '' : minute }, team: { id: ids[side] }, participants: [{ athlete: { displayName: player } }] }))]
  }
  return { board: JSON.stringify(board), sum: JSON.stringify(sum) }
}
const HAT = synthetic({ hs: 5, as: 1, goals: [['Erling Haaland', "10'", 'home'], ['Rodrigo Muniz', "20'", 'away'], ['Erling Haaland', "33'", 'home'], ['Phil Foden', "50'", 'home'], ['Erling Haaland', "61'", 'home'], ['Jérémy Doku', "88'", 'home']] })

/** Wikidata (P3681 → P18) and Commons imageinfo, mocked. `mode.v` is the licence Commons reports. */
async function mockPortraits(context: BrowserContext, mode: { v: string }) {
  await context.route(/(www\.wikidata\.org|commons\.wikimedia\.org)\/w\/api\.php/, (r) => {
    const u = new URL(r.request().url()), q = u.searchParams, ok = (o: unknown) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) })
    if (q.get('list') === 'search') { const id = /P3681=(\d+)/.exec(q.get('srsearch') ?? '')?.[1]; return ok({ query: { search: id ? [{ title: `Q${id}` }] : [] } }) }
    if (q.get('action') === 'wbgetentities') { const id = q.get('ids')!.slice(1); return ok({ entities: { [`Q${id}`]: { claims: { P3681: [{ mainsnak: { datavalue: { value: id } } }], P18: [{ mainsnak: { datavalue: { value: 'Test portrait.jpg' } } }] } } } }) }
    return ok({ query: { pages: { 1: { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/test/portrait.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Test_portrait.jpg', extmetadata: { LicenseShortName: { value: mode.v }, Artist: { value: '<a href="//x">Jane Photographer</a>' } } }] } } } })
  })
}
async function setup(context: BrowserContext, ds?: { board: string; sum: string }, img: { noPhotos?: boolean; noCrests?: boolean } = {}) {
  await mockApi(context)
  if (ds) await context.route(/site\.api\.espn\.com/, (r) => { const u = r.request().url(); return u.includes('/summary') ? r.fulfill(json(ds.sum)) : u.includes('/eng.1/scoreboard') ? r.fulfill(json(ds.board)) : u.includes('/standings') ? r.fulfill(json('{}')) : r.fulfill(json('{"leagues":[],"events":[]}')) })
  if (img.noPhotos || img.noCrests) await context.route(/a\.espncdn\.com|wikimedia/, imageHandler(img))
}
async function openEditor(page: Page, ds?: { board: string; sum: string }) {
  await page.addInitScript(() => { (window as any).__mishShareDebug = { texts: [], meta: {} } })
  await page.goto('/'); await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Yesterday' }).click()
  const detailLoaded = page.waitForResponse((r) => r.url().includes('/summary'))
  await page.getByRole('link', { name: / vs / }).filter({ hasText: /Fulham|Wolverhampton/ }).first().click()
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible(); await detailLoaded; await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Share image' }).click()
  await expect(page.getByTestId('share-canvas')).toBeVisible()
  await settle(page)
}
const settle = async (page: Page) => { await page.waitForTimeout(500) }
import { stressify } from './mocks'
const stressifyJson = (raw: string) => stressify(raw)
const dbg = (page: Page) => page.evaluate(() => (window as any).__mishShareDebug as { texts: { t: string; x: number; y: number; w: number; h: number }[]; meta: any })
const dims = (page: Page) => page.getByTestId('share-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height])
const allText = async (page: Page) => (await dbg(page)).texts.map((t) => t.t).join(' | ')
/** scorer name and minutes are drawn as two runs (name, then muted minutes): compare them as one visual line */
const flat = async (page: Page) => (await allText(page)).replace(/ \| /g, ' ')
const png = (b: Buffer) => ({ ok: b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), w: b.readUInt32BE(16), h: b.readUInt32BE(20) })
async function save(page: Page, name: string) { const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save image' }).click()]); const p = await dl.path(); const buf = readFileSync(p!); if (SHOTS) await dl.saveAs(`${SHOTS}/${name}.png`); return { name: dl.suggestedFilename(), ...png(buf), size: buf.length } }

/** Layout contract every poster must satisfy (design system): inside Instagram's safe area, inside the 96px side margins, nothing colliding. */
type TB = { t: string; x: number; y: number; w: number; h: number }
const SAFE: Record<string, [number, number]> = { Story: [270, 1620], 'Post 4:5': [120, 1230] }
function layoutProblems(texts: TB[], fmt: string): string[] {
  const out: string[] = []; const [top, bottom] = SAFE[fmt]
  for (const k of texts) {
    if (k.y < top - 3) out.push(`"${k.t}" above safe top (${Math.round(k.y)} < ${top})`)
    if (k.y + k.h > bottom + 3) out.push(`"${k.t}" below safe bottom (${Math.round(k.y + k.h)} > ${bottom})`)
    if (k.x < 96 - 3) out.push(`"${k.t}" inside left margin (${Math.round(k.x)})`)
    if (k.x + k.w > 984 + 3) out.push(`"${k.t}" inside right margin (${Math.round(k.x + k.w)})`)
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j], s = 8
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) - s, oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) - s
    if (ox > 0 && oy > 0) out.push(`"${a.t}" collides with "${b.t}"`)
  }
  return out
}

test.describe('share poster system', () => {
  test('real match: every template × format is exactly Instagram-sized and obeys the layout contract', async ({ context, page }) => {
    await setup(context); await openEditor(page)
    const sizes: Record<string, [number, number]> = { Story: [1080, 1920], 'Post 4:5': [1080, 1350] }
    for (const [fmt, [w, h]] of Object.entries(sizes)) {
      await page.getByRole('button', { name: fmt, exact: true }).click()
      for (const tpl of ['Result', 'Scorers', 'Fan']) {
        await page.getByRole('button', { name: tpl, exact: true }).click(); await settle(page)
        expect(await dims(page), `${tpl} ${fmt}`).toEqual([w, h])
        const d = await dbg(page), joined = d.texts.map((x) => x.t).join(' | ')
        expect(joined, `${tpl} ${fmt}: no undefined/NaN`).not.toMatch(/undefined|NaN|null/)
        expect(layoutProblems(d.texts, fmt), `${tpl} ${fmt}`).toEqual([])
        expect(joined).toContain('MANCHESTER CITY'.slice(0, 3) === 'MAN' ? (tpl === 'Fan' ? 'I SUPPORT' : 'MANCHESTER') : '')
        if (tpl === 'Scorers') { const f = joined.replace(/ \| /g, ' '); expect(f).toContain("16' MUNIZ"); expect(f).toContain("57' ANDERSON") }
        expect(joined).not.toContain('PENALTIES')
        if (tpl !== 'Fan') expect(joined).toContain('FULL TIME')
        if (SHOTS) await save(page, `v2-match-${tpl.toLowerCase()}-${fmt.split(' ')[0].toLowerCase()}`)
      }
    }
  })

  test('5–1 with a hat-trick (synthetic): every scorer shown, calm spacing, no collisions', async ({ context, page }) => {
    await setup(context, HAT); await openEditor(page, HAT)
    await page.getByRole('button', { name: 'Scorers', exact: true }).click(); await settle(page)
    const t = await flat(page)
    expect(t).toContain("10' 33' 61' HAALAND"); expect(t).toContain("50' FODEN"); expect(t).toContain("88' DOKU"); expect(t).toContain("20' MUNIZ")
    expect(t).not.toContain('unavailable'); expect(t).not.toMatch(/\+\d+ more/)
    for (const fmt of ['Story', 'Post 4:5']) {
      await page.getByRole('button', { name: fmt, exact: true }).click(); await settle(page)
      expect(layoutProblems((await dbg(page)).texts, fmt), `5-1 ${fmt}`).toEqual([])
      if (SHOTS) await save(page, `v2-hat-scorers-${fmt.split(' ')[0].toLowerCase()}`)
    }
    await page.getByRole('button', { name: 'Fan', exact: true }).click(); await settle(page)
    expect(await allText(page)).toMatch(/WIN\s+5–1/)
    await page.getByRole('tab', { name: 'Player' }).click()
    await page.getByRole('group', { name: 'Choose player' }).getByRole('button', { name: /Haaland/ }).click(); await settle(page)
    const pt = await allText(page)
    expect(pt).toContain('HAT-TRICK'); expect(pt).toContain('HAALAND'); expect(pt).toContain('ERLING'); expect(pt).toMatch(/10'\s+33'\s+61'/)
    await expect(page.getByRole('group', { name: 'Headline' }).getByRole('button', { name: 'Most goals' })).toBeVisible()
    await page.getByRole('group', { name: 'Headline' }).getByRole('button', { name: 'Player of the match' }).click(); await settle(page)
    expect(await allText(page)).toContain('PLAYER OF THE MATCH')
    await expect(page.getByText(/doesn't confirm a Player of the Match/)).toBeVisible()
    for (const fmt of ['Story', 'Post 4:5']) { await page.getByRole('button', { name: fmt, exact: true }).click(); await settle(page); expect(layoutProblems((await dbg(page)).texts, fmt), `spotlight ${fmt}`).toEqual([]); if (SHOTS) await save(page, `v2-spotlight-photo-${fmt.split(' ')[0].toLowerCase()}`) }
  })

  test('long names + multiple scorers still fit (adversarial real-world names)', async ({ context, page }) => {
    const long = { board: HAT.board, sum: HAT.sum }
    const ds = { board: stressifyJson(long.board), sum: stressifyJson(long.sum) }
    await setup(context, ds); await page.addInitScript(() => { (window as any).__mishShareDebug = { texts: [], meta: {} } })
    await page.goto('/'); await page.getByRole('button', { name: 'Skip' }).click(); await page.getByRole('button', { name: 'Yesterday' }).click()
    const detailLoaded = page.waitForResponse((r) => r.url().includes('/summary'))
    await page.getByRole('link', { name: / vs / }).filter({ hasText: /Wolverhampton|Real Racing/ }).first().click(); await detailLoaded; await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Share image' }).click(); await expect(page.getByTestId('share-canvas')).toBeVisible(); await settle(page)
    for (const fmt of ['Story', 'Post 4:5']) {
      await page.getByRole('button', { name: fmt, exact: true }).click()
      for (const tpl of ['Result', 'Scorers', 'Fan']) { await page.getByRole('button', { name: tpl, exact: true }).click(); await settle(page); expect(layoutProblems((await dbg(page)).texts, fmt), `${tpl} ${fmt} long names`).toEqual([]); if (SHOTS) await save(page, `v2-long-${tpl.toLowerCase()}-${fmt.split(' ')[0].toLowerCase()}`) }
    }
  })

  test('no player photos and no crests: intentional typography-led fallbacks, never broken images', async ({ context, page }) => {
    await setup(context, HAT, { noPhotos: true, noCrests: true }); await openEditor(page, HAT)
    expect((await dbg(page)).meta.crests).toEqual(['fallback', 'fallback'])
    await page.getByRole('tab', { name: 'Player' }).click(); await settle(page)
    const d = await dbg(page)
    expect(d.meta.photo).toBe('fallback'); expect(d.meta.crests.every((c: string) => c === 'fallback')).toBe(true)
    const j = d.texts.map((x) => x.t).join(' | ')
    expect(j).toContain('HAALAND'); expect(j).toContain('GOALS'); expect(j).not.toMatch(/undefined|NaN/)
    expect(d.meta.backdrop).toBe('atmosphere')
    for (const fmt of ['Story', 'Post 4:5']) { await page.getByRole('button', { name: fmt, exact: true }).click(); await settle(page); expect(layoutProblems((await dbg(page)).texts, fmt), `no-photo ${fmt}`).toEqual([]); if (SHOTS) await save(page, `v2-nophoto-${fmt.split(' ')[0].toLowerCase()}`) }
    await expect(page.getByText(/No (openly licensed|verified) photo/)).toBeVisible()
  })

  test('player photos: never from the provider; only licence-clean portraits, credited; share-alike is opt-in and labelled', async ({ context, page }) => {
    const seen: string[] = []
    await setup(context)
    // every photo request the page makes must avoid ESPN headshots
    await context.route(/a\.espncdn\.com\/i\/headshots/, (r) => { seen.push(r.request().url()); return r.abort() })
    const mode = { v: 'CC BY 4.0' }
    await mockPortraits(context, mode)
    await openEditor(page)
    await page.getByRole('tab', { name: 'Player' }).click()
    const pick = async (n: RegExp) => { await page.getByRole('group', { name: 'Choose player' }).getByRole('button', { name: n }).click(); await settle(page) }
    await pick(/Bassey/); await expect(page.getByRole('button', { name: 'Use photo' })).toBeVisible()
    let d = await dbg(page)
    expect(d.meta.photo).toMatch(/network|memory|idb/); expect(d.meta.backdrop).toBe('portrait-blur')
    expect(d.texts.map((t) => t.t)).toContain('Photo: Jane Photographer · CC BY 4.0 · Wikimedia Commons')
    expect(d.texts.map((t) => t.t).join('|')).not.toContain('licensed CC BY-SA')
    if (SHOTS) { await save(page, 'v3-spotlight-portrait-story'); await page.getByRole('button', { name: 'Post 4:5', exact: true }).click(); await settle(page); expect(layoutProblems((await dbg(page)).texts, 'Post 4:5')).toEqual([]); await save(page, 'v3-spotlight-portrait-post'); await page.getByRole('button', { name: 'Story', exact: true }).click(); await settle(page) }
    expect(layoutProblems((await dbg(page)).texts, 'Story')).toEqual([])
    await page.getByRole('button', { name: 'Use photo' }).click(); await settle(page)       // user can turn it off
    expect((await dbg(page)).meta.photo).toBe('fallback')
    expect(seen, 'ESPN headshots are never requested for posters').toEqual([])
  })

  test('licence gate in the editor: share-alike off by default, labelled when on; unclear licence = no photo', async ({ context, page }) => {
    const mode = { v: 'CC BY-SA 4.0' }
    await setup(context); await mockPortraits(context, mode); await openEditor(page)
    await page.getByRole('tab', { name: 'Player' }).click()
    await page.getByRole('group', { name: 'Choose player' }).getByRole('button', { name: /Bassey/ }).click(); await settle(page)
    await expect(page.getByRole('button', { name: 'Use CC BY-SA photo' })).toBeVisible()
    expect((await dbg(page)).meta.photo).toBe('fallback')                                    // never on by default
    await page.getByRole('button', { name: 'Use CC BY-SA photo' }).click(); await settle(page)
    const d = await dbg(page), t = d.texts.map((x) => x.t)
    expect(d.meta.photo).toMatch(/network|memory|idb/); expect(t).toContain('Photo: Jane Photographer · CC BY-SA 4.0 · Wikimedia Commons'); expect(t).toContain('This poster is licensed CC BY-SA 4.0')
    expect(layoutProblems(d.texts, 'Story')).toEqual([])
    if (SHOTS) await save(page, 'v3-spotlight-portrait-sa-story')
    // unclear / non-commercial licence → the poster never uses it and the UI offers no photo
    mode.v = 'CC BY-NC 4.0'
    await page.getByRole('group', { name: 'Choose player' }).getByRole('button', { name: /Foden/ }).click(); await settle(page)
    await expect(page.getByRole('button', { name: /Use (CC BY-SA )?photo/ })).toHaveCount(0)
  })

  test('background: brand glow by default; the credited stadium photo on request, blurred, with its credit printed', async ({ context, page }) => {
    await setup(context, HAT); await openEditor(page, HAT)
    expect((await dbg(page)).meta.backdrop).toBe('atmosphere')
    await page.getByRole('button', { name: 'Scorers', exact: true }).click()
    await page.getByRole('group', { name: 'Background' }).getByRole('button', { name: 'Stadium night' }).click(); await settle(page)
    const d = await dbg(page)
    expect(d.meta.backdrop).toBe('photo-blur'); expect(d.texts.map((t) => t.t)).toContain('Background: AddedUpdatePoster · CC0 · Wikimedia Commons')
    for (const fmt of ['Story', 'Post 4:5']) { await page.getByRole('button', { name: fmt, exact: true }).click(); await settle(page); expect(layoutProblems((await dbg(page)).texts, fmt), `photo bg ${fmt}`).toEqual([]); if (SHOTS) await save(page, `v3-hat-photo-${fmt.split(' ')[0].toLowerCase()}`) }
  })

  test('penalty shoot-out (synthetic 3–3, 4–2 on penalties): shown only when it happened; fan card is not a "draw"', async ({ context, page }) => {
    const ds = synthetic({ hs: 3, as: 3, pens: [4, 2], goals: [['Erling Haaland', "10'", 'home'], ['Rodrigo Muniz', "20'", 'away'], ['Phil Foden', "33'", 'home'], ['Rodrigo Muniz', "50'", 'away'], ['Jérémy Doku', "88'", 'home'], ['Rodrigo Muniz', "90'+4'", 'away']] })
    await setup(context, ds); await openEditor(page, ds)
    for (const fmt of ['Story', 'Post 4:5']) {
      await page.getByRole('button', { name: fmt, exact: true }).click()
      for (const tpl of ['Result', 'Scorers']) {
        await page.getByRole('button', { name: tpl, exact: true }).click(); await settle(page)
        const d = await dbg(page), t = d.texts.map((x) => x.t)
        expect(t).toContain('PENALTIES'); expect(t).toContain('4–2'); expect(layoutProblems(d.texts, fmt), `pens ${tpl} ${fmt}`).toEqual([])
        if (SHOTS) await save(page, `v4-pens-${tpl.toLowerCase()}-${fmt.split(' ')[0].toLowerCase()}`)
      }
    }
    await page.getByRole('button', { name: 'Fan', exact: true }).click(); await settle(page)
    expect(await allText(page)).toMatch(/WIN ON PENS\s+3–3 \(4–2\)/)
  })

  test('missing goal minutes: scorers kept, minutes omitted, nothing invented', async ({ context, page }) => {
    const ds = synthetic({ hs: 2, as: 0, goals: [['Erling Haaland', '', 'home'], ['Erling Haaland', '', 'home']], noMinutes: true })
    await setup(context, ds); await openEditor(page, ds)
    await page.getByRole('button', { name: 'Scorers', exact: true }).click(); await settle(page)
    const t = await flat(page)
    expect(t).toMatch(/HAALAND ×2/); expect(t).not.toMatch(/\d+' HAALAND/); expect(t).not.toMatch(/undefined|NaN/)
  })

  test('live vs final: status is explicit, a live card is a labelled snapshot', async ({ context, page }) => {
    const live = synthetic({ hs: 1, as: 0, live: true, goals: [['Erling Haaland', "30'", 'home']] })
    await setup(context, live); await openEditor(page, live)
    const t = await allText(page)
    expect(t).toContain("LIVE · 67'"); expect(t).toMatch(/SCORE AT \d/); expect(t).not.toContain('FULL TIME')
    await expect(page.getByText(/snapshot, so it is labelled LIVE/)).toBeVisible()
    await page.getByRole('button', { name: 'Fan', exact: true }).click(); await settle(page)
    const f = await allText(page); expect(f).toMatch(/LIVE\s+1–0/); expect(f).not.toMatch(/WIN|DEFEAT/)   // never a result word while live
  })

  test('download: a real PNG at exact size for each format, with a clear file name', async ({ context, page }) => {
    await setup(context); await openEditor(page)
    for (const [fmt, w, h, suffix] of [['Story', 1080, 1920, 'story'], ['Post 4:5', 1080, 1350, 'post']] as const) {
      await page.getByRole('button', { name: fmt, exact: true }).click(); await settle(page)
      const f = await save(page, `dl-${suffix}`)
      expect(f.ok).toBe(true); expect([f.w, f.h]).toEqual([w, h]); expect(f.size).toBeGreaterThan(20_000)
      expect(f.name).toMatch(new RegExp(`^mishplay-manchester-city-1-1-fulham-${suffix}\\.png$`))
    }
    await expect(page.getByText(/Image saved/)).toBeVisible()
  })

  test('native share: shares a real PNG file when the browser supports it; cancel is not an error', async ({ context, page }) => {
    await page.addInitScript(() => {
      (window as any).__shared = []
      Object.defineProperty(navigator, 'canShare', { value: (d: any) => !!d?.files?.length && d.files.every((f: File) => f.type === 'image/png'), configurable: true })
      Object.defineProperty(navigator, 'share', { value: async (d: any) => { const f = d.files[0]; (window as any).__shared.push({ name: f.name, type: f.type, size: f.size, title: d.title, text: d.text }); if ((window as any).__cancel) throw new DOMException('cancel', 'AbortError') }, configurable: true })
    })
    await setup(context); await openEditor(page)
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1)
    const s = (await page.evaluate(() => (window as any).__shared))[0]
    expect(s.type).toBe('image/png'); expect(s.size).toBeGreaterThan(20_000); expect(s.name).toMatch(/^mishplay-.*-story\.png$/); expect(s.text).toContain('Manchester City 1–1 Fulham')
    await expect(page.getByText('Shared.')).toBeVisible()
    await page.evaluate(() => { (window as any).__cancel = true })
    await page.getByRole('button', { name: 'Share', exact: true }).click(); await settle(page)
    await expect(page.getByText(/didn't work|Couldn't/)).toHaveCount(0)
    await expect(page.getByText(/share sheet/)).toBeVisible()
  })

  test('browser without file sharing: no fake Share button; Save image is primary with an honest explanation', async ({ context, page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }) })
    await setup(context); await openEditor(page)
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save image' })).toBeVisible()
    await expect(page.getByText(/can't share images directly/)).toBeVisible()
  })

  test('entry point: player sheet → player card', async ({ context, page }) => {
    await setup(context); await page.addInitScript(() => { (window as any).__mishShareDebug = { texts: [], meta: {} } })
    await page.goto('/'); await page.getByRole('button', { name: 'Skip' }).click(); await page.getByRole('button', { name: 'Yesterday' }).click()
    await page.getByRole('link', { name: / vs / }).filter({ hasText: /Fulham/ }).first().click()
    await page.getByRole('tab', { name: 'Lineups' }).click(); await page.getByRole('button', { name: /Haaland/ }).click()
    await page.getByRole('button', { name: 'Share player card' }).click()
    await expect(page.getByTestId('share-canvas')).toBeVisible(); await settle(page)
    const t = await allText(page); expect(t).toContain('HAALAND'); expect(t).toContain('ERLING')
    expect((await dbg(page)).meta.kind).toBe('player')
  })

  test('offline: a poster can be generated from cached match data, cached images and the bundled font', async ({ context, page }) => {
    await setup(context); await openEditor(page)
    expect((await dbg(page)).meta.crests).toEqual(['network', 'network'])
    await page.getByRole('button', { name: 'Close' }).click()
    await page.waitForTimeout(600); await context.setOffline(true)
    await page.getByRole('button', { name: 'Share image' }).click(); await expect(page.getByTestId('share-canvas')).toBeVisible(); await settle(page)
    expect((await dbg(page)).meta.crests).toEqual(['idb', 'idb'])
    const f = await save(page, 'v2-offline'); expect(f.ok).toBe(true); expect([f.w, f.h]).toEqual([1080, 1920])
    await context.setOffline(false)
  })

  test('typeface is the bundled Hanken Grotesk (not a fallback) when drawing', async ({ context, page }) => {
    await setup(context); await openEditor(page)
    expect(await page.evaluate(() => document.fonts.check('800 64px "Hanken Grotesk"') && document.fonts.check('500 40px "Hanken Grotesk"'))).toBe(true)
  })

  test('temporary resources are released when the editor closes', async ({ context, page }) => {
    await page.addInitScript(() => { const c = URL.createObjectURL.bind(URL), r = URL.revokeObjectURL.bind(URL); (window as any).__urls = { c: 0, r: 0 }; URL.createObjectURL = (b: any) => { (window as any).__urls.c++; return c(b) }; URL.revokeObjectURL = (u: string) => { (window as any).__urls.r++; return r(u) } })
    await setup(context); await openEditor(page)
    const before = await page.evaluate(() => (window as any).__urls); expect(before.c).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Close' }).click(); await page.waitForTimeout(300)
    const after = await page.evaluate(() => (window as any).__urls); expect(after.r).toBeGreaterThanOrEqual(before.c)
  })
})

test.describe('offline banner never covers controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
  test('Back and Share stay tappable while offline', async ({ context, page }) => {
    await setup(context); await openEditor(page); await page.getByRole('button', { name: 'Close' }).click()
    await context.setOffline(true); await expect(page.getByText(/Offline — showing saved data/)).toBeVisible()
    for (const name of ['Back', 'Share image']) {
      const hit = await page.getByRole('button', { name }).evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === top || el.contains(top) })
      expect(hit, `${name} is covered by something`).toBe(true)
    }
    await context.setOffline(false)
  })
})

test.describe('mobile editor layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
  test('fits the phone: no overflow, preview visible, large tap targets, action bar reachable', async ({ context, page }) => {
    await setup(context, HAT); await openEditor(page, HAT)
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, c = document.querySelector('[data-testid=share-canvas]')!.getBoundingClientRect()
      const small = [...document.querySelectorAll('[role=dialog][aria-label="Share image"] button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) }).map((b) => b.textContent?.trim() || b.getAttribute('aria-label'))
      return { innerW: innerWidth, scrollW: document.documentElement.scrollWidth, vw, canvas: [Math.round(c.left), Math.round(c.right), Math.round(c.top), Math.round(c.bottom)], small, canvasRatio: +(c.width / c.height).toFixed(3) }
    })
    expect(m.innerW).toBe(390); expect(m.scrollW).toBeLessThanOrEqual(390)
    expect(m.canvas[0]).toBeGreaterThanOrEqual(0); expect(m.canvas[1]).toBeLessThanOrEqual(390); expect(m.canvasRatio).toBeCloseTo(9 / 16, 2)
    expect(m.small, 'tap targets under 44px').toEqual([])
    await expect(page.getByRole('button', { name: 'Save image' })).toBeInViewport()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-mobile-390.png` })
  })
})
