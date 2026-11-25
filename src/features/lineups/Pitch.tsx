import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LineupPlayer, TeamLineup } from '../../services/football/types'
import { layoutFormation } from './layout'
import { cx } from '../../components/ui'

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase()

/** Pitch markings: SVG, scales to any width. */
function PitchLines() {
  const L = 'rgba(255,255,255,.55)'
  return (
    <svg viewBox="0 0 100 150" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d5c36" /><stop offset="1" stopColor="#0a4a2b" /></linearGradient>
      </defs>
      <rect width="100" height="150" fill="url(#turf)" />
      {Array.from({ length: 8 }).map((_, i) => <rect key={i} y={i * 18.75} width="100" height="9.375" fill="rgba(255,255,255,.035)" />)}
      <g fill="none" stroke={L} strokeWidth=".5" vectorEffect="non-scaling-stroke">
        <rect x="3" y="3" width="94" height="144" />
        <line x1="3" y1="75" x2="97" y2="75" />
        <circle cx="50" cy="75" r="12" /><circle cx="50" cy="75" r=".8" fill={L} />
        {/* penalty boxes + goal areas + arcs */}
        <rect x="22" y="3" width="56" height="23" /><rect x="35" y="3" width="30" height="9" /><path d="M41 26 A12 12 0 0 0 59 26" />
        <rect x="22" y="124" width="56" height="23" /><rect x="35" y="138" width="30" height="9" /><path d="M41 124 A12 12 0 0 1 59 124" />
        {/* goals / posts */}
        <rect x="43" y="0.2" width="14" height="2.8" strokeWidth=".7" /><rect x="43" y="147" width="14" height="2.8" strokeWidth=".7" />
      </g>
    </svg>
  )
}

export function Pitch({ lineup, teamName, onSelect, selectedKey }: { lineup: TeamLineup; teamName: string; onSelect: (p: LineupPlayer) => void; selectedKey?: string }) {
  const starters = lineup.players.filter((p) => p.starter)
  const subs = lineup.players.filter((p) => !p.starter)
  const placed = useMemo(() => layoutFormation(lineup.formation, starters), [lineup]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = (p: LineupPlayer) => `${p.id ?? p.name}`
  const [revealed] = useState(true)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[15px] font-bold">{teamName}</div>
        <div className="rounded-full bg-surface3 px-3 py-1 text-xs font-bold text-accent">{lineup.formation ?? 'Formation n/a'}</div>
      </div>

      {placed ? (
        <motion.div initial={revealed ? { clipPath: 'inset(0 0 100% 0)' } : false} animate={{ clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-3xl border border-line shadow-[var(--shadow)]" style={{ aspectRatio: '2 / 3' }} data-testid="pitch">
          <PitchLines />
          <AnimatePresence>
            {placed.map(({ player: p, x, y }, i) => (
              <motion.button key={key(p)} aria-label={`${p.name}, ${p.position ?? ''}, number ${p.jersey ?? ''}`} onClick={() => onSelect(p)} data-testid="pitch-player"
                initial={{ opacity: 0, scale: 0.4, left: '50%', top: '92%' }} animate={{ opacity: 1, scale: 1, left: `${x}%`, top: `${y}%` }} exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24, delay: i * 0.025 }} whileTap={{ scale: 0.92 }}
                className="absolute z-10 grid -translate-x-1/2 -translate-y-1/2 justify-items-center gap-0.5" style={{ width: '22%' }}>
                <span className={cx('relative grid h-[clamp(34px,10.5vw,50px)] w-[clamp(34px,10.5vw,50px)] place-items-center overflow-hidden rounded-full border-2 bg-surface3 text-[11px] font-extrabold text-ink shadow-lg transition-all', selectedKey === key(p) ? 'scale-110 border-accent ring-4 ring-accent/40' : 'border-white/80')}>
                  <span className="absolute inset-0 grid place-items-center">{initials(p.name)}</span>
                  {p.photo && <img src={p.photo} alt="" loading="lazy" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
                </span>
                <span className="absolute -top-0.5 right-[22%] grid h-4 min-w-4 place-items-center rounded-full bg-bg px-1 text-[9px] font-extrabold text-ink">{p.jersey}</span>
                <span className="max-w-full truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{p.name.split(' ').slice(-1)[0]}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="card p-4 text-sm text-muted">
          <p className="mb-3">The data source supplied a squad but not enough position information to draw this formation accurately, so we're showing the starters as a list rather than guessing where they stood.</p>
          <ul className="grid gap-1">{starters.map((p) => <li key={key(p)}><button className="w-full rounded-xl px-3 py-2 text-left text-ink hover:bg-surface2" onClick={() => onSelect(p)}>{p.jersey} · {p.name} <span className="text-muted">{p.position}</span></button></li>)}</ul>
        </div>
      )}

      {subs.length > 0 && (
        <div className="mt-5">
          <div className="eyebrow mb-2">Substitutes</div>
          <div className="grid grid-cols-2 gap-2">
            {subs.map((p) => (
              <button key={key(p)} onClick={() => onSelect(p)} className="card flex items-center gap-3 px-3 py-2 text-left">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-surface3 text-xs font-bold">{p.jersey}</span>
                <span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{p.name}</span><span className="text-[11px] text-muted">{p.position}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
