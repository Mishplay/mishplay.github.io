import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Match } from '../../services/football/types'
import { fetchDetail } from '../../services/football/repository'
import { getSettings, updateSettings } from '../../app/settings'
import { Crest } from '../../components/ui'

export interface GoalEvent { key: string; match: Match; scorer?: string; team: 'home' | 'away' }
const listeners = new Set<(g: GoalEvent) => void>()
const lastScore = new Map<string, [number, number]>() // in-memory: only celebrates changes seen between two fetches

/** Call with fresh matches. Celebrates ONLY a score increase on a live match between two fetches, once per score line. */
export function useGoalWatcher(matches: Match[]) {
  useEffect(() => {
    for (const m of matches) {
      if (m.homeScore === undefined || m.awayScore === undefined) continue
      const prev = lastScore.get(m.id)
      lastScore.set(m.id, [m.homeScore, m.awayScore])
      if (!prev || (m.status !== 'live' && m.status !== 'halftime')) continue
      const team = m.homeScore > prev[0] ? 'home' : m.awayScore > prev[1] ? 'away' : null
      if (!team) continue
      const key = `${m.id}|${m.homeScore}-${m.awayScore}`
      const seen = getSettings().seenEvents
      if (seen.includes(key)) continue
      updateSettings({ seenEvents: [...seen.slice(-199), key] })
      ;(async () => {
        let scorer: string | undefined
        try { const d = await fetchDetail(m); scorer = [...d.events].reverse().find((e) => /goal/.test(e.type) && e.team === team)?.player } catch { /* scorer unknown: say nothing */ }
        listeners.forEach((f) => f({ key, match: m, scorer, team }))
      })()
    }
  }, [matches])
}

export function GoalCelebration() {
  const [g, setG] = useState<GoalEvent | null>(null)
  const t = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    const f = (e: GoalEvent) => { setG(e); clearTimeout(t.current); t.current = setTimeout(() => setG(null), 4200) }
    listeners.add(f); return () => void listeners.delete(f)
  }, [])
  return (
    <AnimatePresence>
      {g && (
        <motion.div key={g.key} role="status" aria-live="assertive" onClick={() => setG(null)} className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="grid w-full max-w-sm justify-items-center gap-3 text-center">
            <div className="relative h-40 w-56">
              <svg viewBox="0 0 220 150" className="anim-net absolute inset-0 h-full w-full" aria-hidden>
                <g stroke="rgba(255,255,255,.35)" strokeWidth="1">{Array.from({ length: 12 }).map((_, i) => <line key={'v' + i} x1={20 + i * 16.4} y1="20" x2={20 + i * 16.4} y2="100" />)}{Array.from({ length: 6 }).map((_, i) => <line key={'h' + i} x1="20" y1={20 + i * 16} x2="200" y2={20 + i * 16} />)}</g>
                <path d="M16 104 V16 H204 V104" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
              </svg>
              <div className="anim-ball-shot absolute left-1/2 top-4 -ml-4 h-8 w-8 rounded-full bg-accent shadow-[0_0_24px_var(--accent)]"><span className="absolute inset-2 rounded-full bg-bg" /></div>
            </div>
            <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.55, type: 'spring', stiffness: 400, damping: 14 }} className="text-5xl font-black tracking-tight text-accent">GOAL!</motion.div>
            <div className="flex items-center gap-3 text-xl font-extrabold"><Crest src={g.match.home.crest} name={g.match.home.name} size={32} /><motion.span key={g.key} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8 }}>{g.match.homeScore} – {g.match.awayScore}</motion.span><Crest src={g.match.away.crest} name={g.match.away.name} size={32} /></div>
            <div className="text-sm text-muted">{g.scorer ? `${g.scorer} · ` : ''}{g.team === 'home' ? g.match.home.name : g.match.away.name}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
