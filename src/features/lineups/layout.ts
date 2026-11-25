import type { LineupPlayer } from '../../services/football/types'

export interface Placed { player: LineupPlayer; x: number; y: number } // x,y in % (attacking upward, GK at bottom)

/** Depth bucket derived ONLY from the provider's position label (never guessed). */
function depth(pos?: string): number | undefined {
  if (!pos) return undefined
  const p = pos.toUpperCase()
  if (p === 'G' || p === 'GK') return 0
  if (/^(CD|CB|SW|RB|LB|RWB|LWB|D)/.test(p)) return 1
  if (/^(DM|CDM)/.test(p)) return 2
  if (/^(AM|CAM|LW|RW|SS)/.test(p)) return 4
  if (/^(CM|LM|RM|M)/.test(p)) return 3
  if (/^(F|ST|CF|LF|RF)/.test(p)) return 5
  return undefined
}
const side = (pos?: string) => (pos && /(^|-)L(?=[A-Z]|-|$)/i.test(pos) ? -1 : pos && /(^|-)R(?=[A-Z]|-|$)/i.test(pos) ? 1 : 0)

/**
 * Lay out 11 starters. Rows come from the formation string (e.g. 4-2-3-1); each player's row is chosen from
 * the provider's own position labels. If the data can't support a pitch (no formation / missing positions /
 * counts don't add up) returns null and the UI shows a list instead of fabricating positions.
 */
export function layoutFormation(formation: string | undefined, starters: LineupPlayer[]): Placed[] | null {
  if (!formation || starters.length !== 11) return null
  const counts = formation.split('-').map(Number)
  if (counts.some((n) => !Number.isInteger(n) || n < 1) || counts.reduce((a, b) => a + b, 0) !== 10) return null
  const gk = starters.filter((p) => depth(p.position) === 0)
  const field = starters.filter((p) => depth(p.position) !== 0)
  if (gk.length !== 1 || field.some((p) => depth(p.position) === undefined)) return null
  const sorted = [...field].sort((a, b) => depth(a.position)! - depth(b.position)! || (a.slot ?? 0) - (b.slot ?? 0))
  const rows = counts.length
  const out: Placed[] = [{ player: gk[0], x: 50, y: 92 }]
  let i = 0
  counts.forEach((n, r) => {
    const row = sorted.slice(i, i + n).sort((a, b) => side(a.position) - side(b.position) || (b.slot ?? 0) - (a.slot ?? 0))
    i += n
    // y: defence line ~75% → striker line ~14%
    const y = rows === 1 ? 45 : 76 - (r * (76 - 16)) / (rows - 1)
    row.forEach((p, k) => out.push({ player: p, x: ((k + 1) / (n + 1)) * 100, y }))
  })
  return out
}
