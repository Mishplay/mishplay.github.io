import { motion } from 'framer-motion'
import type { MatchEvent } from '../services/football/types'

const ICON: Record<string, string> = { goal: '⚽', 'penalty-goal': '⚽', 'own-goal': '⚽', yellow: '🟨', red: '🟥', sub: '🔁', halftime: '⏸', fulltime: '🏁', kickoff: '▶', other: '•' }
const LABEL: Record<string, string> = { goal: 'Goal', 'penalty-goal': 'Penalty', 'own-goal': 'Own goal', yellow: 'Yellow card', red: 'Red card', sub: 'Substitution', halftime: 'Half-time', fulltime: 'Full-time', kickoff: 'Kick-off', other: '' }

export function Timeline({ events, homeName, awayName }: { events: MatchEvent[]; homeName: string; awayName: string }) {
  return (
    <ol className="relative mx-auto max-w-md" aria-label="Match timeline">
      <div className="absolute bottom-0 left-1/2 top-0 w-px bg-line" />
      {events.map((e, i) => {
        const marker = e.type === 'halftime' || e.type === 'fulltime' || e.type === 'kickoff' || !e.team
        const side = e.team === 'away' ? 'right' : 'left'
        return (
          <motion.li key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="relative grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center py-2">
            {marker ? (
              <><div /><div className="z-10 grid place-items-center"><span className="rounded-full bg-surface3 px-2 py-1 text-[10px] font-bold text-muted">{LABEL[e.type] || e.text}</span></div><div /></>
            ) : (
              <>
                <div className={side === 'left' ? 'pr-2 text-right' : ''}>{side === 'left' && <Body e={e} />}</div>
                <div className="z-10 grid place-items-center"><span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-sm" title={`${LABEL[e.type]} ${e.minute} — ${e.team === 'home' ? homeName : awayName}`}>{ICON[e.type]}</span></div>
                <div className={side === 'right' ? 'pl-2' : ''}>{side === 'right' && <Body e={e} />}</div>
              </>
            )}
          </motion.li>
        )
      })}
    </ol>
  )
}

function Body({ e }: { e: MatchEvent }) {
  return (
    <div>
      <div className="text-[13px] font-bold [overflow-wrap:anywhere]">{e.player ?? LABEL[e.type]} <span className="text-faint">{e.minute}</span></div>
      <div className="text-[11px] text-muted [overflow-wrap:anywhere]">
        {e.type === 'sub' ? <>↘ {e.playerOff ?? '—'}</> : e.assist ? <>Assist: {e.assist}</> : LABEL[e.type]}
      </div>
    </div>
  )
}
