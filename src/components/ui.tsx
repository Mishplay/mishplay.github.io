import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Match } from '../services/football/types'
import { useOnline } from '../hooks/useSwr'
import { ago, timeLocal } from '../utils/time'

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ')

/** `maxVw` caps the width relative to the viewport (e.g. splash/welcome), so the logo can't dominate a small screen. */
export function Logo({ size = 28, maxVw }: { size?: number; maxVw?: number }) {
  return <img src="/mish-glyph.svg" alt="MishPlay" width={size} height={Math.round(size * 0.875)} style={{ width: maxVw ? `min(${size}px, ${maxVw}vw)` : size, height: 'auto' }} />
}

/** Club crest with initials fallback when the image is missing or fails to load. */
export function Crest({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const [bad, setBad] = useState(false)
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return src && !bad ? (
    <img src={src} alt="" width={size} height={size} loading="lazy" crossOrigin="anonymous" onError={() => setBad(true)} style={{ width: size, height: size, objectFit: 'contain' }} />
  ) : (
    <div aria-hidden className="grid place-items-center rounded-full bg-surface3 text-muted font-bold" style={{ width: size, height: size, fontSize: size * 0.34 }}>{initials}</div>
  )
}

/** `asOf` = when this match data was fetched. A match saved as live is NOT shown as live once it is offline or older than 3 minutes. */
export function StatusPill({ m, asOf }: { m: Pick<Match, 'status' | 'minute' | 'kickoffUtc' | 'rawStatus' | 'timeUnverified'>; asOf?: number }) {
  const online = useOnline()
  if ((m.status === 'live' || m.status === 'halftime') && asOf && (!online || Date.now() - asOf > 180_000))
    return <span className="rounded-full bg-surface3 px-2.5 py-1 text-[11px] font-bold text-muted" title="Saved score; not a live update">LAST SCORE · {ago(asOf)}</span>
  switch (m.status) {
    case 'live': return <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2.5 py-1 text-[11px] font-bold text-live"><i className="live-dot" />LIVE{m.minute ? ` · ${m.minute}` : ''}</span>
    case 'halftime': return <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-bold text-warn">HALF TIME</span>
    case 'finished': return <span className="rounded-full bg-surface3 px-2.5 py-1 text-[11px] font-bold text-muted">FULL TIME</span>
    case 'postponed': return <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-bold text-warn">POSTPONED</span>
    case 'cancelled': return <span className="rounded-full bg-surface3 px-2.5 py-1 text-[11px] font-bold text-muted">CANCELLED</span>
    case 'scheduled': return <span className="rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-bold text-accent">{m.timeUnverified ? new Date(m.kickoffUtc).toLocaleDateString([], { day: 'numeric', month: 'short' }) : timeLocal(m.kickoffUtc)}</span>
    default: return <span className="rounded-full bg-surface3 px-2.5 py-1 text-[11px] font-bold text-muted" title="The data source gave a status we don't recognise">STATUS UNKNOWN</span>
  }
}

export function Skeleton({ className }: { className?: string }) { return <div className={cx('skeleton', className)} /> }

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-12 text-center">
      <div className="opacity-60"><Logo size={44} /></div>
      <div className="text-[15px] font-semibold">{title}</div>
      {hint && <div className="max-w-xs text-sm text-muted">{hint}</div>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card mx-4 my-3 flex items-center justify-between gap-3 p-4 text-sm">
      <span className="min-w-0 text-muted [overflow-wrap:anywhere]">Couldn't refresh: {message}</span>
      {onRetry && <button onClick={onRetry} className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-[color:var(--accent-ink)]">Retry</button>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="relative flex gap-1 rounded-2xl bg-surface2 p-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cx('relative min-h-[44px] flex-1 rounded-xl px-3 text-[13px] font-semibold transition-colors', value === t.id ? 'text-ink' : 'text-muted')}>
          {value === t.id && <motion.span layoutId={`tab-${label}`} className="absolute inset-0 rounded-xl bg-surface3" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Chip({ active, children, onClick, count, disabled }: { active?: boolean; children: ReactNode; onClick?: () => void; count?: number; disabled?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={active} disabled={disabled} className={cx('min-h-[44px] shrink-0 rounded-full border px-4 text-[13px] font-semibold transition-colors disabled:opacity-40', active ? 'border-accent bg-accent text-[color:var(--accent-ink)]' : 'border-line bg-surface text-muted')}>
      {children}{count !== undefined && <span className="ml-1.5 opacity-70">{count}</span>}
    </button>
  )
}

export function BottomSheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => { if (!open) return; const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal aria-label={label} className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl rounded-t-[28px] border border-line bg-surface safe-bottom"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => i.offset.y > 90 && onClose()}>
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-surface3" />
            <div className="p-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function Star({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button aria-label={label} aria-pressed={on} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }} className="grid h-11 w-11 place-items-center rounded-full">
      <motion.svg whileTap={{ scale: 0.8 }} width="20" height="20" viewBox="0 0 24 24" fill={on ? 'var(--accent)' : 'none'} stroke={on ? 'var(--accent)' : 'var(--faint)'} strokeWidth="2" strokeLinejoin="round"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9L12 3z" /></motion.svg>
    </button>
  )
}

export const Back = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full bg-surface2">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
  </button>
)
