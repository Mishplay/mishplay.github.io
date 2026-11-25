import type { Match, Provenance, SourceId, Team } from './types'

const STRIP = /\b(fc|afc|cf|sc|ac|as|ssc|sv|vfb|vfl|fsv|tsg|1\.|club|de|the)\b/g

/** Canonical team key used for cross-provider identity resolution. */
export function teamKey(name: string): string {
  const k = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(STRIP, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return ALIASES[k] ?? k
}

// Small, explicit alias table (extend as conflicts are observed).
const ALIASES: Record<string, string> = {
  'brighton and hove albion': 'brighton',
  'brighton hove albion': 'brighton',
  'manchester united': 'man united',
  'manchester city': 'man city',
  'tottenham hotspur': 'tottenham',
  'wolverhampton wanderers': 'wolves',
  'newcastle united': 'newcastle',
  'nottingham forest': 'nottm forest',
  'west ham united': 'west ham',
  'leeds united': 'leeds',
  'bayern munchen': 'bayern munich',
  'bayern': 'bayern munich',
  'hamburger': 'hamburg',
  'borussia monchengladbach': 'gladbach',
  'atletico madrid': 'atletico',
}

export function matchId(competitionId: string, kickoffUtc: string, home: string, away: string) {
  return `${competitionId}|${kickoffUtc.slice(0, 10)}|${teamKey(home)}|${teamKey(away)}`
}

/** Source priority per field. Lower index wins. */
export const PRIORITY = {
  score: ['espn', 'openligadb', 'openfootball', 'tsdb'],
  status: ['espn', 'openligadb', 'tsdb', 'openfootball'],
  crest: ['espn', 'tsdb', 'openligadb'],
  kickoff: ['espn', 'openligadb', 'openfootball', 'tsdb'],
} satisfies Record<string, SourceId[]>

const rank = (field: keyof typeof PRIORITY, s: SourceId) => {
  const i = (PRIORITY[field] as SourceId[]).indexOf(s)
  return i < 0 ? 99 : i
}

const srcOf = (m: Match): SourceId => m.provenance[0].source

function mergeProv(a: Provenance[], b: Provenance[]) {
  const seen = new Set(a.map((p) => p.source + p.sourceId))
  return [...a, ...b.filter((p) => !seen.has(p.source + p.sourceId))]
}

function mergeTeam(a: Team, b: Team, aWins: boolean): Team {
  const hi = aWins ? a : b
  const lo = aWins ? b : a
  return { ...lo, ...hi, crest: hi.crest ?? lo.crest, provenance: mergeProv(a.provenance, b.provenance) }
}

/**
 * Merge two records of the same real-world match. A lower-priority source never
 * overwrites a higher-priority value; disagreements on score are recorded.
 */
export function mergeMatch(a: Match, b: Match): Match {
  const scoreA = rank('score', srcOf(a)) <= rank('score', srcOf(b))
  const statusA = rank('status', srcOf(a)) <= rank('status', srcOf(b))
  const kickA = rank('kickoff', srcOf(a)) <= rank('kickoff', srcOf(b))
  const score = scoreA ? a : b
  const status = statusA ? a : b
  const conflicts = [...(a.conflicts ?? []), ...(b.conflicts ?? [])]
  if (
    a.homeScore !== undefined &&
    b.homeScore !== undefined &&
    (a.homeScore !== b.homeScore || a.awayScore !== b.awayScore)
  ) {
    conflicts.push({
      field: 'score',
      values: {
        [srcOf(a)]: `${a.homeScore}-${a.awayScore}`,
        [srcOf(b)]: `${b.homeScore}-${b.awayScore}`,
      },
    })
  }
  return {
    ...b,
    ...a,
    home: mergeTeam(a.home, b.home, rank('crest', srcOf(a)) <= rank('crest', srcOf(b))),
    away: mergeTeam(a.away, b.away, rank('crest', srcOf(a)) <= rank('crest', srcOf(b))),
    kickoffUtc: (kickA ? a : b).kickoffUtc,
    homeScore: score.homeScore ?? (scoreA ? b : a).homeScore,
    awayScore: score.awayScore ?? (scoreA ? b : a).awayScore,
    status: status.status,
    rawStatus: status.rawStatus,
    minute: status.minute,
    timeUnverified: a.timeUnverified && b.timeUnverified ? true : undefined,
    venue: a.venue ?? b.venue,
    round: a.round ?? b.round,
    provenance: mergeProv(a.provenance, b.provenance),
    conflicts: conflicts.length ? conflicts : undefined,
  }
}

/** Two team names refer to the same club if their normalised keys are equal or one contains the other. */
export function sameTeam(a: string, b: string): boolean {
  const x = teamKey(a), y = teamKey(b)
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.length >= 4 && new RegExp(`(^| )${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(long)
}

const DAY = 86_400_000
function sameMatch(a: Match, b: Match): boolean {
  if (a.competitionId !== b.competitionId) return false
  const close = Math.abs(new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()) < DAY
  return close && sameTeam(a.home.name, b.home.name) && sameTeam(a.away.name, b.away.name)
}

/** Merge lists from several sources. Matches are grouped by fuzzy identity, never by exact id alone. */
export function mergeMatches(lists: Match[][]): Match[] {
  const out: Match[] = []
  for (const list of lists)
    for (const m of list) {
      const i = out.findIndex((x) => x.id === m.id || sameMatch(x, m))
      out[i >= 0 ? i : out.length] = i >= 0 ? mergeMatch(out[i], m) : m
    }
  return out.sort((x, y) => x.kickoffUtc.localeCompare(y.kickoffUtc))
}
