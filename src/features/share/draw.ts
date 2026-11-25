import type { PlayerCandidate, Scorer, ShareData, Side } from './model'
import { splitName } from './model'
import type { Loaded } from './images'
import type { Team } from '../../services/football/types'
import { COLOR, FONT_FAMILY, FORMATS, HAIR, MARGIN, SPACE, TYPE, WEIGHT, type FormatId } from './tokens'

export { FORMATS, type FormatId }
export type MatchTemplateId = 'result' | 'scorers' | 'fan'
export type PlayerTemplateId = 'spotlight'
export const MATCH_TEMPLATES: { id: MatchTemplateId; label: string }[] = [{ id: 'result', label: 'Result' }, { id: 'scorers', label: 'Scorers' }, { id: 'fan', label: 'Fan' }]
export const PLAYER_TEMPLATES: { id: PlayerTemplateId; label: string }[] = [{ id: 'spotlight', label: 'Spotlight' }]

export interface RenderInput {
  kind: 'match' | 'player'
  format: FormatId
  template: MatchTemplateId | PlayerTemplateId
  data: ShareData
  showScorers: boolean
  showMinutes: boolean
  highlight: Side
  player?: PlayerCandidate
  headline?: string
  background: 'atmosphere' | 'photo'
  /** credit lines printed on the poster (data credit, image credits, licence statement) */
  credits: string[]
  imgs: { home: Loaded | null; away: Loaded | null; bg: Loaded | null; portrait: Loaded | null; logo: Loaded | null }
}

// ───────────────────────── layout ─────────────────────────
interface L { W: number; H: number; x0: number; x1: number; cx: number; top: number; bottom: number; h: number; f: number }
const layoutFor = (fmt: FormatId): L => {
  const F = FORMATS[fmt], top = F.safeTop, bottom = F.h - F.safeBottom, h = bottom - top
  return { W: F.w, H: F.h, x0: MARGIN, x1: F.w - MARGIN, cx: F.w / 2, top, bottom, h, f: Math.min(1, h / 1350) }
}

// ───────────────────────── test hook (verifies safe areas / collisions in the suite; inert in production) ─────────────────────────
interface Dbg { texts: { t: string; x: number; y: number; w: number; h: number }[]; meta: Record<string, unknown> }
const dbg = (): Dbg | undefined => (globalThis as unknown as { __mishShareDebug?: Dbg }).__mishShareDebug

// ───────────────────────── text primitives ─────────────────────────
type Align = 'left' | 'center' | 'right'
interface TO { size: number; weight?: number; color?: string; alpha?: number; align?: Align; maxW?: number; min?: number; track?: number; ls?: number; optical?: boolean }
const lsOk = (ctx: CanvasRenderingContext2D) => 'letterSpacing' in ctx
function font(ctx: CanvasRenderingContext2D, size: number, weight: number, ls = 0) { ctx.font = `${weight} ${size}px ${FONT_FAMILY}`; if (lsOk(ctx)) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${ls}px` }
function width(ctx: CanvasRenderingContext2D, s: string, size: number, weight: number, track = 0, ls = 0) {
  font(ctx, size, weight, ls)
  if (!track) return ctx.measureText(s).width
  const chars = Array.from(s); return chars.reduce((n, c) => n + ctx.measureText(c).width, 0) + track * Math.max(0, chars.length - 1)
}
/** Draws one line of text; shrinks to fit maxW (down to `min`), ellipsises only as a last resort. Returns drawn width. */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, base: number, o: TO): number {
  const weight = o.weight ?? WEIGHT.text; let size = o.size, str = s
  const ls = o.ls ?? 0
  if (o.maxW) { while (width(ctx, str, size, weight, o.track, ls * size) > o.maxW && size > (o.min ?? o.size * 0.6)) size -= 2 }
  if (o.maxW) { while (width(ctx, str, size, weight, o.track, ls * size) > o.maxW && str.length > 2) str = str.slice(0, -1); if (str !== s) str = str.trimEnd() + '…' }
  const w = width(ctx, str, size, weight, o.track, ls * size)
  let left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
  let box = { x: 0, w: 0 }, hasBox = false
  if (o.optical) { font(ctx, size, weight, ls * size); const m = ctx.measureText(str); const inkL = left - m.actualBoundingBoxLeft, inkR = left + m.actualBoundingBoxRight; if (o.align === 'right') left += x - inkR; else if (o.align !== 'center') left += x - inkL; box = { x: left - m.actualBoundingBoxLeft, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight }; hasBox = true }
  ctx.save(); ctx.fillStyle = o.color ?? COLOR.ink; ctx.globalAlpha = o.alpha ?? 1; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  font(ctx, size, weight, ls * size)
  if (o.track) { let cx = left; for (const c of Array.from(str)) { ctx.fillText(c, cx, base); cx += ctx.measureText(c).width + o.track } }
  else ctx.fillText(str, left, base)
  ctx.restore()
  const d = dbg(); if (d) d.texts.push({ t: str, x: hasBox ? box.x : left, y: base - size * 0.78, w: hasBox ? box.w : w, h: size * 0.78 + (/[gjpqy,;()]/.test(str) ? size * 0.14 : size * 0.02) })
  return w
}
/** words, with a break opportunity after a hyphen ("Wolverhampton-Wanderers"); joinW glues those pieces back without a space */
const splitWords = (s: string) => s.split(/\s+/).flatMap((w) => (w.includes('-') ? w.split(/(?<=-)(?=.)/) : [w]))
const joinW = (a: string, b: string) => (a.endsWith('-') ? a + b : `${a} ${b}`)
/** Wraps display text into at most `maxLines`, shrinking the size (not the line count) if it still doesn't fit. */
function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number, size: number, weight: number, maxLines: number, min: number, ls = 0): { lines: string[]; size: number } {
  for (let sz = size; sz >= min; sz -= 2) {
    const words = splitWords(s), lines: string[] = []; let cur = ''
    for (const w of words) { const t = cur ? joinW(cur, w) : w; if (width(ctx, t, sz, weight, 0, ls * sz) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w } }
    if (cur) lines.push(cur)
    if (lines.length <= maxLines && lines.every((l) => width(ctx, l, sz, weight, 0, ls * sz) <= maxW)) return { lines, size: sz }
  }
  const words = splitWords(s), lines: string[] = []; let cur = ''
  for (const w of words) { const t = cur ? joinW(cur, w) : w; if (width(ctx, t, min, weight, 0, ls * min) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w } }
  if (cur) lines.push(cur)
  while (lines.length > maxLines) { const last = lines.pop()!; lines[lines.length - 1] = joinW(lines[lines.length - 1], last) }
  return { lines, size: min }
}
const hair = (ctx: CanvasRenderingContext2D, l: L, y: number, len = l.x1 - l.x0) => { ctx.save(); ctx.fillStyle = COLOR.hair; ctx.fillRect(l.x0, y, len, HAIR); ctx.restore() }
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
const hexOf = (c?: string) => (c ? `#${c}` : undefined)
function lum(h: string) { const n = parseInt(h.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 }
function mix(h: string, into: string, k: number) { const a = parseInt(h.slice(1), 16), b = parseInt(into.slice(1), 16); const c = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k); return `rgb(${c(16)},${c(8)},${c(0)})` }

/** Dark, saturated version of a team colour (keeps hue + richness; plain mixing with black turns it grey). Neutral colours fall back to graphite. */
function deepen(hex: string): string | null {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (d < 0.08) return null
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360
  const sat = Math.min(0.62, Math.max(0.4, d / (1 - Math.abs(mx + mn - 1) || 1))), L = 0.15
  const c = (1 - Math.abs(2 * L - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m0 = L - c / 2
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return `rgb(${Math.round((R + m0) * 255)},${Math.round((G + m0) * 255)},${Math.round((B + m0) * 255)})`
}
function crest(ctx: CanvasRenderingContext2D, im: Loaded | null, name: string, cx: number, cy: number, size: number, alpha = 1) {
  const d = dbg(); if (d) (d.meta.crests as string[] | undefined)?.push(im ? im.source : 'fallback')
  ctx.save(); ctx.globalAlpha = alpha
  if (im) { const k = Math.min(size / im.w, size / im.h); ctx.drawImage(im.img, cx - (im.w * k) / 2, cy - (im.h * k) / 2, im.w * k, im.h * k) }
  else { // intentional fallback: a quiet ring with initials, same footprint as a crest
    ctx.strokeStyle = COLOR.ink; ctx.lineWidth = HAIR * 2; ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2); ctx.stroke()
    text(ctx, initials(name), cx, cy + size * 0.13, { size: size * 0.36, weight: WEIGHT.display, align: 'center' })
  }
  ctx.restore()
}

// ───────────────────────── shared poster parts ─────────────────────────
const dateShort = (d: ShareData) => new Date(d.match.kickoffUtc).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()
const nameOf = (t: Team) => t.name

/** Meta row + status line + hairline. Returns the y where content may start. */
function header(ctx: CanvasRenderingContext2D, l: L, inp: RenderInput, o: { accentStatus: boolean; accent?: string }): number {
  const { data } = inp, base = l.top + TYPE.label.size
  text(ctx, (data.competition ?? '').toUpperCase(), l.x0, base, { ...TYPE.label, color: COLOR.muted, maxW: (l.x1 - l.x0) * 0.62, min: 18 })
  text(ctx, dateShort(data), l.x1, base, { ...TYPE.label, color: COLOR.muted, align: 'right' })
  const st = data.status, sb = base + SPACE.s6 + SPACE.s1
  const live = st.kind === 'live', col = live ? COLOR.live : o.accentStatus && st.kind === 'final' ? (o.accent ?? COLOR.accent) : COLOR.ink
  const label = st.kind === 'stale' ? 'LAST SCORE' : st.label
  ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(l.x0 + 7, sb - TYPE.label.size * 0.34, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  const w = text(ctx, label, l.x0 + SPACE.s4, sb, { ...TYPE.label, color: col })
  if (st.note) text(ctx, st.note.toUpperCase(), l.x1, sb, { ...TYPE.label, color: COLOR.muted, align: 'right', maxW: l.x1 - l.x0 - w - SPACE.s8, min: 16 })
  const hy = sb + SPACE.s4; hair(ctx, l, hy); return hy + HAIR
}
function footer(ctx: CanvasRenderingContext2D, l: L, inp: RenderInput, o: { rule?: boolean; center?: boolean } = {}) {
  const base = l.bottom - SPACE.s1
  if (o.rule !== false) hair(ctx, l, l.bottom - SPACE.s12 + SPACE.s1)
  const lh = 44, logo = inp.imgs.logo
  if (o.center) { text(ctx, 'MISHPLAY', l.cx, base, { ...TYPE.label, color: COLOR.muted, align: 'center' }); return }
  let x = l.x0
  if (logo) { const k = lh / logo.h; ctx.drawImage(logo.img, x, base - lh + 6, logo.w * k, lh); x += logo.w * k + SPACE.s2 }
  const wm = text(ctx, 'MishPlay', x, base - 6, { size: TYPE.small.size, weight: WEIGHT.display })
  const lines = (inp.credits.length ? inp.credits : ['Data: ESPN']).slice(0, 3), cl = 28
  lines.forEach((t, i) => text(ctx, t, l.x1, base - 6 - (lines.length - 1 - i) * cl, { size: 21, weight: WEIGHT.text, color: COLOR.muted, align: 'right', maxW: 600, min: 15 }))
}
const footerTop = (l: L) => l.bottom - SPACE.s12 + SPACE.s1

function scoreOf(inp: RenderInput, side: Side) { const m = inp.data.match; return side === 'home' ? m.homeScore! : m.awayScore! }
const dimFor = (inp: RenderInput, side: Side) => (inp.data.leader && inp.data.leader !== 'level' && inp.data.leader !== side ? COLOR.dimAlpha : 1)

function surnameItem(s: Scorer, showMinutes: boolean): string {
  const nm = splitName(s.name).surname + (s.ownGoals ? ' (OG)' : '')
  return showMinutes && s.minutes.length ? `${nm} ${s.minutes.join(' ')}` : s.goals > 1 ? `${nm} ×${s.goals}` : nm
}
/** Greedy-flow scorer items into lines; if they don't fit in `maxLines`, the tail becomes "+N more". */
function clip(ctx: CanvasRenderingContext2D, s: string, maxW: number, size: number) { if (width(ctx, s, size, WEIGHT.text) <= maxW) return s; let t = s; while (width(ctx, t + '…', size, WEIGHT.text) > maxW && t.length > 2) t = t.slice(0, -1); return t.trimEnd() + '…' }
function flow(ctx: CanvasRenderingContext2D, rawItems: string[], maxW: number, size: number, maxLines: number): string[][] {
  const items = rawItems.map((t) => clip(ctx, t, maxW, size))
  const sepW = SPACE.s3 * 2 + 6, fits = (arr: string[]) => arr.reduce((n, t) => n + width(ctx, t, size, WEIGHT.text), 0) + sepW * Math.max(0, arr.length - 1) <= maxW
  const lines: string[][] = []; let cur: string[] = [], used = 0
  for (let i = 0; i < items.length; i++) {
    const t = items[i]
    if (cur.length && !fits([...cur, t])) { lines.push(cur); cur = [] }
    cur.push(t); used = i + 1
    if (lines.length === maxLines) break
  }
  if (cur.length) lines.push(cur)
  if (lines.length > maxLines || used < items.length) {
    const keep = lines.slice(0, maxLines); const placed = keep.flat().length, rest = items.length - placed
    if (rest > 0) {
      const last = keep[keep.length - 1], moreW = (n: number) => width(ctx, `+${n} more`, size, WEIGHT.text) + sepW
      while (last.length > 1 && !fits([...last]) ) last.pop()
      while (last.length > 1 && last.reduce((n, t) => n + width(ctx, t, size, WEIGHT.text), 0) + sepW * (last.length - 1) + moreW(99) > maxW) last.pop()
      if (last.reduce((n, t) => n + width(ctx, t, size, WEIGHT.text), 0) + sepW * (last.length - 1) + moreW(99) > maxW) last[0] = clip(ctx, last[0], maxW - moreW(99), size)
      last.push(`+${items.length - keep.flat().length} more`)
    }
    return keep
  }
  return lines
}
function drawFlow(ctx: CanvasRenderingContext2D, lines: string[][], x: number, y: number, size: number, lh: number, alpha: number) {
  lines.forEach((ln, i) => {
    let cx = x; const base = y + i * lh
    ln.forEach((t, k) => {
      if (k) { cx += SPACE.s3; text(ctx, '·', cx, base, { size, weight: WEIGHT.display, color: COLOR.muted }); cx += 6 + SPACE.s3 }
      cx += text(ctx, t, cx, base, { size, weight: t.startsWith('+') ? WEIGHT.text : WEIGHT.text, color: t.startsWith('+') ? COLOR.muted : COLOR.ink, alpha })
    })
  })
}
function incompleteNote(d: ShareData): string {
  if (d.detailPending) return ''
  const total = (d.match.homeScore ?? 0) + (d.match.awayScore ?? 0)
  if (!total) return ''
  return !d.scorers.length ? 'Scorer details unavailable' : d.scorersComplete ? '' : 'Some goal details unavailable'
}

// ───────────────────────── backdrop: blurred photo, or the brand's own atmosphere ─────────────────────────
function drawCover(ctx: CanvasRenderingContext2D, im: Loaded, x: number, y: number, w: number, h: number, fx = 0.5, fy = 0.5) {
  const k = Math.max(w / im.w, h / im.h), dw = im.w * k, dh = im.h * k
  ctx.drawImage(im.img, x - (dw - w) * fx, y - (dh - h) * fy, dw, dh)
}
/** Blur by down/up-scaling (Safari's canvas has no ctx.filter). `strength` = how many times smaller the intermediate is. */
function blurredCover(ctx: CanvasRenderingContext2D, im: Loaded, W: number, H: number, strength: number, fx = 0.5, fy = 0.5) {
  const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); const x = c.getContext('2d')!; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; return { c, x } }
  const a = mk(W / strength, H / strength); drawCover(a.x, im, 0, 0, a.c.width, a.c.height, fx, fy)
  const b = mk(W / (strength / 2.4), H / (strength / 2.4)); b.x.drawImage(a.c, 0, 0, b.c.width, b.c.height)
  const c2 = mk(W / (strength / 5), H / (strength / 5)); c2.x.drawImage(b.c, 0, 0, c2.c.width, c2.c.height)
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c2.c, 0, 0, W, H); ctx.restore()
}
function grain(ctx: CanvasRenderingContext2D, W: number, H: number, alpha = 0.07) {
  const t = document.createElement('canvas'); t.width = t.height = 256; const x = t.getContext('2d')!, d = x.createImageData(256, 256); let s = 1234567
  for (let i = 0; i < d.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = (s >>> 24); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 }
  x.putImageData(d, 0, 0)
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = ctx.createPattern(t, 'repeat')!; ctx.fillRect(0, 0, W, H); ctx.restore()
}
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgba: string) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba); g.addColorStop(1, 'rgba(180,210,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2) }
/** MishPlay's own atmosphere: floodlight glow, pitch stripes receding to a horizon, grain. Always licence-free (drawn, not sourced). */
function atmosphere(ctx: CanvasRenderingContext2D, l: L) {
  const { W, H } = l, g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0A1220'); g.addColorStop(0.55, '#070B12'); g.addColorStop(1, COLOR.bg)
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  glow(ctx, W * 0.18, 0, 900, 'rgba(180,210,255,0.22)'); glow(ctx, W * 0.88, 0, 900, 'rgba(180,210,255,0.15)')
  const hz = H * 0.56, step = 230, sg = ctx.createLinearGradient(0, hz, 0, H); sg.addColorStop(0, 'rgba(0,230,118,0)'); sg.addColorStop(1, 'rgba(0,230,118,0.085)')
  ctx.fillStyle = sg
  for (let i = -8; i <= 8; i += 2) { const bx = W / 2 + i * step, ex = W / 2 + (i + 1) * step, k = 0.12; ctx.beginPath(); ctx.moveTo(W / 2 + (bx - W / 2) * k, hz); ctx.lineTo(W / 2 + (ex - W / 2) * k, hz); ctx.lineTo(ex, H); ctx.lineTo(bx, H); ctx.closePath(); ctx.fill() }
  grain(ctx, W, H)
}
/** Dark grade over a photo so the foreground stays readable: heavy at the top/bottom (header, footer), lighter mid. */
function grade(ctx: CanvasRenderingContext2D, l: L, base = 0.4) {
  ctx.fillStyle = `rgba(6,8,11,${base})`; ctx.fillRect(0, 0, l.W, l.H)
  const g = ctx.createLinearGradient(0, 0, 0, l.H); g.addColorStop(0, 'rgba(6,8,11,0.82)'); g.addColorStop(0.3, 'rgba(6,8,11,0.12)'); g.addColorStop(0.58, 'rgba(6,8,11,0.18)'); g.addColorStop(1, 'rgba(6,8,11,0.94)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, l.W, l.H)
}
function backdrop(ctx: CanvasRenderingContext2D, l: L, inp: RenderInput) {
  const d = dbg(); const src = inp.kind === 'player' && inp.imgs.portrait ? inp.imgs.portrait : inp.background === 'photo' ? inp.imgs.bg : null
  if (d) d.meta.backdrop = src ? (inp.kind === 'player' && inp.imgs.portrait ? 'portrait-blur' : 'photo-blur') : 'atmosphere'
  if (!src) { atmosphere(ctx, l); return }
  ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, l.W, l.H)
  blurredCover(ctx, src, l.W, l.H, inp.kind === 'player' ? 30 : 16, 0.5, inp.kind === 'player' ? 0.2 : 0.5)
  grade(ctx, l, inp.kind === 'player' ? 0.5 : 0.38); grain(ctx, l.W, l.H, 0.06)
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h) }

// ═════════════════════════ A/B. MATCH RESULT (side by side) ═════════════════════════
/** crest + name | score | crest + name, straight on the background. Returns the block's bottom y. */
function scoreband(ctx: CanvasRenderingContext2D, l: L, inp: RenderInput, top: number, bandH: number): number {
  const m = inp.data.match, W = l.x1 - l.x0, pad = 28, inner = W - pad * 2, side = 262, mid = inner - side * 2, cy = top + bandH / 2
  // no box: the scoreline sits directly on the (blurred, graded) background
  const cs = Math.min(176, bandH * 0.36), nsz = 34
  ;(['home', 'away'] as Side[]).forEach((sd) => {
    const t = sd === 'home' ? m.home : m.away, dim = dimFor(inp, sd), cx = sd === 'home' ? l.x0 + pad + side / 2 : l.x1 - pad - side / 2
    const w = wrap(ctx, nameOf(t).toUpperCase(), side - 28, nsz, WEIGHT.display, 2, 22, -0.01), lh = w.size * 1.1, block = cs + SPACE.s3 + w.lines.length * lh, y = cy - block / 2
    crest(ctx, sd === 'home' ? inp.imgs.home : inp.imgs.away, t.name, cx, y + cs / 2, cs, dim)
    w.lines.forEach((ln, k) => text(ctx, ln, cx, y + cs + SPACE.s3 + w.size * 0.8 + k * lh, { size: w.size, weight: WEIGHT.display, ls: -0.01, align: 'center', alpha: dim, maxW: side - 28, min: 20 }))
  })
  // score: both numerals + dash, centred in the middle column; shrinks for 2-digit scores
  const hs = String(m.homeScore), as = String(m.awayScore)
  let sz = 250; const gap = 22, dashW = (s: number) => s * 0.34
  const total = (s: number) => width(ctx, hs, s, WEIGHT.display, 0, -0.03 * s) + width(ctx, as, s, WEIGHT.display, 0, -0.03 * s) + dashW(s) + gap * 2
  while (total(sz) > mid - 8 && sz > 90) sz -= 6
  const capH = sz * 0.72, x0 = l.cx - total(sz) / 2, base = cy + capH / 2, hw = width(ctx, hs, sz, WEIGHT.display, 0, -0.03 * sz)
  text(ctx, hs, x0, base, { size: sz, weight: WEIGHT.display, ls: -0.03, alpha: dimFor(inp, 'home') })
  ctx.save(); ctx.fillStyle = COLOR.muted; ctx.fillRect(x0 + hw + gap, cy - 4, dashW(sz), 8); ctx.restore()
  text(ctx, as, x0 + hw + gap * 2 + dashW(sz), base, { size: sz, weight: WEIGHT.display, ls: -0.03, alpha: dimFor(inp, 'away') })
  return top + bandH
}
const BAND_H = 440

function tResult(ctx: CanvasRenderingContext2D, l: L, inp: RenderInput) {
  const y0 = header(ctx, l, inp, { accentStatus: true }), ft = footerTop(l)
  const h = Math.min(BAND_H + 60, ft - y0 - SPACE.s12), top = y0 + (ft - y0 - h) / 2
  scoreband(ctx, l, inp, top, h)
  footer(ctx, l, inp)
}

/** one scorer per line, centred in its column: surname + minutes (minutes in the muted tone) */
function scorerLine(ctx: CanvasRenderingContext2D, s: Scorer, showMinutes: boolean, cx: number, base: number, maxW: number, alpha: number, size: number) {
  const nm = splitName(s.name).surname + (s.ownGoals ? ' (OG)' : ''), mins = showMinutes && s.minutes.length ? s.minutes.join(' ') : s.goals > 1 ? `×${s.goals}` : ''
  let sz = size, name = nm; const gap = 12, tw = (z: number) => width(ctx, name, z, WEIGHT.text) + (mins ? gap + width(ctx, mins, z, WEIGHT.text) : 0)
  while (tw(sz) > maxW && sz > 28) sz -= 2
  if (tw(sz) > maxW) { const base = nm.replace(/…$/, ''); let n = base.length; while (n > 3 && (name = base.slice(0, n).trimEnd() + '…', tw(sz) > maxW)) n-- }   // last resort only
  const total = width(ctx, name, sz, WEIGHT.text) + (mins ? gap + width(ctx, mins, sz, WEIGHT.text) : 0), x = cx - total / 2
  const w = text(ctx, name, x, base, { size: sz, weight: WEIGHT.text, alpha })
  if (mins) text(ctx, mins, x + w + gap, base, { size: sz, weight: WEIGHT.text, color: COLOR.muted, alpha })
}

function tScorers(ctx: CanvasRenderingContext2D, l: L, inp: RenderInput) {
  const { data } = inp, y0 = header(ctx, l, inp, { accentStatus: true }), ft = footerTop(l)
  const note = inp.showScorers ? incompleteNote(data) : ''
  const bandH = l.f > 0.95 ? BAND_H : 400, gap = SPACE.s8, lh = 58, size = 40
  const avail = ft - y0 - SPACE.s6, noteH = note ? SPACE.s6 : 0
  const cap = inp.showScorers ? Math.max(1, Math.floor((avail - bandH - gap - noteH) / lh)) : 0
  const lines = inp.showScorers ? Math.min(cap, Math.max(1, ...(['home', 'away'] as Side[]).map((sd) => data.scorers.filter((x) => x.side === sd).length))) : 0
  const colH = lines * lh, block = bandH + (lines ? gap : 0) + colH + noteH, top = y0 + Math.max(SPACE.s3, (avail - block) / 2)
  const bandBottom = scoreband(ctx, l, inp, top, bandH)
  if (inp.showScorers) {
    const W = l.x1 - l.x0, colW = (W - SPACE.s6) / 2, cxs = { home: l.x0 + colW / 2, away: l.x1 - colW / 2 }
    ;(['home', 'away'] as Side[]).forEach((sd) => {
      const list = data.scorers.filter((s) => s.side === sd), cap = list.length > lines ? Math.max(0, lines - 1) : lines
      const shown = list.slice(0, cap), more = list.length - shown.length, alpha = dimFor(inp, sd)
      const y = bandBottom + gap + size * 0.8
      shown.forEach((s, i) => scorerLine(ctx, s, inp.showMinutes, cxs[sd], y + i * lh, colW, alpha === 1 ? 1 : 0.8, size))
      if (more > 0) text(ctx, `+${more} more`, cxs[sd], y + shown.length * lh, { size: 32, weight: WEIGHT.text, color: COLOR.muted, align: 'center' })
    })
    if (note) text(ctx, note, l.cx, bandBottom + gap + colH + SPACE.s3, { ...TYPE.label, color: COLOR.muted, align: 'center', maxW: l.x1 - l.x0, min: 16 })
  }
  footer(ctx, l, inp)
}

// ═════════════════════════ D. FAN CELEBRATION ═════════════════════════
function tFan(ctx: CanvasRenderingContext2D, l: L, inp: RenderInput) {
  const { data } = inp, m = data.match, side = inp.highlight
  const t = side === 'home' ? m.home : m.away, o = side === 'home' ? m.away : m.home
  const team = hexOf(t.color), field = (team && deepen(team)) || '#0E131B', edge = team && lum(team) > 0.22 ? team : COLOR.accent
  ctx.fillStyle = field; ctx.fillRect(0, 0, l.W, l.H)
  ctx.fillStyle = edge; ctx.fillRect(l.x0, l.top, l.x1 - l.x0, HAIR * 2)                       // the one accent: a rule in the club's own colour
  const compact = l.f < 0.95
  let y = l.top + SPACE.s8
  text(ctx, 'I SUPPORT', l.cx, y, { ...TYPE.label, color: COLOR.ink, align: 'center', alpha: 0.75 })
  const cs = compact ? 288 : 384, cy = y + SPACE.s8 + cs / 2
  crest(ctx, side === 'home' ? inp.imgs.home : inp.imgs.away, t.name, l.cx, cy, cs)
  const w = wrap(ctx, t.name.toUpperCase(), l.x1 - l.x0, (compact ? 96 : 112), WEIGHT.display, 2, 56, -0.02), lh = w.size * 1.04
  y = cy + cs / 2 + SPACE.s8 + w.size * 0.8
  w.lines.forEach((ln, k) => text(ctx, ln, l.cx, y + k * lh, { size: w.size, weight: WEIGHT.display, ls: -0.02, align: 'center', maxW: l.x1 - l.x0, min: 30 }))
  y += (w.lines.length - 1) * lh + SPACE.s12
  const ts = scoreOf(inp, side), os = scoreOf(inp, side === 'home' ? 'away' : 'home'), st = data.status.kind
  const verb = st === 'final' ? (ts > os ? 'WIN' : ts < os ? 'DEFEAT' : 'DRAW') : st === 'stale' ? 'LAST SCORE' : st === 'halftime' ? 'HALF TIME' : 'LIVE'
  text(ctx, `${verb}  ${ts}–${os}`, l.cx, y, { size: 60, weight: WEIGHT.display, align: 'center', maxW: l.x1 - l.x0, min: 30 })
  y += SPACE.s6 + SPACE.s2
  text(ctx, `v ${nameOf(o)}`, l.cx, y, { size: TYPE.small.size, weight: WEIGHT.text, color: COLOR.ink, alpha: 0.7, align: 'center', maxW: l.x1 - l.x0, min: 22 })
  // footer stack (bottom-anchored): date, then wordmark — fixed rhythm, nothing floats
  const wordY = l.bottom - SPACE.s1, dateY = wordY - SPACE.s6
  const mine = inp.showScorers ? data.scorers.filter((sc) => sc.side === side) : []
  const slh = TYPE.small.size * 1.5, sy = y + SPACE.s8 + SPACE.s2
  const fit = Math.floor((dateY - SPACE.s8 - sy) / slh) + 1
  if (mine.length && fit >= 1) { const lines = flow(ctx, mine.map((sc) => surnameItem(sc, inp.showMinutes)), l.x1 - l.x0 - SPACE.s12, TYPE.small.size, Math.min(2, fit)); drawFlowCentered(ctx, lines, l, sy, TYPE.small.size, slh) }
  text(ctx, dateShort(data), l.cx, dateY, { ...TYPE.label, color: COLOR.ink, alpha: 0.6, align: 'center' })
  text(ctx, 'MISHPLAY', l.cx, wordY, { ...TYPE.label, color: COLOR.ink, alpha: 0.9, align: 'center' })
}
function drawFlowCentered(ctx: CanvasRenderingContext2D, lines: string[][], l: L, y: number, size: number, lh: number) {
  lines.forEach((ln, i) => {
    const total = ln.reduce((n, t) => n + width(ctx, t, size, WEIGHT.text), 0) + (SPACE.s3 * 2 + 6) * Math.max(0, ln.length - 1); let cx = l.cx - total / 2
    ln.forEach((t, k) => { if (k) { cx += SPACE.s3; text(ctx, '·', cx, y + i * lh, { size, weight: WEIGHT.display, alpha: 0.6 }); cx += 6 + SPACE.s3 } cx += text(ctx, t, cx, y + i * lh, { size, weight: WEIGHT.text, alpha: 0.85 }) })
  })
}
// ═════════════════════════ C / E. PLAYER SPOTLIGHT ═════════════════════════
/** With a licence-clean portrait: blurred copy as the atmosphere + the sharp portrait in a clean frame (p2). Without: typography-led (p3). */
function tSpotlight(ctx: CanvasRenderingContext2D, l: L, inp: RenderInput) {
  const { data } = inp, m = data.match, p = inp.player!, team = p.side === 'home' ? m.home : m.away, crestImg = p.side === 'home' ? inp.imgs.home : inp.imgs.away
  const { first, surname } = splitName(p.name), photo = inp.imgs.portrait
  const d = dbg(); if (d) d.meta.photo = photo ? photo.source : 'fallback'
  const goals = p.goals, hasGoals = goals > 0, W = l.x1 - l.x0
  const mb = l.top + TYPE.label.size
  text(ctx, (data.competition ?? '').toUpperCase(), l.x0, mb, { ...TYPE.label, color: COLOR.muted, maxW: W * 0.62, min: 18 })
  text(ctx, dateShort(data), l.x1, mb, { ...TYPE.label, color: COLOR.muted, align: 'right' })
  const ft = footerTop(l), st = data.status, sl = st.kind === 'stale' ? 'LAST SCORE' : st.label
  const minutes = inp.showMinutes && p.minutes.length ? p.minutes.join('   ') : inp.showMinutes && goals > 1 ? `×${goals}` : ''
  // bottom block (match context), anchored above the footer
  const matchY = ft - SPACE.s6
  const ctxLine = () => {
    hair(ctx, l, matchY - SPACE.s12 + SPACE.s2)
    text(ctx, `${m.home.name} ${m.homeScore}–${m.awayScore} ${m.away.name}`, l.x0, matchY - SPACE.s3, { size: TYPE.small.size, weight: WEIGHT.display, maxW: W, min: 22 })
    text(ctx, [sl, st.note].filter(Boolean).join(' · ').toUpperCase(), l.x0, matchY + SPACE.s2, { ...TYPE.label, size: 22, color: st.kind === 'live' ? COLOR.live : COLOR.muted, maxW: W, min: 14 })
  }
  const label = hasGoals ? (goals === 1 ? 'GOAL' : 'GOALS') : ''
  const headline = inp.headline ?? ''

  if (photo) {
    // p2: framed sharp portrait over its own blurred copy
    const rest = SPACE.s12 + SPACE.s8 + (first ? 36 : 0) + 112 + SPACE.s3 + 64 + SPACE.s6 + SPACE.s12 + SPACE.s4
    const area = matchY - SPACE.s12 - (mb + SPACE.s6), fs = Math.max(360, Math.min(780, area - rest + SPACE.s12 + 120, W)), fx = l.cx - fs / 2, fy = mb + SPACE.s6
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 28; rr(ctx, fx, fy, fs, fs, 44); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore()
    ctx.save(); rr(ctx, fx, fy, fs, fs, 44); ctx.clip(); ctx.imageSmoothingQuality = 'high'; drawCover(ctx, photo, fx, fy, fs, fs, 0.5, 0.16); ctx.restore()
    let y = fy + fs + SPACE.s6
    if (first) { text(ctx, first.toUpperCase(), l.cx, y + 22, { ...TYPE.label, color: '#CDD5E0', align: 'center' }); y += 36 }
    const w = wrap(ctx, surname.toUpperCase(), W, 112, WEIGHT.display, 1, 48, -0.02)
    text(ctx, w.lines.join(' '), l.cx, y + w.size * 0.82, { size: w.size, weight: WEIGHT.display, ls: -0.02, align: 'center', maxW: W, min: 40 }); y += w.size + SPACE.s3
    // goal line: crest · N GOALS · minutes (single row, centred)
    const cs = 56, gl = [label && `${goals} ${label}`, headline && !label ? headline : '', minutes].filter(Boolean)
    const row = [hasGoals ? `${goals} ${label}` : (headline || (p.jersey ? `#${p.jersey}` : ''))].filter(Boolean)[0] ?? ''
    const tail = minutes ? `  ·  ${minutes}` : ''
    const tw = (row ? width(ctx, row, 42, WEIGHT.display) : 0) + (tail ? width(ctx, tail, 42, WEIGHT.display) : 0), total = cs + SPACE.s3 + tw, rx = l.cx - total / 2
    crest(ctx, crestImg, team.name, rx + cs / 2, y + cs / 2 + 4, cs)
    const rw = row ? text(ctx, row, rx + cs + SPACE.s3, y + cs / 2 + 18, { size: 42, weight: WEIGHT.display, color: hasGoals ? COLOR.accent : COLOR.ink }) : 0
    if (tail) text(ctx, tail, rx + cs + SPACE.s3 + rw, y + cs / 2 + 18, { size: 42, weight: WEIGHT.display })
    void gl
    if (headline && hasGoals) text(ctx, headline, l.cx, y + cs + SPACE.s6, { ...TYPE.label, align: 'center', maxW: W, min: 16 })
    ctxLine()
  } else {
    // p3: typography-led. A ghosted shirt number is the only "image"; the crest + club carry the identity.
    if (p.jersey) { // decorative watermark: bleeds off the right edge on purpose, so it is not a layout-checked text run
      const gs = 1000 * Math.max(0.8, l.f); ctx.save(); font(ctx, gs, WEIGHT.display, -0.06 * gs); ctx.fillStyle = COLOR.ink; ctx.globalAlpha = 0.055; ctx.textAlign = 'right'; ctx.fillText(p.jersey, l.x1 + 90, l.top + 800 * Math.max(0.8, l.f)); ctx.restore()
    }
    if (d) d.meta.ghost = p.jersey ?? ''
    const nSize = TYPE.numeral.size * 1.1 * l.f, capH = nSize * 0.72
    const big = hasGoals ? String(goals) : p.jersey ?? ''
    const ny = l.top + SPACE.s16 + SPACE.s4 + capH
    if (big) text(ctx, big, l.x0, ny, { optical: true, size: nSize, weight: WEIGHT.display, ls: -0.03, color: hasGoals ? COLOR.ink : COLOR.muted, alpha: hasGoals ? 1 : 0.5 })
    const nW = big ? width(ctx, big, nSize, WEIGHT.display, 0, -0.03 * nSize) : 0
    if (hasGoals) text(ctx, label, l.x0 + nW + SPACE.s3, ny - 4, { ...TYPE.label, size: 30, color: COLOR.accent })
    else if (big) text(ctx, 'SHIRT', l.x0 + nW + SPACE.s3, ny - 4, { ...TYPE.label, size: 30, color: COLOR.muted })
    // club lockup
    const cs = 84, cyy = ny + SPACE.s8
    crest(ctx, crestImg, team.name, l.x0 + cs / 2, cyy + cs / 2, cs)
    text(ctx, [team.name.toUpperCase(), hasGoals && p.jersey ? `#${p.jersey}` : ''].filter(Boolean).join('  ·  '), l.x0 + cs + SPACE.s3, cyy + cs / 2 + 9, { ...TYPE.label, color: COLOR.muted, maxW: W - cs - SPACE.s3, min: 16 })
    // name block
    let y = cyy + cs + SPACE.s8
    if (first) { text(ctx, first.toUpperCase(), l.x0, y + 22, { ...TYPE.label, color: COLOR.muted }); y += SPACE.s6 }
    const w = wrap(ctx, surname.toUpperCase(), W, 150 * Math.max(0.8, l.f), WEIGHT.display, 2, 48, -0.02), lh = w.size * 1.02
    w.lines.forEach((ln, k) => text(ctx, ln, l.x0, y + w.size * 0.8 + k * lh, { size: w.size, weight: WEIGHT.display, ls: -0.02, maxW: W, min: 30 }))
    y += w.lines.length * lh + SPACE.s3
    if (headline) { text(ctx, headline, l.x0, y + SPACE.s3, { ...TYPE.label, color: COLOR.ink, maxW: W, min: 16 }); y += SPACE.s6 }
    if (minutes) text(ctx, minutes, l.x0, y + SPACE.s6, { size: 44, weight: WEIGHT.display, maxW: W, min: 24 })
    ctxLine()
  }
  footer(ctx, l, inp, { rule: false })
}

export function render(canvas: HTMLCanvasElement, inp: RenderInput) {
  const F = FORMATS[inp.format]; canvas.width = F.w; canvas.height = F.h
  const ctx = canvas.getContext('2d')!, l = layoutFor(inp.format)
  const d = dbg(); if (d) { d.texts = []; d.meta = { format: inp.format, w: F.w, h: F.h, template: inp.template, kind: inp.kind, safeTop: F.safeTop, safeBottom: F.h - F.safeBottom, margin: MARGIN, crests: [] } }
  ctx.save(); ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, F.w, F.h)
  if (inp.template !== 'fan') backdrop(ctx, l, inp)
  if (inp.kind === 'match') ({ result: tResult, scorers: tScorers, fan: tFan } as const)[inp.template as MatchTemplateId](ctx, l, inp)
  else tSpotlight(ctx, l, inp)
  ctx.restore()
}
