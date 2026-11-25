import { getJson } from '../http'
import { matchId, teamKey } from '../identity'
import type {
  Competition, EventType, FootballProvider, LineupPlayer, Match, MatchEvent, MatchStatus,
  Provenance, Standings, TeamLineup, TeamStat,
} from '../types'

// ESPN's public site API is unofficial and undocumented. Attribution ("Data: ESPN") is shown in the UI
// and this provider can be disabled in Settings. See research/SOURCE_REPORT.md.
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const SITE_V2 = 'https://site.api.espn.com/apis/v2/sports/soccer'

const prov = (id: string): Provenance => ({ source: 'espn', fetchedAt: Date.now(), sourceId: id })

/* eslint-disable @typescript-eslint/no-explicit-any */

export function mapStatus(name: string): MatchStatus {
  switch (name) {
    case 'STATUS_SCHEDULED': return 'scheduled'
    case 'STATUS_FIRST_HALF':
    case 'STATUS_SECOND_HALF':
    case 'STATUS_IN_PROGRESS':
    case 'STATUS_EXTRA_TIME':
    case 'STATUS_OVERTIME':
    case 'STATUS_SHOOTOUT': return 'live'
    case 'STATUS_HALFTIME': return 'halftime'
    case 'STATUS_FULL_TIME':
    case 'STATUS_FINAL':
    case 'STATUS_FINAL_AET':
    case 'STATUS_FINAL_PEN': return 'finished'
    case 'STATUS_POSTPONED':
    case 'STATUS_DELAYED': return 'postponed'
    case 'STATUS_CANCELED': return 'cancelled'
    default: return 'unknown' // never infer "live" from an unknown value
  }
}

/** ESPN dates look like "2026-11-21T12:30Z" (no seconds). */
const isoUtc = (d: string) => new Date(d).toISOString()

export function toMatch(compId: string, ev: any): Match {
  const c = ev.competitions[0]
  const home = c.competitors.find((x: any) => x.homeAway === 'home')
  const away = c.competitors.find((x: any) => x.homeAway === 'away')
  const status = mapStatus(ev.status?.type?.name)
  const hasScore = status !== 'scheduled' && status !== 'unknown'
  const mk = (t: any) => ({
    id: teamKey(t.team.displayName),
    name: t.team.displayName,
    shortName: t.team.shortDisplayName,
    crest: t.team.logo,
    color: /^[0-9a-f]{6}$/i.test(t.team.color ?? '') ? t.team.color : undefined,
    provenance: [prov(String(t.team.id))],
  })
  const kickoffUtc = isoUtc(ev.date)
  return {
    id: matchId(compId, kickoffUtc, home.team.displayName, away.team.displayName),
    competitionId: compId,
    home: mk(home),
    away: mk(away),
    kickoffUtc,
    status,
    rawStatus: ev.status?.type?.name,
    minute: status === 'live' ? ev.status?.displayClock : undefined,
    homeScore: hasScore ? Number(home.score) : undefined,
    awayScore: hasScore ? Number(away.score) : undefined,
    venue: c.venue?.fullName,
    round: ev.week?.number ? `Matchday ${ev.week.number}` : undefined,
    provenance: [prov(String(ev.id))],
  }
}

const EVENT_MAP: Array<[RegExp, EventType]> = [
  [/^own goal/i, 'own-goal'],
  [/penalty - scored|^goal - penalty/i, 'penalty-goal'],
  [/^goal/i, 'goal'],
  [/yellow card/i, 'yellow'],
  [/red card/i, 'red'],
  [/substitution/i, 'sub'],
  [/halftime/i, 'halftime'],
  [/full time|end regular time/i, 'fulltime'],
  [/kickoff/i, 'kickoff'],
]

export function mapEvents(d: any): MatchEvent[] {
  const homeId = d.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id
  return (d.keyEvents ?? [])
    .map((k: any): MatchEvent => {
      const text: string = k.type?.text ?? ''
      const type = EVENT_MAP.find(([re]) => re.test(text))?.[1] ?? 'other'
      const ps = (k.participants ?? []).map((p: any) => p.athlete?.displayName).filter(Boolean)
      const isSub = type === 'sub'
      return {
        type,
        minute: k.clock?.displayValue ?? '',
        team: k.team?.id ? (String(k.team.id) === String(homeId) ? 'home' : 'away') : undefined,
        // ESPN lists the player coming ON first for substitutions
        player: ps[0],
        assist: type === 'goal' || type === 'penalty-goal' ? ps[1] : undefined,
        playerOff: isSub ? ps[1] : undefined,
        text: k.text,
      }
    })
    .filter((e: MatchEvent) => e.type !== 'other' || e.text)
}

const STAT_LABELS: Array<[string, string]> = [
  ['possessionPct', 'Possession'],
  ['totalShots', 'Shots'],
  ['shotsOnTarget', 'Shots on target'],
  ['wonCorners', 'Corners'],
  ['foulsCommitted', 'Fouls'],
  ['saves', 'Saves'],
  ['yellowCards', 'Yellow cards'],
  ['offsides', 'Offsides'],
]

export function mapStats(d: any): TeamStat[] {
  const teams = d.boxscore?.teams
  if (!teams || teams.length < 2) return []
  const val = (t: any, k: string) => {
    const s = (t.statistics ?? []).find((x: any) => x.name === k)
    return s ? Number(s.displayValue) : NaN
  }
  const [h, a] = teams[0].homeAway === 'away' ? [teams[1], teams[0]] : [teams[0], teams[1]]
  return STAT_LABELS.flatMap(([key, label]) => {
    const home = val(h, key), away = val(a, key)
    return Number.isFinite(home) && Number.isFinite(away) ? [{ key, label, home, away }] : []
  })
}

export function mapLineup(r: any): TeamLineup | undefined {
  if (!r?.roster?.length) return undefined
  const players: LineupPlayer[] = r.roster.map((p: any) => ({
    id: p.athlete?.id,
    name: p.athlete?.displayName,
    jersey: p.jersey,
    position: p.position?.abbreviation,
    slot: p.starter && p.formationPlace ? Number(p.formationPlace) : undefined,
    starter: !!p.starter,
    subbedOut: !!p.subbedOut,
    photo: p.athlete?.headshot?.href,
    stats: Object.fromEntries((p.stats ?? []).map((s: any) => [s.name, Number(s.value)])),
  }))
  return { teamName: r.team?.displayName, formation: r.formation, players }
}

export const espnProvider: FootballProvider = {
  id: 'espn',

  async competitions(signal) {
    // Core catalogue returns refs only; we keep the slug and derive a readable name lazily via the scoreboard.
    const d = await getJson<any>('https://sports.core.api.espn.com/v2/sports/soccer/leagues?limit=300', signal)
    return (d.items as any[]).map((i): Competition => {
      const slug = /leagues\/([^?]+)/.exec(i.$ref)![1]
      return { id: slug, name: slug, provenance: [prov(slug)] }
    })
  },

  async matches(competitionId, dateYmd, signal) {
    const d = await getJson<any>(`${SITE}/${competitionId}/scoreboard?dates=${dateYmd.replace(/-/g, '')}`, signal)
    return (d.events ?? []).map((e: any) => toMatch(competitionId, e))
  },

  async matchDetail(competitionId, sourceMatchId, signal) {
    const d = await getJson<any>(`${SITE}/${competitionId}/summary?event=${sourceMatchId}`, signal)
    const rosters: any[] = d.rosters ?? []
    const side = (ha: string) => rosters.find((r) => r.homeAway === ha)
    const home = mapLineup(side('home')), away = mapLineup(side('away'))
    const hasSlots = [home, away].some((l) => l?.players.some((p) => p.starter && p.slot))
    const hc = d.header?.competitions?.[0]
    const hs = hc ? mapStatus(hc.status?.type?.name) : undefined
    const sc = (ha: string) => { const v = hc?.competitors?.find((c: any) => c.homeAway === ha)?.score; return v === undefined || v === '' ? undefined : Number(v) }
    return {
      header: hc && hs ? { status: hs, rawStatus: hc.status?.type?.name, minute: hs === 'live' ? hc.status?.displayClock : undefined, homeScore: hs === 'scheduled' ? undefined : sc('home'), awayScore: hs === 'scheduled' ? undefined : sc('away') } : undefined,
      events: mapEvents(d),
      stats: mapStats(d),
      // A lineup is only exposed when the provider returned starters with formation slots.
      lineups: hasSlots
        ? { matchId: sourceMatchId, home, away, provenance: prov(sourceMatchId) }
        : undefined,
      provenance: [prov(sourceMatchId)],
    }
  },

  async standings(competitionId, signal): Promise<Standings | null> {
    const d = await getJson<any>(`${SITE_V2}/${competitionId}/standings`, signal)
    const entries = d.children?.[0]?.standings?.entries
    if (!entries) return null
    const stat = (e: any, n: string) => Number(e.stats.find((s: any) => s.name === n)?.value ?? 0)
    return {
      competitionId,
      provenance: prov(competitionId),
      rows: entries.map((e: any) => ({
        rank: stat(e, 'rank'),
        team: {
          id: teamKey(e.team.displayName), name: e.team.displayName, shortName: e.team.shortDisplayName,
          crest: e.team.logos?.[0]?.href, provenance: [prov(String(e.team.id))],
        },
        played: stat(e, 'gamesPlayed'), won: stat(e, 'wins'), drawn: stat(e, 'ties'), lost: stat(e, 'losses'),
        gf: stat(e, 'pointsFor'), ga: stat(e, 'pointsAgainst'), gd: stat(e, 'pointDifferential'), points: stat(e, 'points'),
      })).sort((a: any, b: any) => a.rank - b.rank),
    }
  },
}

export interface PlayerInfo {
  id: string; name: string; jersey?: string; position?: string; age?: number
  height?: string; nationality?: string; photo?: string; teamName?: string; teamId?: string
}
export interface TeamPage {
  id: string; name: string; crest?: string; standingSummary?: string; record?: string
  squad: PlayerInfo[]; fixtures: Match[]
}

export async function fetchTeamPage(competitionId: string, teamId: string, signal?: AbortSignal): Promise<TeamPage> {
  const [t, r, s] = await Promise.all([
    getJson<any>(`${SITE}/${competitionId}/teams/${teamId}`, signal),
    getJson<any>(`${SITE}/${competitionId}/teams/${teamId}/roster`, signal),
    getJson<any>(`${SITE}/${competitionId}/teams/${teamId}/schedule?fixture=true`, signal).catch(() => ({ events: [] })),
  ])
  const team = t.team
  const squad: PlayerInfo[] = (r.athletes ?? []).map((a: any) => ({
    id: String(a.id), name: a.displayName, jersey: a.jersey, position: a.position?.displayName, age: a.age,
    height: a.displayHeight, nationality: a.citizenship, photo: a.headshot?.href, teamName: team.displayName, teamId,
  }))
  const fixtures = (s.events ?? []).filter((e: any) => e.competitions?.[0]?.competitors?.length === 2).map((e: any) => toMatch(competitionId, e))
  return {
    id: teamId, name: team.displayName, crest: team.logos?.[0]?.href,
    standingSummary: team.standingSummary, record: team.record?.items?.[0]?.summary, squad, fixtures,
  }
}
