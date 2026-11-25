import { kvGet, kvSet } from '../../services/football/cache/db'

// Loads crests/photos for the share canvas. Only provider-supplied URLs are ever requested; a missing/404/non-image result is "no image"
// (the card then draws its own fallback), never a broken picture. Order: memory → IndexedDB (works offline) → network (CORS).
export type Img = HTMLImageElement | ImageBitmap
export interface Loaded { img: Img; w: number; h: number; source: 'memory' | 'idb' | 'network' }

const mem = new Map<string, Promise<Loaded | null>>()
const objectUrls: string[] = []
const bitmaps: ImageBitmap[] = []

async function decode(blob: Blob): Promise<{ img: Img; w: number; h: number } | null> {
  try {
    if (blob.type.includes('svg')) {
      const u = URL.createObjectURL(blob); objectUrls.push(u)
      const im = new Image(); im.src = u; await im.decode()
      return { img: im, w: im.naturalWidth || 512, h: im.naturalHeight || 512 }
    }
    const bm = await createImageBitmap(blob); bitmaps.push(bm)
    return { img: bm, w: bm.width, h: bm.height }
  } catch { return null }
}

async function fetchBlob(url: string, timeoutMs: number): Promise<Blob | null> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { mode: 'cors', signal: ctl.signal })
    const ct = res.headers.get('content-type') ?? ''
    if (!res.ok || !ct.startsWith('image/')) return null           // ESPN answers a missing photo with a tiny 404 page
    const b = await res.blob()
    return b.size > 64 ? b : null
  } catch { return null } finally { clearTimeout(t) }
}

export function loadImage(url?: string, timeoutMs = 8000): Promise<Loaded | null> {
  if (!url) return Promise.resolve(null)
  const hit = mem.get(url); if (hit) return hit.then((l) => l && { ...l, source: 'memory' as const })
  const p = (async (): Promise<Loaded | null> => {
    const saved = await kvGet<Blob>(`img|${url}`)
    if (saved?.value instanceof Blob) { const d = await decode(saved.value); if (d) return { ...d, source: 'idb' } }
    if (!navigator.onLine) return null
    const blob = await fetchBlob(url, timeoutMs)
    if (!blob) return null
    const d = await decode(blob); if (!d) return null
    void kvSet(`img|${url}`, blob)                                    // keep for offline card generation
    return { ...d, source: 'network' }
  })()
  mem.set(url, p); return p
}

/** Free everything created for the editor: object URLs are revoked and bitmaps closed. (Persistent copies stay in IndexedDB.) */
export function releaseImages() {
  for (const u of objectUrls.splice(0)) URL.revokeObjectURL(u)
  for (const b of bitmaps.splice(0)) b.close()
  mem.clear()
}
