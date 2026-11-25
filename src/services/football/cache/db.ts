import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

interface Schema extends DBSchema {
  kv: { key: string; value: { key: string; value: unknown; fetchedAt: number; size: number } }
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null
const db = () => (dbp ??= openDB<Schema>('mish-football', 1, { upgrade: (d) => void d.createObjectStore('kv', { keyPath: 'key' }) }))

const MAX_ENTRIES = 600

export async function kvGet<T>(key: string): Promise<{ value: T; fetchedAt: number } | undefined> {
  try { const r = await (await db()).get('kv', key); return r && { value: r.value as T, fetchedAt: r.fetchedAt } } catch { return undefined }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const d = await db()
    // writes are atomic per record, so an interrupted download never leaves a half-written entry
    await d.put('kv', { key, value, fetchedAt: Date.now(), size: JSON.stringify(value).length })
    if ((await d.count('kv')) > MAX_ENTRIES) await prune(d)
  } catch { /* quota or private mode: app keeps working without persistence */ }
}

async function prune(d: IDBPDatabase<Schema>) {
  const all = await d.getAll('kv')
  all.sort((a, b) => a.fetchedAt - b.fetchedAt)
  for (const r of all.slice(0, Math.ceil(all.length * 0.25))) await d.delete('kv', r.key)
}

export async function kvClear() { try { await (await db()).clear('kv') } catch { /* ignore */ } }
export async function kvStats() { try { const a = await (await db()).getAll('kv'); return { entries: a.length, bytes: a.reduce((n, r) => n + r.size, 0) } } catch { return { entries: 0, bytes: 0 } } }
