import { motion } from 'framer-motion'
import type { TeamStat } from '../services/football/types'

export function StatBars({ stats }: { stats: TeamStat[] }) {
  return (
    <div className="grid gap-5">
      {stats.map((s, i) => {
        const total = s.home + s.away
        const h = total ? (s.home / total) * 100 : 50
        const pct = s.key === 'possessionPct'
        return (
          <div key={s.key}>
            <div className="mb-1.5 flex items-center justify-between text-sm"><b className="w-12">{s.home}{pct ? '%' : ''}</b><span className="text-[12px] font-semibold text-muted">{s.label}</span><b className="w-12 text-right">{s.away}{pct ? '%' : ''}</b></div>
            <div className="flex h-2 gap-1 overflow-hidden rounded-full" role="img" aria-label={`${s.label}: ${s.home} to ${s.away}`}>
              <motion.div className="rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${total ? h : 50}%` }} transition={{ delay: i * 0.05, duration: 0.6 }} />
              <motion.div className="flex-1 rounded-full bg-surface3" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
