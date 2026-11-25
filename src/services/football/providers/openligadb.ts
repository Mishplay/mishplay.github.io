import { getJson, memo } from '../http'
import { matchId, teamKey } from '../identity'
import { configFor } from '../competitions'
import type { FootballProvider, Match, Provenance } from '../types'

// Community database, https://www.openligadb.de  (attribution shown in the UI)
const BASE = 'https://api.openligadb.de'
const prov = (id: string): Provenance => ({ source: 'openligadb', fetchedAt: Date.now(), sourceId: id })

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapOpenLiga(compId: string, m: any): Match {
  const kickoffUtc = new Date(m.matchDateTimeUTC).toISOString()
  const final = (m.matchResults ?? []).find((r: any) => r.resultTypeID === 2)
  const started = new Date(kickoffUtc).getTime() <= Date.now()
  const status = m.matchIsFinished ? 'finished' : started ? 'unknown' : 'scheduled'
  const mk = (t: any) => ({
    id: teamKey(t.teamName), name: t.teamName, shortName: t.shortName,
    crest: t.teamIconUrl, provenance: [prov(String(t.teamId))],
  })
  return {
    id: matchId(compId, kickoffUtc, m.team1.teamName, m.team2.teamName),
    competitionId: compId,
    home: mk(m.team1), away: mk(m.team2), kickoffUtc, status: status as Match['status'],
    homeScore: final?.pointsTeam1, awayScore: final?.pointsTeam2,
    round: m.group?.groupName,
    venue: m.location?.locationStadium,
    provenance: [prov(String(m.matchID))],
  }
}

export const openligadbProvider: FootballProvider = {
  id: 'openligadb',
  async season(competitionId, signal) {
    const short = configFor(competitionId)?.openligadb
    if (!short) return []
    const now = new Date()
    const season = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
    const d = await memo(`oldb${short}${season}`, 10 * 60_000, () => getJson<any[]>(`${BASE}/getmatchdata/${short}/${season}`, signal))
    return d.map((m) => mapOpenLiga(competitionId, m))
  },
  async matches(competitionId, dateYmd, signal) {
    const all = await this.season!(competitionId, signal)
    return all.filter((m) => m.kickoffUtc.startsWith(dateYmd))
  },
}
