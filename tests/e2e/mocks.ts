import { readFileSync } from 'node:fs'
import type { BrowserContext } from '@playwright/test'

export const fx = (f: string) => readFileSync(`tests/fixtures/${f}`, 'utf8')
const scoreboard = fx('espn_scoreboard.json')   // eng.1, 2026-11-21 (7 finished matches) — real recorded response
const summary = fx('espn_summary.json')         // Man City v Fulham — real recorded response
const MATCH_ID = '401879233'
const empty = JSON.stringify({ leagues: [], events: [] })
export const json = (body: string, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body })

/** Deterministic network: real recorded payloads for the endpoints the app calls. */
/** The recorded API payloads are dated 2026-11-21/22. Pin the page's clock so "Yesterday/Today" always map to them, whatever day the suite runs. */
export const FIXTURE_NOW = new Date('2026-11-22T12:00:00Z')
export const pinClock = (ctx: BrowserContext) => ctx.clock.setFixedTime(FIXTURE_NOW)

/** CORS-enabled test images. Crests are coloured per team id; headshots are silhouettes; ids in `missing` get ESPN's tiny 404 page. */
export const imageHandler = (opts: { noPhotos?: boolean; noCrests?: boolean } = {}) => (r: import('@playwright/test').Route) => {
  const u = r.request().url(); const cors = { 'access-control-allow-origin': '*' }
  if (/headshots/.test(u) ? opts.noPhotos : opts.noCrests) return r.fulfill({ status: 404, contentType: 'text/html', headers: cors, body: '404' })
  if (/headshots/.test(u)) return r.fulfill({ status: 200, contentType: 'image/svg+xml', headers: cors, body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="436" viewBox="0 0 600 436"><circle cx="300" cy="150" r="95" fill="#c9a07a"/><path d="M110 436c0-130 80-190 190-190s190 60 190 190z" fill="#e2e8f0"/></svg>' })
  const id = Number(/(\d+)\.png/.exec(u)?.[1] ?? 0); const hue = (id * 47) % 360
  return r.fulfill({ status: 200, contentType: 'image/svg+xml', headers: cors, body: `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><path d="M60 40h380v230c0 110-90 170-190 200C150 440 60 380 60 270z" fill="hsl(${hue} 70% 48%)" stroke="#fff" stroke-width="14"/><path d="M250 100l36 92 99 6-76 63 25 96-84-54-84 54 25-96-76-63 99-6z" fill="#fff"/></svg>` })
}

/** Adversarial but realistic names (live data has e.g. "Real Racing Club de Santander", "RCD Espanyol de Barcelona"). */
export const stressify = (raw: string) => raw
  .replaceAll('Manchester City', 'Real Racing Club de Santander Sociedad Anonima Deportiva')
  .replaceAll('Fulham', 'Wolverhampton-Wanderers-Football-Club-Limited-Company')
  .replaceAll('Haaland', 'Haaaaaaaaaaaaaaaaaaaaaaaaaland-Papadopoulos-Alexandrou')
  .replaceAll('Rodrigo Muniz', 'Rodrigo-Muniz-Hernandez-Fernandez-Gonzalez-Rodriguez')

export async function mockApi(ctx: BrowserContext, opts: { espnStatus?: number; stress?: boolean } = {}) {
  await pinClock(ctx)
  const S = opts.stress ? stressify : (x: string) => x
  await ctx.route(/site\.api\.espn\.com/, (r) => {
    const u = r.request().url()
    if (opts.espnStatus) return r.fulfill(json('{"error":1}', opts.espnStatus))
    if (u.includes('/summary')) return r.fulfill(json(S(summary)))
    if (u.includes('/standings')) return r.fulfill(json('{}'))
    if (u.includes('/eng.1/scoreboard')) return r.fulfill(json(S(scoreboard)))
    return r.fulfill(json(empty))
  })
  // second source: openfootball lists the SAME Man City v Fulham match → must merge into one card
  await ctx.route(/raw\.githubusercontent\.com\/openfootball/, (r) =>
    r.fulfill(json(JSON.stringify({ name: 'EPL', matches: [{ round: 'Matchday 11', date: '2026-11-21', time: '12:30', team1: 'Manchester City FC', team2: 'Fulham FC', score: { ft: [1, 1] } }] }))))
  await ctx.route(/api\.openligadb\.de/, (r) => r.fulfill(json('[]')))
  await ctx.route(/(a\.espncdn\.com|r2\.thesportsdb\.com|upload\.wikimedia\.org)/, imageHandler())
}


import { existsSync } from 'node:fs'
/** Real ESPN scoreboards captured from a live browser session (10 competitions × 3 days). */
export async function mockLive(ctx: BrowserContext) {
  await pinClock(ctx)
  await ctx.route(/site\.api\.espn\.com.*scoreboard/, (r) => {
    const u = new URL(r.request().url()); const slug = u.pathname.split('/soccer/')[1].split('/')[0]
    const f = `tests/fixtures/live/${slug}_${u.searchParams.get('dates')}.json`
    return r.fulfill(json(existsSync(f) ? readFileSync(f, 'utf8') : empty))
  })
  await ctx.route(/espn\.com.*(standings|summary|teams)|sports\.core\.api/, (r) => r.fulfill(json('{}')))
  await ctx.route(/openligadb|githubusercontent|thesportsdb/, (r) => r.fulfill(json('[]')))
  await ctx.route(/(a\.espncdn\.com|upload\.wikimedia\.org)/, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#334155"/></svg>' }))
}
