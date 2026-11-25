import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { Match } from '../services/football/types'
import { Crest, StatusPill, cx } from './ui'

export const matchPath = (m: Match) => `/match/${encodeURIComponent(m.competitionId)}/${encodeURIComponent(m.id)}`

function Score({ n }: { n?: number }) {
  return (
    <motion.span key={n} initial={{ y: -10, opacity: 0, scale: 1.3 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }} className="inline-block text-[28px] font-extrabold leading-none">
      {n ?? '–'}
    </motion.span>
  )
}

export function MatchCard({ m, index = 0, compact = false, asOf }: { m: Match; index?: number; compact?: boolean; asOf?: number }) {
  const showScore = m.status !== 'scheduled' && m.status !== 'postponed' && m.status !== 'cancelled' && m.homeScore !== undefined
  const live = m.status === 'live' || m.status === 'halftime'
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 6) * 0.04, duration: 0.3 }} whileTap={{ scale: 0.97 }} className="shrink-0 snap-start" style={{ width: compact ? 250 : 272 }}>
      <Link to={matchPath(m)} state={{ match: m }} aria-label={`${m.home.name} vs ${m.away.name}`} className={cx('card relative block overflow-hidden p-4', live && 'border-live/40')}>
        {live && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-live to-transparent" />}
        <div className="mb-4 flex items-center justify-between"><StatusPill m={m} asOf={asOf} />{m.conflicts?.length ? <span title="Sources disagree on this score" className="text-[11px] text-warn">⚠ sources differ</span> : null}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="grid justify-items-center gap-2 text-center"><Crest src={m.home.crest} name={m.home.name} size={44} /><span className="line-clamp-2 min-h-[2.4em] max-w-full text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">{m.home.shortName ?? m.home.name}</span></div>
          <div className="flex min-w-[64px] items-center justify-center gap-2">
            {showScore ? (<><Score n={m.homeScore} /><span className="text-muted">:</span><Score n={m.awayScore} /></>) : <span className="text-sm font-bold text-faint">VS</span>}
          </div>
          <div className="grid justify-items-center gap-2 text-center"><Crest src={m.away.crest} name={m.away.name} size={44} /><span className="line-clamp-2 min-h-[2.4em] max-w-full text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">{m.away.shortName ?? m.away.name}</span></div>
        </div>
      </Link>
    </motion.div>
  )
}
