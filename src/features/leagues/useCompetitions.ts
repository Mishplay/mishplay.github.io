import { useMemo } from 'react'
import { FEATURED } from '../../services/football/competitions'
import { useSettings } from '../../app/settings'

export interface Comp { id: string; name: string; country?: string }
export function useCompetitions(): Comp[] {
  const s = useSettings()
  return useMemo(() => [...FEATURED, ...s.extraLeagues.filter((e) => !FEATURED.some((f) => f.id === e.id))], [s.extraLeagues])
}
