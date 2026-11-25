// Unified football data model. Every record keeps provenance; nothing is invented.

export type SourceId = 'espn' | 'openfootball' | 'openligadb' | 'tsdb'

export interface Provenance {
  source: SourceId
  fetchedAt: number
  /** id of the record inside that source */
  sourceId: string
}

export type MatchStatus =
  | 'scheduled'
  | 'live'
  | 'halftime'
  | 'finished'
  | 'postponed'
  | 'cancelled'
  | 'unknown'

export interface Competition {
  id: string // canonical slug, e.g. "eng.1"
  name: string
  country?: string
  logo?: string
  provenance: Provenance[]
}

export interface Team {
  id: string // canonical key (normalised name)
  name: string
  shortName?: string
  crest?: string
  /** provider-supplied brand colour, 6-digit hex without '#' */
  color?: string
  provenance: Provenance[]
}

export interface Match {
  id: string // canonical: competition|date|home|away
  competitionId: string
  home: Team
  away: Team
  kickoffUtc: string // ISO 8601 with Z
  status: MatchStatus
  rawStatus?: string
  /** only set when a provider supplies a live clock */
  minute?: string
  homeScore?: number
  awayScore?: number
  /** penalty shoot-out score, only when the source reports a shoot-out (not part of home/awayScore) */
  homePens?: number
  awayPens?: number
  venue?: string
  round?: string
  /** true when the source gives a local kickoff time with no timezone (show date only) */
  timeUnverified?: boolean
  provenance: Provenance[]
  /** fields where two sources disagreed (kept for transparency) */
  conflicts?: { field: string; values: Partial<Record<SourceId, unknown>> }[]
}

export interface LineupPlayer {
  id?: string
  name: string
  jersey?: string
  position?: string
  /** formation slot supplied by the provider (1 = GK) */
  slot?: number
  starter: boolean
  subbedOut?: boolean
  photo?: string
  stats?: Record<string, number>
}

export interface TeamLineup {
  teamName: string
  formation?: string
  players: LineupPlayer[]
}

export interface Lineups {
  matchId: string
  home?: TeamLineup
  away?: TeamLineup
  provenance: Provenance
}

export type EventType =
  | 'goal'
  | 'own-goal'
  | 'penalty-goal'
  | 'yellow'
  | 'red'
  | 'sub'
  | 'halftime'
  | 'fulltime'
  | 'kickoff'
  | 'other'

export interface MatchEvent {
  type: EventType
  minute: string
  team?: 'home' | 'away'
  player?: string
  assist?: string
  /** for subs: player coming off */
  playerOff?: string
  text?: string
}

export interface TeamStat {
  key: string
  label: string
  home: number
  away: number
}

export interface MatchDetail {
  matchId: string
  events: MatchEvent[]
  stats: TeamStat[]
  lineups?: Lineups
  /** latest status/score straight from the detail endpoint (fresher than list data) */
  header?: Pick<Match, 'status' | 'minute' | 'homeScore' | 'awayScore' | 'rawStatus'>
  provenance: Provenance[]
}

export interface StandingRow {
  rank: number
  team: Team
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  points: number
}

export interface Standings {
  competitionId: string
  rows: StandingRow[]
  provenance: Provenance
}

/** Wrapper used by the cache so UI can show freshness. */
export interface Cached<T> {
  data: T
  fetchedAt: number
  stale: boolean
}

export interface FootballProvider {
  id: SourceId
  /** lower number = higher priority for a given category */
  competitions?(signal?: AbortSignal): Promise<Competition[]>
  matches?(competitionId: string, dateYmd: string, signal?: AbortSignal): Promise<Match[]>
  /** Whole-season fixtures (static / seasonal sources) */
  season?(competitionId: string, signal?: AbortSignal): Promise<Match[]>
  matchDetail?(competitionId: string, sourceMatchId: string, signal?: AbortSignal): Promise<Omit<MatchDetail, 'matchId'>>
  standings?(competitionId: string, signal?: AbortSignal): Promise<Standings | null>
}
