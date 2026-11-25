import { useSyncExternalStore } from 'react'

export interface Settings {
  espnEnabled: boolean
  onboarded: boolean
  favTeams: string[]
  favLeagues: string[]
  favPlayers: string[]
  extraLeagues: { id: string; name: string }[]
  seenEvents: string[]
  theme: 'dark' | 'light'
}
const KEY = 'mish.settings.v1'
const defaults: Settings = { espnEnabled: true, onboarded: false, favTeams: [], favLeagues: [], favPlayers: [], extraLeagues: [], seenEvents: [], theme: 'dark' }

let state: Settings = (() => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return defaults } })()
const subs = new Set<() => void>()

export const getSettings = () => state
export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
  subs.forEach((f) => f())
}
export const useSettings = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)

export function toggleIn(list: 'favTeams' | 'favLeagues' | 'favPlayers', id: string) {
  const cur = state[list]
  updateSettings({ [list]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } as Partial<Settings>)
}
