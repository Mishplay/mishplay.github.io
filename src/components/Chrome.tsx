import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useOnline } from '../hooks/useSwr'
import { useLastNetworkOk } from '../services/football/cache/swr'
import { useUpdate } from '../app/update'
import { ago } from '../utils/time'
import { Logo, cx } from './ui'

const I = (d: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const NAV = [
  { to: '/', label: 'Home', icon: I('M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { to: '/discover', label: 'Discover', icon: I('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16l-4-4') },
  { to: '/favourites', label: 'Favourites', icon: I('M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9z') },
  { to: '/settings', label: 'Settings', icon: I('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 4l2-1-2-4-2 .5-1.5-1.2.3-2-4-1-1 2h-2l-1-2-4 1 .3 2L6 7.5 4 7l-2 4 2 1v2l-2 1 2 4 2-.5 1.5 1.2-.3 2 4 1 1-2h2l1 2 4-1-.3-2 1.5-1.2 2 .5 2-4-2-1z') },
]

export function BottomNav() {
  const { needRefresh } = useUpdate()
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-xl safe-bottom">
      <div className="mx-auto flex max-w-xl">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors', isActive ? 'text-accent' : 'text-faint')}><span className="relative">{n.icon}{n.to === '/settings' && needRefresh && <i aria-label="Update available" className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-bg" />}</span>{n.label}</NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Global: shown on every screen while offline, with the time of the last successful update. */
export function OfflineBanner() {
  const on = useOnline()
  const last = useLastNetworkOk()
  const ref = useRef<HTMLDivElement>(null)
  // The banner takes up real space at the top (it never overlays buttons). Its height is published as --offline-h so sticky headers sit below it.
  useEffect(() => {
    const root = document.documentElement
    if (!on && ref.current) { const set = () => root.style.setProperty('--offline-h', `${ref.current!.offsetHeight}px`); set(); const ro = new ResizeObserver(set); ro.observe(ref.current); return () => { ro.disconnect(); root.style.removeProperty('--offline-h') } }
    root.style.removeProperty('--offline-h')
  }, [on])
  if (on) return null
  return <div ref={ref} role="status" className="sticky top-0 z-[60] bg-warn px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] text-center text-[12px] font-bold text-black">Offline — showing saved data{last ? ` · last updated ${ago(last)}` : ''}. Scores may be out of date.</div>
}

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function InstallPrompt() {
  const [ev, setEv] = useState<BIPEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('mish.install.dismissed') === '1')
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  useEffect(() => { const f = (e: Event) => { e.preventDefault(); setEv(e as BIPEvent) }; window.addEventListener('beforeinstallprompt', f); return () => window.removeEventListener('beforeinstallprompt', f) }, [])
  if (standalone) return null
  // Installing (and the service worker that makes the app work offline) requires a secure context: https:// or localhost.
  if (!window.isSecureContext && !dismissed)
    return (
      <div role="note" className="card mx-4 mb-4 flex items-start gap-3 p-3 text-[13px]">
        <Logo size={34} />
        <div className="min-w-0 flex-1"><b>Can't install from this address</b><div className="text-muted">You opened MishPlay over plain <code>http://</code>. Phones only allow installing and offline mode over <b>HTTPS</b>. Open the HTTPS link instead.</div></div>
        <button onClick={() => { localStorage.setItem('mish.install.dismissed', '1'); setDismissed(true) }} aria-label="Dismiss" className="grid h-11 w-11 place-items-center text-faint">✕</button>
      </div>
    )
  if (dismissed || (!ev && !ios)) return null
  const close = () => { localStorage.setItem('mish.install.dismissed', '1'); setDismissed(true) }
  return (
    <div className="card mx-4 mb-4 flex items-center gap-3 p-3">
      <Logo size={34} />
      <div className="min-w-0 flex-1 text-[13px]"><b>Install MishPlay</b><div className="text-muted">{ev ? 'Add it to your home screen for a full-screen app.' : 'Tap Share, then “Add to Home Screen”.'}</div></div>
      {ev && <button onClick={async () => { await ev.prompt(); close() }} className="min-h-[44px] rounded-full bg-accent px-4 text-xs font-bold text-[color:var(--accent-ink)]">Install</button>}
      <button onClick={close} aria-label="Dismiss" className="grid h-11 w-11 place-items-center text-faint">✕</button>
    </div>
  )
}
