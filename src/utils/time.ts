export const pad = (n: number) => String(n).padStart(2, '0')
export const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); return localYmd(new Date(y, m - 1, d + n)) }
export const timeLocal = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const dateLocal = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
export function dayLabel(ymd: string, today = localYmd(new Date())) {
  if (ymd === today) return 'Today'
  if (ymd === addDays(today, -1)) return 'Yesterday'
  if (ymd === addDays(today, 1)) return 'Tomorrow'
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}
export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}
