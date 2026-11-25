import { kvGet, kvSet } from '../../services/football/cache/db'

// Licence-gated player portraits. A photo is only ever used when ALL of these hold:
//  1. Wikidata names the person by the provider's exact player id (property P3681 "ESPN FC player ID"): no name guessing;
//  2. that person has a Commons image (P18);
//  3. Commons' own licence metadata says CC0 / public domain / CC BY (free), or CC BY-SA (share-alike: user opt-in only);
//  4. an author is recorded, so the credit can be printed.
// Anything else (missing, unclear, NC/ND, unknown wording) means NO photo. See research/images/LICENSING_APPROACH.md.

export type LicenceClass = 'free' | 'sharealike' | 'rejected'
export interface Credit { title: string; author: string; licence: string; licenceUrl?: string; sourceUrl: string; cls: Exclude<LicenceClass, 'rejected'>; restrictions?: string }
export interface Portrait { url: string; credit: Credit }

const stripHtml = (s?: string) => (s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** Pure: decide from Commons `extmetadata.LicenseShortName`. Unknown wording is rejected ("if the licence is unclear, do not use the image"). */
export function classifyLicence(shortName?: string): LicenceClass {
  const s = (shortName ?? '').trim().toUpperCase()
  if (!s) return 'rejected'
  if (/\b(NC|ND)\b|NONCOMMERCIAL|NODERIV/.test(s.replace(/[-–]/g, ' '))) return 'rejected'
  if (/^CC BY[- ]SA( |$|-)/.test(s)) return 'sharealike'
  if (/^CC0( |$)/.test(s) || /^PUBLIC DOMAIN/.test(s) || /^PD( |$|-)/.test(s)) return 'free'
  if (/^CC BY( |$)/.test(s) && /\d/.test(s)) return 'free'
  return 'rejected'
}

interface ImageInfo { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }
/** Pure: build the credit record + usable URL from a Commons imageinfo entry, or null when anything needed is missing/unclear. */
export function creditFromImageInfo(title: string, ii: ImageInfo | undefined): Portrait | null {
  if (!ii?.thumburl || !ii.extmetadata) return null
  const m = ii.extmetadata, cls = classifyLicence(m.LicenseShortName?.value)
  if (cls === 'rejected') return null
  const author = stripHtml(m.Artist?.value)
  if (!author || /^unknown/i.test(author)) return null
  return { url: ii.thumburl, credit: { title: title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''), author, licence: stripHtml(m.LicenseShortName?.value), licenceUrl: m.LicenseUrl?.value, sourceUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`, cls, restrictions: stripHtml(m.Restrictions?.value) || undefined } }
}

/** One printed line per credit, e.g. "Photo: Bryan Berlin · CC BY-SA 4.0 · Wikimedia Commons". */
export const creditLine = (c: Credit, kind = 'Photo') => `${kind}: ${c.author} · ${c.licence} · Wikimedia Commons`
/** Lines printed on a poster for a set of credits. A share-alike image makes the poster an adaptation, so it must say how it is licensed. */
export function creditLines(credits: { credit: Credit; kind: string }[]): string[] {
  const out = credits.map((c) => creditLine(c.credit, c.kind))
  if (credits.some((c) => c.credit.cls === 'sharealike')) out.push('This poster is licensed CC BY-SA 4.0')
  return out
}

const WD = 'https://www.wikidata.org/w/api.php', COMMONS = 'https://commons.wikimedia.org/w/api.php'
const TTL = 7 * 86_400_000
type Cached = { hit: Portrait | null }

async function api<T>(base: string, params: Record<string, string>, ms = 8000): Promise<T | null> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms)
  try { const r = await fetch(`${base}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`, { signal: ctl.signal }); return r.ok ? ((await r.json()) as T) : null } catch { return null } finally { clearTimeout(t) }
}

/** Looks a player up by the provider's exact id. null = no licence-clean portrait (never an error the poster has to show). Results, including "none", are cached. */
export async function findPortrait(espnId?: string): Promise<Portrait | null> {
  if (!espnId || !/^\d{1,9}$/.test(espnId)) return null
  const key = `portrait|${espnId}`, saved = await kvGet<Cached>(key)
  if (saved && Date.now() - saved.fetchedAt < TTL) return saved.value.hit
  if (!navigator.onLine) return saved?.value.hit ?? null
  const found = await api<{ query?: { search?: { title: string }[] } }>(WD, { action: 'query', list: 'search', srsearch: `haswbstatement:P3681=${espnId}` })
  if (!found) return null                                                     // network trouble: don't cache a "none"
  const q = found.query?.search?.[0]?.title
  let hit: Portrait | null = null
  if (q && /^Q\d+$/.test(q)) {
    const ent = await api<{ entities?: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }> }>(WD, { action: 'wbgetentities', ids: q, props: 'claims' })
    const claims = ent?.entities?.[q]?.claims
    const idOk = !!claims?.P3681?.some((c) => String(c.mainsnak?.datavalue?.value) === espnId)   // exact match, re-verified
    const file = claims?.P18?.[0]?.mainsnak?.datavalue?.value
    if (idOk && typeof file === 'string') {
      const title = `File:${file}`
      const ci = await api<{ query?: { pages?: Record<string, { imageinfo?: ImageInfo[] }> } }>(COMMONS, { action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1000' })
      hit = creditFromImageInfo(title, Object.values(ci?.query?.pages ?? {})[0]?.imageinfo?.[0])
    }
  }
  void kvSet(key, { hit } satisfies Cached)
  return hit
}

/** The bundled background photo (public/share/bg-night.jpg), downscaled from the Commons original. CC0: no conditions; credited anyway. */
export const BG_NIGHT: { url: string; credit: Credit } = {
  url: '/share/bg-night.jpg',
  credit: { title: 'Champasak Stadium during at night', author: 'AddedUpdatePoster', licence: 'CC0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Champasak_Stadium_during_at_night_22Jan2026.jpg', cls: 'free' },
}
