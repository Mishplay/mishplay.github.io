import { getJson } from '../http'

// TheSportsDB free key ("123"): used ONLY for player cutouts/metadata. Free responses are truncated (see report).
const BASE = 'https://www.thesportsdb.com/api/v1/json/123'

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PlayerProfile {
  id: string; name: string; photo?: string; position?: string; nationality?: string
  born?: string; height?: string; team?: string; number?: string
}

export async function searchPlayer(name: string, signal?: AbortSignal): Promise<PlayerProfile | null> {
  const d = await getJson<any>(`${BASE}/searchplayers.php?p=${encodeURIComponent(name)}`, signal, 1)
  const p = d.player?.[0]
  if (!p) return null
  return {
    id: p.idPlayer, name: p.strPlayer, photo: p.strCutout || p.strThumb || undefined, position: p.strPosition || undefined,
    nationality: p.strNationality || undefined, born: p.dateBorn || undefined, height: p.strHeight || undefined,
    team: p.strTeam || undefined, number: p.strNumber || undefined,
  }
}
