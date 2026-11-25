import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** APPLICATION updates (new code/design). Football data refreshes separately, see services/football/cache/swr.ts. */
export const APP_VERSION = __APP_VERSION__

interface UpdateState { needRefresh: boolean; offlineReady: boolean; updating: boolean; error?: string; lastCheck?: number; dismissed: boolean }
const LATER_KEY = 'mish.update.later' // sessionStorage: "Later" lasts for this session only
let state: UpdateState = { needRefresh: false, offlineReady: false, updating: false, dismissed: sessionStorage.getItem(LATER_KEY) === '1' }
const subs = new Set<() => void>()
const set = (p: Partial<UpdateState>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
export const useUpdate = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)

let updateSW: ((reload?: boolean) => Promise<void>) | undefined
let registration: ServiceWorkerRegistration | undefined
const MIN_GAP = 10 * 60_000, EVERY = 30 * 60_000

/** Ask the server for a newer service worker. Never throws: on any network failure the current version simply keeps running. */
export async function checkForUpdate(force = true): Promise<void> {
  if (!registration || !navigator.onLine) return
  if (!force && Date.now() - (state.lastCheck ?? 0) < MIN_GAP) return
  try { await registration.update(); set({ lastCheck: Date.now() }) } catch { /* offline / host down: keep the installed version */ }
}

/** User chose "Update now": activate the already-downloaded worker, then reload once it controls the page. */
export async function applyUpdate(): Promise<void> {
  set({ updating: true, error: undefined })
  try { await updateSW?.(true) } catch { set({ updating: false, error: "Couldn't apply the update. Your current version is unchanged." }) }
}

/** User chose "Later": keep the current version, stay quiet for the rest of this session, keep the update available (Settings). */
export function postpone() { try { sessionStorage.setItem(LATER_KEY, '1') } catch { /* ignore */ } set({ dismissed: true }) }
export const clearOfflineReady = () => set({ offlineReady: false })

export function initUpdates() {
  if (!('serviceWorker' in navigator)) return
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => set({ needRefresh: true }),   // a new version is installed and waiting (also fires on later launches)
    onOfflineReady: () => set({ offlineReady: true }),  // first install finished: the app now works without the network
    onRegisteredSW: (_url, r) => { registration = r; void checkForUpdate(false) },
  })
  setInterval(() => void checkForUpdate(false), EVERY)
  addEventListener('online', () => void checkForUpdate(true))       // retries an interrupted update when connectivity returns
  document.addEventListener('visibilitychange', () => !document.hidden && void checkForUpdate(false))
}
