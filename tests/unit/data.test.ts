import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { teamKey, sameTeam, mergeMatch, mergeMatches } from '../../src/services/football/identity'
import { toMatch, mapStatus, mapEvents, mapStats, mapLineup } from '../../src/services/football/providers/espn'
import { mapOpenLiga } from '../../src/services/football/providers/openligadb'
import { mapOpenFootball } from '../../src/services/football/providers/openfootball'
import type { Match } from '../../src/services/football/types'

const j = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))

describe('identity', () => {
  it('resolves team names across providers', () => {
    expect(teamKey('Brighton & Hove Albion')).toBe(teamKey('Brighton and Hove Albion'))
    expect(teamKey('FC Bayern München')).toBe(teamKey('Bayern Munich'))
    expect(teamKey('Manchester City')).toBe(teamKey('Man City'))
  })
})

describe('ESPN normalisation (real recorded responses)', () => {
  const board = j('espn_scoreboard.json')
  const summary = j('espn_summary.json')
  it('maps finished matches with scores and UTC kickoff', () => {
    const m = toMatch('eng.1', board.events[0])
    expect(m.status).toBe('finished')
    expect(m.homeScore).toBe(1); expect(m.awayScore).toBe(1)
    expect(m.kickoffUtc).toBe('2026-11-21T12:30:00.000Z')
  })
  it('never infers live from unknown status', () => {
    expect(mapStatus('STATUS_SOMETHING_NEW')).toBe('unknown')
    expect(mapStatus('STATUS_FIRST_HALF')).toBe('live')
  })
  it('maps events, stats and lineups from provider data', () => {
    const ev = mapEvents(summary)
    expect(ev.some((e) => e.type === 'goal' && e.player === 'Rodrigo Muniz' && e.assist === 'Oscar Bobb')).toBe(true)
    expect(ev.some((e) => e.type === 'sub' && e.player && e.playerOff)).toBe(true)
    const st = mapStats(summary)
    expect(st.find((s) => s.key === 'possessionPct')).toBeTruthy()
    const lu = mapLineup(summary.rosters[0])!
    expect(lu.formation).toBe('4-2-3-1')
    expect(lu.players.filter((p) => p.starter && p.slot)).toHaveLength(11)
  })
})

describe('multi-provider merge', () => {
  const liga = j('openligadb_bl1.json')
  const finished = liga.find((m: { matchIsFinished: boolean }) => m.matchIsFinished)
  const a = mapOpenLiga('ger.1', finished)

  it('keeps the higher-priority score and records conflicts', () => {
    const espn: Match = { ...a, provenance: [{ source: 'espn', fetchedAt: 1, sourceId: 'x' }], homeScore: 9, awayScore: 9, home: { ...a.home, crest: 'espn.png' } }
    const merged = mergeMatch(a, espn)
    expect(merged.homeScore).toBe(9)                       // ESPN outranks OpenLigaDB for score
    expect(merged.home.crest).toBe('espn.png')             // and for crest
    expect(merged.conflicts?.[0].field).toBe('score')      // disagreement is surfaced, not hidden
    expect(merged.provenance.map((p) => p.source).sort()).toEqual(['espn', 'openligadb'])
  })
  it('lower-priority source never overwrites', () => {
    const espn: Match = { ...a, provenance: [{ source: 'espn', fetchedAt: 1, sourceId: 'x' }], homeScore: 2, awayScore: 0 }
    expect(mergeMatch(espn, a).homeScore).toBe(2)
  })
  it('openfootball + ESPN resolve to the same match id', () => {
    const board = j('espn_scoreboard.json')
    const e = toMatch('eng.1', board.events[0]) // Man City v Fulham
    const of = j('openfootball_pl.json').matches.find((m: { date: string; team1: string }) => m.date === '2025-08-23' && m.team1.includes('Manchester'))
    expect(of).toBeTruthy()
    const o = mapOpenFootball('eng.1', { ...of, date: '2026-11-21', team1: 'Manchester City FC', team2: 'Fulham FC' })
    expect(o.id).toBe(e.id)
    const merged = mergeMatches([[o], [e]])
    expect(merged).toHaveLength(1)
    expect(merged[0].timeUnverified).toBeUndefined() // ESPN's verified kickoff wins
    expect(merged[0].kickoffUtc).toBe(e.kickoffUtc)
  })
})

import { layoutFormation } from '../../src/features/lineups/layout'
describe('pitch layout from provider formation', () => {
  const summary = j('espn_summary.json')
  for (const idx of [0, 1]) {
    it(`places both real lineups (${idx ? 'away' : 'home'}) on distinct points`, () => {
      const lu = mapLineup(summary.rosters[idx])!
      const placed = layoutFormation(lu.formation, lu.players.filter((p) => p.starter))!
      expect(placed).toHaveLength(11)
      expect(new Set(placed.map((p) => `${Math.round(p.x)}|${Math.round(p.y)}`)).size).toBe(11)
      const gk = placed.find((p) => p.player.position === 'G')!
      expect(gk.y).toBeGreaterThan(85)
    })
  }
  it('puts the left back on the left of the right back (attacking up)', () => {
    const lu = mapLineup(summary.rosters[0])!
    const placed = layoutFormation(lu.formation, lu.players.filter((p) => p.starter))!
    const lb = placed.find((p) => p.player.position === 'LB')!, rb = placed.find((p) => p.player.position === 'RB')!
    expect(lb.x).toBeLessThan(rb.x)
  })
  it('refuses to invent a layout without a formation', () => {
    const lu = mapLineup(summary.rosters[0])!
    expect(layoutFormation(undefined, lu.players.filter((p) => p.starter))).toBeNull()
    expect(layoutFormation('4-4-2', lu.players.filter((p) => p.starter).slice(0, 10))).toBeNull()
  })
})

describe('fuzzy identity across real provider naming (observed live)', () => {
  const pairs: [string, string][] = [
    ['Real Madrid CF', 'Real Madrid'], ['Sevilla FC', 'Sevilla'], ['Real Betis Balompié', 'Real Betis'], ['Deportivo Alavés', 'Alavés'],
    ['RC Celta de Vigo', 'Celta Vigo'], ['CA Osasuna', 'Osasuna'], ['Málaga CF', 'Málaga'], ['RCD Espanyol de Barcelona', 'Espanyol'],
    ['US Sassuolo Calcio', 'Sassuolo'], ['Genoa CFC', 'Genoa'], ['Bologna FC 1909', 'Bologna'], ['SV Werder Bremen', 'Werder Bremen'], ['Hamburger SV', 'Hamburg SV'], ['1. FSV Mainz 05', 'Mainz'],
  ]
  for (const [a, b] of pairs) it(`${a} ≡ ${b}`, () => expect(sameTeam(a, b)).toBe(true))
  it('does not merge different clubs', () => {
    expect(sameTeam('Real Madrid', 'Real Betis')).toBe(false)
    expect(sameTeam('Manchester City', 'Manchester United')).toBe(false)
    expect(sameTeam('Inter Miami CF', 'Internazionale')).toBe(false)
  })
  it('merges same-day matches whose names differ between sources', () => {
    const mk = (src: 'espn' | 'openligadb', h: string, a: string, hs: number): Match => ({
      id: src + h, competitionId: 'esp.1', home: { id: h, name: h, provenance: [] }, away: { id: a, name: a, provenance: [] },
      kickoffUtc: '2026-11-21T20:00:00.000Z', status: 'finished', homeScore: hs, awayScore: 0, provenance: [{ source: src, fetchedAt: 1, sourceId: h }],
    })
    const merged = mergeMatches([[mk('espn', 'Real Madrid', 'Celta Vigo', 2)], [mk('openligadb', 'Real Madrid CF', 'RC Celta de Vigo', 2)]])
    expect(merged).toHaveLength(1)
    expect(merged[0].provenance.map((p) => p.source).sort()).toEqual(['espn', 'openligadb'])
  })
})
