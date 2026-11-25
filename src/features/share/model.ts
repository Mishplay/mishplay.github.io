import type { LineupPlayer, Match, MatchDetail, MatchEvent } from '../../services/football/types'
import { teamKey } from '../../services/football/identity'

// Pure data layer for the share cards. Everything here is derived from data the app already has; nothing is invented.

export type Side = 'home' | 'away'

export interface Scorer { key: string; name: string; side: Side; goals: number; minutes: string[]; ownGoals: number; penalties: number }
export interface PlayerCandidate { key: string; name: string; side: Side; jersey?: string; position?: string; /** provider's player id: the exact key for the licensed-portrait lookup (never a name search) */ espnId?: string; goals: number; minutes: string[]; starter: boolean }

export type StatusKind = 'final' | 'live' | 'halftime' | 'stale' | 'none'
export interface StatusInfo { kind: StatusKind; label: string; note?: string }

export interface ShareData {
  match: Match
  competition?: string
  dateLabel: string
  status: StatusInfo
  /** a result card needs a score from a match that has started */
  hasResult: boolean
  scorers: Scorer[]
  /** false when the goal events don't add up to the score (missing/ambiguous data) so cards can say so instead of implying completeness */
  scorersComplete: boolean
  leader: Side | 'level' | null
  candidates: PlayerCandidate[]
  maxGoals: number
  /** match detail (events/lineups) is still being fetched: don't claim anything is unavailable yet */
  detailPending: boolean
}

const norm = (s: string) => teamKey(s)
/** "Rodrigo Muniz" → { first: "Rodrigo", surname: "Muniz" }; "Virgil van Dijk" → surname "van Dijk"; single names stay whole. */
export function splitName(name: string): { first: string; surname: string } {
  const p = name.trim().split(/\s+/)
  return p.length < 2 ? { first: '', surname: name.trim() } : { first: p[0], surname: p.slice(1).join(' ') }
}
export const candidateKey = (side: Side, name: string) => `${side}|${norm(name)}`
export const minuteValue = (m: string) => { const x = /(\d+)(?:'?\s*\+\s*(\d+))?/.exec(m); return x ? Number(x[1]) + (x[2] ? Number(x[2]) / 100 : 0) : 999 }

export function buildStatus(m: Match, ctx: { asOf?: number; online: boolean; now: number }): StatusInfo {
  const hhmm = new Date(ctx.now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const mins = (ts: number) => Math.max(1, Math.round((ctx.now - ts) / 60000))
  if (m.status === 'finished') return { kind: 'final', label: 'FULL TIME' }
  if (m.status === 'live' || m.status === 'halftime') {
    if (ctx.asOf && (!ctx.online || ctx.now - ctx.asOf > 180_000)) return { kind: 'stale', label: 'LAST SCORE', note: `${mins(ctx.asOf)} min ago · not live` }
    return m.status === 'halftime'
      ? { kind: 'halftime', label: 'HALF TIME', note: `Score at ${hhmm}` }
      : { kind: 'live', label: m.minute ? `LIVE · ${m.minute}` : 'LIVE', note: `Score at ${hhmm}` }
  }
  return { kind: 'none', label: '' }
}

function goalEvents(events: MatchEvent[]) { return events.filter((e) => e.type === 'goal' || e.type === 'penalty-goal' || e.type === 'own-goal') }

export function buildScorers(match: Match, events: MatchEvent[]): { scorers: Scorer[]; complete: boolean } {
  const goals = goalEvents(events).filter((e) => e.player)
  const hs = match.homeScore, as = match.awayScore
  const build = (flipOwn: boolean) => {
    const map = new Map<string, Scorer>()
    for (const e of goals) {
      const own = e.type === 'own-goal'
      const side: Side = (e.team ?? 'home') === 'home' ? (own && flipOwn ? 'away' : 'home') : (own && flipOwn ? 'home' : 'away')
      const key = `${side}|${norm(e.player!)}`
      const s = map.get(key) ?? { key, name: e.player!, side, goals: 0, minutes: [], ownGoals: 0, penalties: 0 }
      s.goals += 1; if (own) s.ownGoals += 1; if (e.type === 'penalty-goal') s.penalties += 1
      if (e.minute) s.minutes.push(e.minute)
      map.set(key, s)
    }
    return [...map.values()]
  }
  const total = (list: Scorer[], side: Side) => list.filter((s) => s.side === side).reduce((n, s) => n + s.goals, 0)
  const fits = (list: Scorer[]) => hs !== undefined && as !== undefined && total(list, 'home') === hs && total(list, 'away') === as
  // ESPN's own-goal team attribution is not documented: pick the reading that reconciles with the score, never guess otherwise
  const a = build(false), b = goals.some((e) => e.type === 'own-goal') ? build(true) : a
  const chosen = fits(a) ? a : fits(b) ? b : a
  const complete = fits(chosen)
  chosen.sort((x, y) => minuteValue(x.minutes[0] ?? '') - minuteValue(y.minutes[0] ?? ''))
  return { scorers: chosen, complete }
}

export function buildCandidates(match: Match, detail: MatchDetail | undefined, scorers: Scorer[]): PlayerCandidate[] {
  const out = new Map<string, PlayerCandidate>()
  const add = (p: LineupPlayer, side: Side) => {
    const key = `${side}|${norm(p.name)}`
    out.set(key, { key, name: p.name, side, jersey: p.jersey, position: p.position, espnId: p.id, goals: 0, minutes: [], starter: p.starter })
  }
  detail?.lineups?.home?.players.forEach((p) => add(p, 'home'))
  detail?.lineups?.away?.players.forEach((p) => add(p, 'away'))
  for (const s of scorers) {
    const c = out.get(s.key) ?? { key: s.key, name: s.name, side: s.side, goals: 0, minutes: [], starter: false }
    // own goals are not "goals scored" by the player for a player card
    c.goals = s.goals - s.ownGoals; c.minutes = s.ownGoals ? [] : s.minutes
    out.set(s.key, c)
  }
  return [...out.values()].sort((a, b) => b.goals - a.goals || Number(b.starter) - Number(a.starter) || Number(a.jersey ?? 99) - Number(b.jersey ?? 99))
}

export function buildShareData(match: Match, detail: MatchDetail | undefined, ctx: { competition?: string; asOf?: number; online: boolean; now?: number; detailPending?: boolean }): ShareData {
  const now = ctx.now ?? Date.now()
  const status = buildStatus(match, { asOf: ctx.asOf, online: ctx.online, now })
  const hasResult = status.kind !== 'none' && match.homeScore !== undefined && match.awayScore !== undefined
  const { scorers, complete } = buildScorers(match, detail?.events ?? [])
  const candidates = buildCandidates(match, detail, scorers)
  const leader = !hasResult ? null : match.homeScore! > match.awayScore! ? 'home' : match.awayScore! > match.homeScore! ? 'away' : 'level'
  return {
    match, competition: ctx.competition, status, hasResult, scorers, scorersComplete: complete, leader, candidates,
    dateLabel: new Date(match.kickoffUtc).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    maxGoals: Math.max(0, ...candidates.map((c) => c.goals)),
    detailPending: !!ctx.detailPending && !detail,
  }
}

export type HeadlineId = 'auto' | 'potm' | 'fav' | 'most'
/** Headline wording for a player card. "Player of the match" only when the USER picks it; "most goals" only when the data says so. */
export function headlineOptions(c: PlayerCandidate, d: ShareData): { id: HeadlineId; label: string; text: string }[] {
  const g = c.goals
  const auto = g >= 3 ? (g === 3 ? 'HAT-TRICK' : `${g} GOALS`) : g === 2 ? 'SCORED 2 GOALS' : g === 1 ? 'SCORED' : ''
  const opts: { id: HeadlineId; label: string; text: string }[] = []
  if (auto) opts.push({ id: 'auto', label: g === 1 ? 'Scored' : g === 3 ? 'Hat-trick' : `${g} goals`, text: auto })
  else opts.push({ id: 'auto', label: 'Played today', text: '' })
  if (g > 0 && g === d.maxGoals) {
    const tied = d.candidates.filter((x) => x.goals === d.maxGoals).length > 1
    opts.push({ id: 'most', label: 'Most goals', text: tied ? 'JOINT MOST GOALS IN THIS MATCH' : 'MOST GOALS IN THIS MATCH' })
  }
  opts.push({ id: 'fav', label: 'My favourite', text: g > 0 ? 'MY FAVOURITE PLAYER SCORED' : 'MY FAVOURITE PLAYER' })
  opts.push({ id: 'potm', label: 'Player of the match', text: 'PLAYER OF THE MATCH' })
  return opts
}
