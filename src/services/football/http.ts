// Shared fetch layer: dedupe, per-host rate limiting, retry with exponential backoff, cancellation.

const inflight = new Map<string, Promise<unknown>>()

/** Minimum spacing between requests per host (ms). TSDB free tier = 30 req/min. */
const HOST_SPACING: Record<string, number> = {
  'www.thesportsdb.com': 2200,
  'site.api.espn.com': 260,
  'sports.core.api.espn.com': 260,
  'api.openligadb.de': 150,
  'raw.githubusercontent.com': 100,
}
const lastCall = new Map<string, number>()
const hostChain = new Map<string, Promise<void>>()

function throttle(host: string): Promise<void> {
  const gap = HOST_SPACING[host] ?? 100
  const prev = hostChain.get(host) ?? Promise.resolve()
  const next = prev.then(async () => {
    const wait = Math.max(0, (lastCall.get(host) ?? 0) + gap - Date.now())
    if (wait) await new Promise((r) => setTimeout(r, wait))
    lastCall.set(host, Date.now())
  })
  hostChain.set(host, next.catch(() => undefined))
  return next
}

export class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg)
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      rej(new DOMException('Aborted', 'AbortError'))
    })
  })

/** Circuit breaker: after repeated final failures a host is paused briefly instead of hammering it. */
const breaker = new Map<string, { fails: number; until: number }>()
const BREAK_AFTER = 3, BREAK_MS = 30_000

export async function getJson<T>(url: string, signal?: AbortSignal, retries = 2): Promise<T> {
  const existing = inflight.get(url)
  if (existing) return existing as Promise<T>
  const p = (async () => {
    const host = new URL(url).host
    const b = breaker.get(host)
    if (b && b.until > Date.now()) throw new HttpError(503, `${host} paused for 30 s after repeated failures`)
    let attempt = 0
    for (;;) {
      await throttle(host)
      try {
        const res = await fetch(url, { signal })
        if (res.status === 429 || res.status === 1015) {
          const ra = Number(res.headers.get('retry-after')) || 0
          throw new HttpError(429, `Rate limited by ${host}` + (ra ? ` (retry in ${ra}s)` : ''))
        }
        if (!res.ok) throw new HttpError(res.status, `${host} responded ${res.status}`)
        const data = (await res.json()) as T
        breaker.delete(host)
        return data
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e
        const retriable = !(e instanceof HttpError) || e.status === 429 || e.status >= 500
        if (!retriable || attempt >= retries) {
          const cur = breaker.get(host) ?? { fails: 0, until: 0 }
          cur.fails++
          if (cur.fails >= BREAK_AFTER) { cur.until = Date.now() + BREAK_MS; cur.fails = 0 }
          breaker.set(host, cur)
          throw e
        }
        await sleep(600 * 2 ** attempt + Math.random() * 250, signal)
        attempt++
      }
    }
  })().finally(() => inflight.delete(url))
  inflight.set(url, p)
  return p
}

/** Small in-memory TTL memo for large static payloads (season files) shared by many date queries. */
const memoStore = new Map<string, { at: number; p: Promise<unknown> }>()
export function memo<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = memoStore.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>
  const p = fn().catch((e) => { memoStore.delete(key); throw e })
  memoStore.set(key, { at: Date.now(), p })
  return p
}
