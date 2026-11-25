import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Back, Crest, EmptyState, ErrorState, Skeleton, Star, Tabs } from '../../components/ui'
import { DateStrip } from '../../components/DateStrip'
import { MatchCard } from '../../components/MatchCard'
import { sortForDeck } from '../../components/Deck'
import { useSwr } from '../../hooks/useSwr'
import { fetchMatchesLocalDay, fetchStandings } from '../../services/football/repository'
import type { Match, Standings } from '../../services/football/types'
import { localYmd, ago } from '../../utils/time'
import { toggleIn, useSettings } from '../../app/settings'
import { useCompetitions } from './useCompetitions'
import { HOUR } from '../../services/football/cache/swr'

export default function League() {
  const { id: raw = '' } = useParams(); const id = decodeURIComponent(raw)
  const nav = useNavigate(); const s = useSettings()
  const comp = useCompetitions().find((c) => c.id === id)
  const [tab, setTab] = useState<'matches' | 'table'>('matches')
  const [date, setDate] = useState(localYmd(new Date()))
  const ms = useSwr<Match[]>(`m|${id}|${date}`, date === localYmd(new Date()) ? 45_000 : 30 * 60_000, (sig) => fetchMatchesLocalDay(id, date, sig), date === localYmd(new Date()) ? 60_000 : undefined)
  const st = useSwr<Standings | null>(tab === 'table' ? `st|${id}` : null, 3 * HOUR, (sig) => fetchStandings(id, sig))
  return (
    <div className="pb-28">
      <div className="safe-top flex items-center justify-between px-4 pb-3 pt-4"><Back onClick={() => nav(-1)} /><h1 className="text-lg font-black">{comp?.name ?? id}</h1><Star on={s.favLeagues.includes(id)} onClick={() => toggleIn('favLeagues', id)} label="Favourite competition" /></div>
      <div className="mb-4 px-4"><Tabs label="League" value={tab} onChange={setTab} tabs={[{ id: 'matches', label: 'Matches' }, { id: 'table', label: 'Table' }]} /></div>
      {tab === 'matches' ? (
        <>
          <div className="mb-4"><DateStrip value={date} onChange={setDate} /></div>
          {ms.error && !ms.data && <ErrorState message={ms.error} onRetry={ms.refresh} />}
          {ms.loading && !ms.data && <div className="grid gap-3 px-4"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>}
          <div className="grid justify-center gap-3 px-4">{sortForDeck(ms.data ?? []).map((m, i) => <div key={m.id} className="[&>div]:!w-full"><MatchCard m={m} index={i} asOf={ms.fetchedAt} /></div>)}</div>
          {ms.data?.length === 0 && <EmptyState title="No matches on this date" />}
        </>
      ) : (
        <div className="px-4">
          {st.loading && !st.data && <Skeleton className="h-96" />}
          {st.error && !st.data && <ErrorState message={st.error} onRetry={st.refresh} />}
          {st.data === null && <EmptyState title="No table for this competition" hint="The data source doesn't publish a league table for it (cups and some leagues have none)." />}
          {st.data && (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-[28px_1fr_28px_34px_34px] gap-1 border-b border-line px-3 py-2 text-[11px] font-bold text-faint"><span>#</span><span>Club</span><span>P</span><span>GD</span><span className="text-right">Pts</span></div>
              {st.data.rows.map((r) => (
                <Link key={r.team.id} to={`/team/${encodeURIComponent(id)}/${r.team.provenance[0].sourceId}`} state={{ name: r.team.name }} className="grid grid-cols-[28px_1fr_28px_34px_34px] items-center gap-1 border-b border-line/60 px-3 py-2.5 text-[13px] last:border-0">
                  <span className="text-faint">{r.rank}</span><span className="flex min-w-0 items-center gap-2"><Crest src={r.team.crest} name={r.team.name} size={22} /><span className="truncate font-semibold">{r.team.shortName ?? r.team.name}</span></span><span>{r.played}</span><span>{r.gd > 0 ? '+' : ''}{r.gd}</span><b className="text-right">{r.points}</b>
                </Link>
              ))}
            </div>
          )}
          {st.fetchedAt && <p className="mt-3 text-center text-[11px] text-faint">Updated {ago(st.fetchedAt)}{st.stale ? ' (saved copy)' : ''} · ESPN</p>}
        </div>
      )}
    </div>
  )
}
