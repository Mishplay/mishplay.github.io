import { useCallback, useEffect, useRef, useState } from 'react'
import { swr } from '../services/football/cache/swr'

export interface SwrState<T> { data?: T; fetchedAt?: number; stale: boolean; loading: boolean; error?: string; refresh: () => void }

/** Cached + auto-refreshing data. Pauses polling while hidden/offline; refreshes when the app returns. */
export function useSwr<T>(key: string | null, ttl: number, fetcher: (s: AbortSignal) => Promise<T>, pollMs?: number | (() => number | undefined)): SwrState<T> {
  const [st, setSt] = useState<{ data?: T; fetchedAt?: number; stale: boolean; loading: boolean; error?: string }>({ stale: false, loading: !!key })
  const fetcherRef = useRef(fetcher); fetcherRef.current = fetcher
  const pollRef = useRef(pollMs); pollRef.current = pollMs
  const ctl = useRef<AbortController | null>(null)

  const run = useCallback(async (force: boolean) => {
    if (!key) return
    ctl.current?.abort()
    const c = (ctl.current = new AbortController())
    try {
      await swr<T>(key, ttl, () => fetcherRef.current(c.signal), (r) => !c.signal.aborted && setSt({ data: r.data, fetchedAt: r.fetchedAt, stale: r.stale, loading: false }), { force })
      if (!c.signal.aborted) setSt((s) => ({ ...s, loading: false, error: undefined }))
    } catch (e) {
      if ((e as Error).name === 'AbortError' || c.signal.aborted) return
      setSt((s) => ({ ...s, loading: false, stale: s.data !== undefined, error: (e as Error).message }))
    }
  }, [key, ttl])

  useEffect(() => {
    setSt({ stale: false, loading: !!key }); run(false)
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      const p = typeof pollRef.current === 'function' ? pollRef.current() : pollRef.current
      if (!p) return
      timer = setTimeout(async () => { if (!document.hidden && navigator.onLine) await run(true); schedule() }, p)
    }
    schedule()
    const wake = () => { if (!document.hidden && navigator.onLine) run(false) }
    document.addEventListener('visibilitychange', wake); window.addEventListener('online', wake)
    return () => { ctl.current?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake) }
  }, [key, run])

  return { ...st, refresh: () => run(true) }
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => { const f = () => setOn(navigator.onLine); window.addEventListener('online', f); window.addEventListener('offline', f); return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f) } }, [])
  return on
}
