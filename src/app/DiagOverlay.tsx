import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

interface Report { innerW: number; clientW: number; scrollW: number; scale: number; dpr: number; offenders: string[] }

function measure(): Report {
  const vw = document.documentElement.clientWidth
  const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((el) => { if (el.closest('[data-diag],.hide-scroll,[data-testid=pitch]')) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 })
    .slice(0, 4).map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')!.slice(0, 24)}]` : ''}.${String(el.className).split(' ').slice(0, 3).join('.')} → right ${Math.round(el.getBoundingClientRect().right)}px`)
  return { innerW: innerWidth, clientW: vw, scrollW: document.documentElement.scrollWidth, scale: visualViewport?.scale ?? 1, dpr: devicePixelRatio, offenders }
}

/** Only mounts when the URL has ?diag. Shows the live layout-viewport numbers and which element (if any) is wider than the screen. */
export function DiagOverlay() {
  const on = new URLSearchParams(useLocation().search).has('diag')
  const [r, setR] = useState<Report>()
  useEffect(() => { if (!on) return; const t = setInterval(() => setR(measure()), 1200); setR(measure()); return () => clearInterval(t) }, [on])
  if (!on || !r) return null
  const bad = r.innerW !== r.clientW || r.scrollW > r.clientW || r.offenders.length > 0
  return (
    <div data-diag className={`pointer-events-none fixed inset-x-2 top-2 z-[200] rounded-xl p-2 font-mono text-[11px] leading-snug ${bad ? 'bg-live text-white' : 'bg-accent text-black'}`}>
      {bad ? 'OVERFLOW' : 'OK'} · inner {r.innerW} · client {r.clientW} · scrollW {r.scrollW} · scale {r.scale} · dpr {r.dpr}
      {r.offenders.map((o) => <div key={o} className="[overflow-wrap:anywhere]">{o}</div>)}
    </div>
  )
}
