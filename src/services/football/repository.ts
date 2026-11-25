import { getJson } from './http'
import { mergeMatches } from './identity'
import { configFor } from './competitions'
import { espnProvider } from './providers/espn'
import { openfootballProvider } from './providers/openfootball'
import { openligadbProvider } from './providers/openligadb'
import type { FootballProvider, Match, MatchDetail, SourceId, Standings } from './types'
import { getSettings } from '../../app/settings'

const PROVIDERS: Record<SourceId, FootballProvider | undefined> = {
  espn: espnProvider, openfootball: openfootballProvider, openligadb: openligadbProvider, tsdb: undefined,
}

export interface ProviderReport { source: SourceId; ok: boolean; count?: number; error?: string }
export const lastReports = new Map<string, ProviderReport[]>()

function active(competitionId: string): FootballProvider[] {
  const cfg = configFor(competitionId)
  const ids: SourceId[] = cfg?.sources ?? ['espn']
  const s = getSettings()
  return ids.filter((id) => (id === 'espn' ? s.espnEnabled : true)).map((id) => PROVIDERS[id]).filter(Boolean) as FootballProvider[]
}

/** Live-capable sources. openfootball is schedule-only and is used ONLY when none of these answered. */
const PRIMARY: SourceId[] = ['espn', 'openligadb']

/**
 * Query sources in tiers. Primary (live) sources run in parallel and merge. The schedule-only fallback is used
 * only when every primary source failed, so users never see contradictory duplicates beside live data.
 */
export async function fetchMatches(competitionId: string, dateYmd: string, signal?: AbortSignal): Promise<Match[]> {
  const ps = active(competitionId)
  const primary = ps.filter((p) => PRIMARY.includes(p.id)), fallback = ps.filter((p) => !PRIMARY.includes(p.id))
  const run = (list: FootballProvider[]) => Promise.allSettled(list.map((p) => p.matches!(competitionId, dateYmd, signal)))
  const report = (list: FootballProvider[], rs: PromiseSettledResult<Match[]>[]): ProviderReport[] => rs.map((r, i) =>
    r.status === 'fulfilled' ? { source: list[i].id, ok: true, count: r.value.length } : { source: list[i].id, ok: false, error: String((r.reason as Error)?.message ?? r.reason) })
  const pr = await run(primary)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const reports = report(primary, pr)
  let lists = pr.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (!lists.length && fallback.length) {
    const fr = await run(fallback)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    reports.push(...report(fallback, fr))
    lists = fr.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  }
  lastReports.set(`${competitionId}|${dateYmd}`, reports)
  if (!lists.length) throw new Error(reports.map((r) => `${r.source}: ${r.error}`).join('; ') || 'No data source available')
  return mergeMatches(lists)
}

/** Sources that failed for a competition on the given days (for a visible "partial data" notice). */
export function degradedSources(competitionId: string): { failed: SourceId[]; fallbackOnly: boolean } {
  const rs = [...lastReports.entries()].filter(([k]) => k.startsWith(competitionId + '|')).flatMap(([, v]) => v)
  const failed = [...new Set(rs.filter((r) => !r.ok).map((r) => r.source))]
  const fallbackOnly = rs.some((r) => r.source === 'openfootball' && r.ok) && !rs.some((r) => PRIMARY.includes(r.source) && r.ok)
  return { failed, fallbackOnly }
}

export async function fetchDetail(match: Match, signal?: AbortSignal): Promise<MatchDetail> {
  const espnId = match.provenance.find((p) => p.source === 'espn')?.sourceId
  if (!espnId || !getSettings().espnEnabled)
    return { matchId: match.id, events: [], stats: [], provenance: match.provenance }
  const d = await espnProvider.matchDetail!(match.competitionId, espnId, signal)
  return { ...d, matchId: match.id, lineups: d.lineups && { ...d.lineups, matchId: match.id } }
}

export async function fetchStandings(competitionId: string, signal?: AbortSignal): Promise<Standings | null> {
  if (!getSettings().espnEnabled) return null
  return espnProvider.standings!(competitionId, signal)
}

export async function resolveCompetitionName(slug: string, signal?: AbortSignal): Promise<string> {
  const d = await getJson<{ leagues?: { name: string }[] }>(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`, signal, 1)
  return d.leagues?.[0]?.name ?? slug
}

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * Matches whose kickoff falls on the given LOCAL calendar day. Providers bucket days differently
 * (and in other timezones), so we also query the neighbouring day on the side the UTC offset pulls toward.
 */
export async function fetchMatchesLocalDay(competitionId: string, localYmd: string, signal?: AbortSignal): Promise<Match[]> {
  const [y, m, d] = localYmd.split('-').map(Number)
  const offsetMin = -new Date(y, m - 1, d, 12).getTimezoneOffset() // minutes ahead of UTC
  const neighbour = new Date(y, m - 1, d + (offsetMin >= 0 ? -1 : 1))
  const days = [localYmd, ymd(neighbour)]
  const lists = await Promise.allSettled(days.map((x) => fetchMatches(competitionId, x, signal)))
  const ok = lists.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (!ok.length) throw (lists[0] as PromiseRejectedResult).reason
  return mergeMatches(ok).filter((x) => ymd(new Date(x.kickoffUtc)) === localYmd)
}
