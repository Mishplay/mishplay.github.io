import { kvGet, kvSet } from './db'
import { useSyncExternalStore } from 'react'
import type { Cached } from '../types'

let lastOk = Number(localStorage.getItem('mish.lastOk') ?? 0) || undefined
const subs = new Set<() => void>()
export const markNetworkOk = () => { lastOk = Date.now(); try { localStorage.setItem('mish.lastOk', String(lastOk)) } catch { /* ignore */ } subs.forEach((f) => f()) }
export const useLastNetworkOk = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => lastOk)

export const MIN = 60_000, HOUR = 3_600_000

/**
 * Stale-while-revalidate. `onData` fires first with cached data (if any, flagged stale when past TTL),
 * then with fresh data. If the network fails and cache exists, cached data stays on screen.
 */
export async function swr<T>(
  key: string, ttl: number, fetcher: () => Promise<T>,
  onData: (c: Cached<T>) => void, opts: { force?: boolean } = {},
): Promise<void> {
  const hit = await kvGet<T>(key)
  const fresh = hit && Date.now() - hit.fetchedAt < ttl
  if (hit) onData({ data: hit.value, fetchedAt: hit.fetchedAt, stale: !fresh })
  if (fresh && !opts.force) return
  const data = await fetcher() // throws → caller shows error while cached data (if any) stays visible
  await kvSet(key, data)
  markNetworkOk()
  onData({ data, fetchedAt: Date.now(), stale: false })
}
