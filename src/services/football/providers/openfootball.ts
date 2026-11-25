import { getJson, memo } from '../http'
import { matchId, teamKey } from '../identity'
import { configFor, openfootballSeason } from '../competitions'
import type { FootballProvider, Match, Provenance } from '../types'

// CC0 public-domain data, https://github.com/openfootball/football.json
const BASE = 'https://raw.githubusercontent.com/openfootball/football.json/master'
const prov = (id: string): Provenance => ({ source: 'openfootball', fetchedAt: Date.now(), sourceId: id })

interface OFMatch { round: string; date: string; time?: string; team1: string; team2: string; score?: { ft?: [number, number] } }

export function mapOpenFootball(compId: string, m: OFMatch): Match {
  // The file gives a local kickoff time with no timezone, so we keep only the date as reliable.
  const kickoffUtc = `${m.date}T${m.time ?? '00:00'}:00.000Z`
  const finished = !!m.score?.ft
  // the kickoff time has no timezone, so only compare calendar days
  const past = m.date < new Date().toISOString().slice(0, 10)
  const mk = (n: string) => ({ id: teamKey(n), name: n, provenance: [prov(n)] })
  return {
    id: matchId(compId, kickoffUtc, m.team1, m.team2),
    competitionId: compId,
    home: mk(m.team1), away: mk(m.team2),
    kickoffUtc,
    status: finished ? 'finished' : past ? 'unknown' : 'scheduled',
    homeScore: m.score?.ft?.[0], awayScore: m.score?.ft?.[1],
    round: m.round,
    timeUnverified: true,
    provenance: [prov(`${m.date}|${m.team1}|${m.team2}`)],
  }
}

export const openfootballProvider: FootballProvider = {
  id: 'openfootball',
  async season(competitionId, signal) {
    const code = configFor(competitionId)?.openfootball
    if (!code) return []
    const path = code.includes('.') ? `${openfootballSeason()}/${code}.json` : `${openfootballSeason()}/${code}.json`
    const d = await memo(path, 30 * 60_000, () => getJson<{ matches: OFMatch[] }>(`${BASE}/${path}`, signal))
    return d.matches.map((m) => mapOpenFootball(competitionId, m))
  },
  async matches(competitionId, dateYmd, signal) {
    const all = await this.season!(competitionId, signal)
    return all.filter((m) => m.kickoffUtc.startsWith(dateYmd))
  },
}
