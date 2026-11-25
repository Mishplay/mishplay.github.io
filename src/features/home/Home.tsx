import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Deck } from '../../components/Deck'
import { DateStrip } from '../../components/DateStrip'
import { Chip, EmptyState, ErrorState, Logo } from '../../components/ui'
import { InstallPrompt } from '../../components/Chrome'
import { useSwr } from '../../hooks/useSwr'
import { degradedSources, fetchMatchesLocalDay } from '../../services/football/repository'
import { FEATURED } from '../../services/football/competitions'
import type { Match } from '../../services/football/types'
import { getSettings, toggleIn, useSettings } from '../../app/settings'
import { ago, localYmd } from '../../utils/time'
import { useGoalWatcher } from '../matches/goals'
import { MIN, HOUR } from '../../services/football/cache/swr'
import { useCompetitions } from '../leagues/useCompetitions'

type Filter = 'all' | 'live' | 'upcoming' | 'finished' | 'favourites'
const isLive = (m: Match) => m.status === 'live' || m.status === 'halftime'

/** Mounts children once scrolled near the viewport, so we don't request every competition at startup. */
function LazyMount({ eager, children, label }: { eager: boolean; children: React.ReactNode; label: string }) {
  const [on, setOn] = useState(eager)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (on || !ref.current) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setOn(true), io.disconnect()), { rootMargin: '500px' })
    io.observe(ref.current); return () => io.disconnect()
  }, [on])
  return on ? <>{children}</> : <div ref={ref} aria-label={label} className="mb-6 h-40" />
}

function ttlFor(date: string) { const t = localYmd(new Date()); return date === t ? 45_000 : date > t ? 30 * MIN : 6 * HOUR }

function DeckLoader({ comp, date, filter, onReport }: { comp: { id: string; name: string; country?: string }; date: string; filter: Filter; onReport: (id: string, ms: Match[] | undefined, at?: number) => void }) {
  const s = useSettings()
  const latest = useRef<Match[]>([])
  const isToday = date === localYmd(new Date())
  const q = useSwr<Match[]>(`m|${comp.id}|${date}`, ttlFor(date), (sig) => fetchMatchesLocalDay(comp.id, date, sig), () => (isToday ? (latest.current.some(isLive) ? 45_000 : 10 * MIN) : undefined))
  latest.current = q.data ?? []
  useEffect(() => { onReport(comp.id, q.data, q.fetchedAt) }, [q.data, q.fetchedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (q.data ?? []).filter((m) =>
    filter === 'all' ? true : filter === 'live' ? isLive(m) : filter === 'upcoming' ? m.status === 'scheduled' : filter === 'finished' ? m.status === 'finished'
      : s.favTeams.includes(m.home.id) || s.favTeams.includes(m.away.id) || s.favLeagues.includes(comp.id)), [q.data, filter, s.favTeams, s.favLeagues, comp.id])
  const deg = q.data ? degradedSources(comp.id) : { failed: [], fallbackOnly: false }
  if (!q.loading && q.data && shown.length === 0) return null
  if (!q.loading && !q.data && q.error) return <div className="mb-4"><div className="eyebrow px-4">{comp.name}</div><ErrorState message={q.error} onRetry={q.refresh} /></div>
  return <Deck id={comp.id} name={comp.name} country={comp.country} matches={shown.length ? shown : undefined} asOf={q.fetchedAt} loading={q.loading} fav={s.favLeagues.includes(comp.id)} onFav={() => toggleIn('favLeagues', comp.id)}
    error={(deg.fallbackOnly || (shown.length > 0 && shown.every((m) => m.provenance.every((p) => p.source === 'openfootball')))) ? <p className="mt-2 px-4 text-[11px] text-warn">Live data unavailable — showing the published schedule only (no live scores).</p> : deg.failed.length ? <p className="mt-2 px-4 text-[11px] text-warn">Partial data: {deg.failed.join(', ')} didn't respond.</p> : null} />
}

export default function Home() {
  const [date, setDate] = useState(() => localYmd(new Date()))
  const [filter, setFilter] = useState<Filter>('all')
  const comps = useCompetitions()
  const s = useSettings()
  const [reports, setReports] = useState<Record<string, { ms?: Match[]; at?: number }>>({})
  const onReport = useMemo(() => (id: string, ms?: Match[], at?: number) => setReports((r) => (r[id]?.ms === ms && r[id]?.at === at ? r : { ...r, [id]: { ms, at } })), [])
  const all = useMemo(() => Object.values(reports).flatMap((r) => r.ms ?? []), [reports])
  useGoalWatcher(all)
  const oldest = Object.values(reports).map((r) => r.at).filter(Boolean) as number[]
  const updated = oldest.length ? ago(Math.min(...oldest)) : undefined
  // favourites first, then the featured order
  const ordered = [...comps].sort((a, b) => Number(s.favLeagues.includes(b.id)) - Number(s.favLeagues.includes(a.id)))
  const live = all.filter(isLive).length
  const loadedAll = Object.keys(reports).length >= Math.min(4, comps.length) && comps.slice(0, 4).every((c) => reports[c.id])
  const noneAtAll = loadedAll && all.length === 0

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-clip pb-28" data-testid="home-root">
      <header className="safe-top sticky top-[var(--offline-h,0px)] z-20 bg-bg/85 px-4 pb-3 pt-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5"><Logo size={34} /><div><div className="text-[19px] font-black leading-none tracking-tight">Mish<span className="text-accent">Play</span></div><div className="mt-0.5 text-[11px] text-faint">{updated ? `Updated ${updated}` : 'Loading…'}</div></div></div>
          {live > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-3 py-1.5 text-xs font-bold text-live"><i className="live-dot" />{live} live</span>}
        </div>
      </header>
      <div className="mb-3"><DateStrip value={date} onChange={setDate} /></div>
      <div className="hide-scroll mb-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter matches">
        {(['all', 'live', 'upcoming', 'finished', 'favourites'] as Filter[]).map((f) => <Chip key={f} active={filter === f} onClick={() => setFilter(f)} count={f === 'live' ? live : undefined}>{f[0].toUpperCase() + f.slice(1)}</Chip>)}
      </div>
      <InstallPrompt />
      {ordered.map((c, i) => <LazyMount key={c.id + date} eager={i < 4} label={c.name}><DeckLoader comp={c} date={date} filter={filter} onReport={onReport} /></LazyMount>)}
      {noneAtAll && <EmptyState title="No matches on this date" hint="Try another day, or discover more competitions." action={<Link to="/discover" className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-[color:var(--accent-ink)]">Discover competitions</Link>} />}
      {loadedAll && !noneAtAll && filter !== 'all' && all.length > 0 && !getSettings().favLeagues.length && filter === 'favourites' && <EmptyState title="No favourites yet" hint="Star a competition or club to see it here." />}
      <p className="px-4 text-center text-[11px] text-faint">Data: ESPN · OpenLigaDB · openfootball — kickoff times shown in your local timezone.</p>
    </div>
  )
}
