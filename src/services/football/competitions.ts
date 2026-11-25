import type { SourceId } from './types'

export interface CompetitionConfig {
  id: string // ESPN slug is the canonical competition id
  name: string
  country: string
  /** secondary-source mappings */
  openfootball?: string // path under football.json, e.g. "{season}/en.1.json"
  openligadb?: string // league shortcut
  sources: SourceId[]
}

/** Featured defaults. Users can discover and add any other ESPN competition at runtime. */
export const FEATURED: CompetitionConfig[] = [
  { id: 'eng.1', name: 'Premier League', country: 'England', openfootball: 'en.1', sources: ['espn', 'openfootball'] },
  { id: 'esp.1', name: 'La Liga', country: 'Spain', openfootball: 'es.1', sources: ['espn', 'openfootball'] },
  { id: 'ita.1', name: 'Serie A', country: 'Italy', openfootball: 'it.1', sources: ['espn', 'openfootball'] },
  { id: 'ger.1', name: 'Bundesliga', country: 'Germany', openfootball: 'de.1', openligadb: 'bl1', sources: ['espn', 'openligadb', 'openfootball'] },
  { id: 'fra.1', name: 'Ligue 1', country: 'France', sources: ['espn'] },
  { id: 'uefa.champions', name: 'Champions League', country: 'Europe', openfootball: 'champions-league', sources: ['espn'] },
  { id: 'uefa.europa', name: 'Europa League', country: 'Europe', sources: ['espn'] },
  { id: 'uefa.europa.conf', name: 'Conference League', country: 'Europe', sources: ['espn'] },
  { id: 'ind.1', name: 'Indian Super League', country: 'India', sources: ['espn'] },
  { id: 'usa.1', name: 'MLS', country: 'USA', sources: ['espn'] },
]

export const configFor = (id: string): CompetitionConfig | undefined => FEATURED.find((c) => c.id === id)

/** Season label "2025-26" style folder for openfootball given a date. */
export function openfootballSeason(d = new Date()): string {
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`
}
