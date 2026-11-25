import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { toMatch, mapEvents, mapLineup } from '../../src/services/football/providers/espn'
import { buildShareData, buildStatus, headlineOptions, minuteValue } from '../../src/features/share/model'
import type { Match, MatchDetail, MatchEvent } from '../../src/services/football/types'

const j = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
const summary = j('espn_summary.json')
const real: Match = toMatch('eng.1', j('espn_scoreboard.json').events[0])                 // real recorded: Man City 1-1 Fulham
const realDetail: MatchDetail = { matchId: real.id, events: mapEvents(summary), stats: [], provenance: [], lineups: { matchId: real.id, home: mapLineup(summary.rosters[0]), away: mapLineup(summary.rosters[1]), provenance: { source: 'espn', fetchedAt: 1, sourceId: 'x' } } }
const NOW = Date.parse('2026-11-25T20:00:00Z')

describe('share model on the real recorded match', () => {
  const d = buildShareData(real, realDetail, { competition: 'Premier League', online: true, now: NOW })
  it('is a finished result with scorers that add up to the score', () => {
    expect(d.hasResult).toBe(true); expect(d.status).toEqual({ kind: 'final', label: 'FULL TIME' })
    expect(d.scorersComplete).toBe(true)
    expect(d.scorers.map((s) => `${s.side}:${s.name}:${s.minutes.join(',')}`)).toEqual(["away:Rodrigo Muniz:16'", "home:Elliot Anderson:57'"])
    expect(d.leader).toBe('level')
  })
  it('player candidates carry provider data and the exact provider id (never a provider photo URL)', () => {
    const muniz = d.candidates.find((c) => c.name === 'Rodrigo Muniz')!
    expect(muniz.goals).toBe(1); expect(muniz.side).toBe('away')
    expect(d.candidates.some((c) => c.espnId && /^\d+$/.test(c.espnId))).toBe(true)
    expect(d.candidates.every((c) => !('photo' in c))).toBe(true)               // provider photos are not licensed for posters
  })
})

describe('synthetic cases (constructed for tests, clearly not real matches)', () => {
  const mk = (hs: number, as: number, status: Match['status'] = 'finished', minute?: string): Match => ({ ...real, homeScore: hs, awayScore: as, status, minute })
  const g = (player: string, minute: string, team: 'home' | 'away', type: MatchEvent['type'] = 'goal'): MatchEvent => ({ type, player, minute, team })
  const det = (events: MatchEvent[]): MatchDetail => ({ ...realDetail, events })

  it('5–1 with a hat-trick: multiple scorers, goal counts, minutes sorted', () => {
    const d = buildShareData(mk(5, 1), det([g('Erling Haaland', "10'", 'home'), g('Rodrigo Muniz', "20'", 'away'), g('Erling Haaland', "33'", 'home'), g('Phil Foden', "50'", 'home'), g('Erling Haaland', "61'", 'home', 'penalty-goal'), g('Jérémy Doku', "88'", 'home')]), { online: true, now: NOW })
    expect(d.scorersComplete).toBe(true); expect(d.leader).toBe('home')
    const h = d.scorers.find((s) => s.name === 'Erling Haaland')!
    expect(h.goals).toBe(3); expect(h.minutes).toEqual(["10'", "33'", "61'"]); expect(h.penalties).toBe(1)
    const c = d.candidates.find((x) => x.name === 'Erling Haaland')!
    expect(headlineOptions(c, d).map((o) => o.text)).toEqual(['HAT-TRICK', 'MOST GOALS IN THIS MATCH', 'MY FAVOURITE PLAYER SCORED', 'PLAYER OF THE MATCH'])
  })
  it('never offers "most goals" to a non-top scorer and never auto-labels player of the match', () => {
    const d = buildShareData(mk(2, 1), det([g('Erling Haaland', "10'", 'home'), g('Phil Foden', "20'", 'home'), g('Rodrigo Muniz', "30'", 'away')]), { online: true, now: NOW })
    const foden = d.candidates.find((x) => x.name === 'Phil Foden')!
    const o = headlineOptions(foden, d)
    expect(o[0].text).toBe('SCORED'); expect(o.find((x) => x.id === 'most')?.text).toBe('JOINT MOST GOALS IN THIS MATCH')   // 3 players tied on 1 → joint, honestly
    const defender = d.candidates.find((x) => x.name === 'Rúben Dias')!
    expect(headlineOptions(defender, d).find((x) => x.id === 'most')).toBeUndefined()
    expect(headlineOptions(defender, d)[0].text).toBe('')                       // no goals → no invented headline
  })
  it('missing goal minutes: scorer kept, minutes omitted', () => {
    const d = buildShareData(mk(1, 0), det([g('Erling Haaland', '', 'home')]), { online: true, now: NOW })
    expect(d.scorers[0].minutes).toEqual([]); expect(d.scorers[0].goals).toBe(1); expect(d.scorersComplete).toBe(true)
  })
  it('flags incomplete scorer data instead of implying it is complete', () => {
    const d = buildShareData(mk(3, 0), det([g('Erling Haaland', "10'", 'home')]), { online: true, now: NOW })
    expect(d.scorersComplete).toBe(false)
  })
  it('own goal: attribution is chosen only if it reconciles with the score', () => {
    const d = buildShareData(mk(1, 0), det([{ type: 'own-goal', player: 'Calvin Bassey', minute: "12'", team: 'away' }]), { online: true, now: NOW })
    expect(d.scorersComplete).toBe(true); expect(d.scorers[0].side).toBe('home'); expect(d.scorers[0].ownGoals).toBe(1)
    expect(d.candidates.find((c) => c.name === 'Calvin Bassey')!.goals).toBe(0)  // an own goal is not a goal scored
  })
  it('live vs final vs stale vs no-result statuses', () => {
    expect(buildStatus(mk(1, 0, 'live', "67'"), { online: true, now: NOW, asOf: NOW - 20_000 })).toMatchObject({ kind: 'live', label: "LIVE · 67'" })
    expect(buildStatus(mk(1, 0, 'live', "67'"), { online: false, now: NOW, asOf: NOW - 12 * 60_000 })).toMatchObject({ kind: 'stale', label: 'LAST SCORE', note: '12 min ago · not live' })
    expect(buildStatus(mk(1, 0, 'halftime'), { online: true, now: NOW, asOf: NOW })).toMatchObject({ kind: 'halftime' })
    expect(buildShareData(mk(0, 0, 'scheduled'), undefined, { online: true, now: NOW }).hasResult).toBe(false)
    expect(buildShareData({ ...real, homeScore: undefined, awayScore: undefined, status: 'live' }, undefined, { online: true, now: NOW }).hasResult).toBe(false)
  })
  it('minute ordering handles stoppage time', () => { expect(minuteValue("45'+2'")).toBeGreaterThan(minuteValue("45'")); expect(minuteValue("90'+3'")).toBeLessThan(minuteValue("")) })
})

import { classifyLicence, creditFromImageInfo, creditLines } from '../../src/features/share/portrait'
describe('image licence gate ("if the licence is unclear, do not use the image")', () => {
  it.each([['CC0', 'free'], ['CC BY 4.0', 'free'], ['CC BY 2.0', 'free'], ['Public domain', 'free'], ['PD-self', 'free'],
    ['CC BY-SA 4.0', 'sharealike'], ['CC BY-SA 3.0', 'sharealike'],
    ['CC BY-NC 4.0', 'rejected'], ['CC BY-ND 4.0', 'rejected'], ['CC BY-NC-SA 4.0', 'rejected'], ['Fair use', 'rejected'], ['All rights reserved', 'rejected'], ['', 'rejected'], [undefined, 'rejected'], ['Custom licence', 'rejected']] as const)('%s → %s', (n, cls) => expect(classifyLicence(n)).toBe(cls))
  const ii = (o: Record<string, string>) => ({ thumburl: 'https://upload.wikimedia.org/x.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:X.jpg', extmetadata: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])) })
  it('builds a credit record from Commons metadata', () => {
    const p = creditFromImageInfo('File:Elliot Anderson.jpg', ii({ LicenseShortName: 'CC BY 4.0', Artist: '<a href="//x">Jane &amp; Co</a>' }))!
    expect(p.credit).toMatchObject({ author: 'Jane & Co', licence: 'CC BY 4.0', cls: 'free', title: 'Elliot Anderson' })
  })
  it('no usable image when the licence, author or file is missing/unclear', () => {
    expect(creditFromImageInfo('File:a.jpg', ii({ Artist: 'A' }))).toBeNull()
    expect(creditFromImageInfo('File:a.jpg', ii({ LicenseShortName: 'CC BY 4.0' }))).toBeNull()
    expect(creditFromImageInfo('File:a.jpg', ii({ LicenseShortName: 'CC BY 4.0', Artist: 'Unknown author' }))).toBeNull()
    expect(creditFromImageInfo('File:a.jpg', ii({ LicenseShortName: 'CC BY-NC 4.0', Artist: 'A' }))).toBeNull()
    expect(creditFromImageInfo('File:a.jpg', undefined)).toBeNull()
  })
  it('a share-alike photo makes the poster state its licence; a free one does not', () => {
    const sa = creditFromImageInfo('File:a.jpg', ii({ LicenseShortName: 'CC BY-SA 4.0', Artist: 'Bryan' }))!, free = creditFromImageInfo('File:a.jpg', ii({ LicenseShortName: 'CC0', Artist: 'Bryan' }))!
    expect(creditLines([{ credit: sa.credit, kind: 'Photo' }])).toEqual(['Photo: Bryan · CC BY-SA 4.0 · Wikimedia Commons', 'This poster is licensed CC BY-SA 4.0'])
    expect(creditLines([{ credit: free.credit, kind: 'Photo' }])).toEqual(['Photo: Bryan · CC0 · Wikimedia Commons'])
  })
})
