import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Back, BottomSheet, Crest, EmptyState, ErrorState, Skeleton, StatusPill, Tabs, Star } from '../../components/ui'
import { Timeline } from '../../components/Timeline'
import { StatBars } from '../../components/StatBars'
import { Pitch } from '../lineups/Pitch'
import { useSwr } from '../../hooks/useSwr'
import { fetchDetail, fetchMatches } from '../../services/football/repository'
import { mergeMatches } from '../../services/football/identity'
import type { LineupPlayer, Match, MatchDetail } from '../../services/football/types'
import { ago, dateLocal, timeLocal, addDays } from '../../utils/time'
import { toggleIn, useSettings } from '../../app/settings'
import { useGoalWatcher } from './goals'
import { useCompetitions } from '../leagues/useCompetitions'

const ShareEditor = lazy(() => import('../share/ShareEditor'))
import { candidateKey } from '../share/model'

type Tab = 'overview' | 'lineups' | 'timeline' | 'stats'
const isLive = (m?: Match) => m && (m.status === 'live' || m.status === 'halftime')

async function findMatch(comp: string, id: string, signal: AbortSignal): Promise<Match> {
  const date = id.split('|')[1]
  const lists = await Promise.allSettled([date, addDays(date, -1), addDays(date, 1)].map((d) => fetchMatches(comp, d, signal)))
  const m = mergeMatches(lists.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))).find((x) => x.id === id)
  if (!m) throw new Error('Match not found in the data sources')
  return m
}

export default function MatchCentre() {
  const { comp = '', id = '' } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const s = useSettings()
  const compName = useCompetitions()
  const compId = decodeURIComponent(comp), matchId = decodeURIComponent(id)
  const [tab, setTab] = useState<Tab>('overview')
  const [side, setSide] = useState<'home' | 'away'>('home')
  const [picked, setPicked] = useState<LineupPlayer | null>(null)
  const [share, setShare] = useState<{ kind: 'match' | 'player'; playerKey?: string } | null>(null)

  const base = useSwr<Match>((loc.state as { match?: Match } | null)?.match ? null : `match|${matchId}`, 5 * 60_000, (sig) => findMatch(compId, matchId, sig))
  const stateMatch = (loc.state as { match?: Match } | null)?.match
  const baseMatch = stateMatch ?? base.data
  const detail = useSwr<MatchDetail>(baseMatch ? `d|${matchId}` : null, 30_000, (sig) => fetchDetail(baseMatch!, sig), () => (isLive(baseMatch) ? 30_000 : undefined))
  const match: Match | undefined = useMemo(() => baseMatch && { ...baseMatch, ...(detail.data?.header ?? {}) }, [baseMatch, detail.data?.header])
  useGoalWatcher(match ? [match] : [])

  if (!match) return <div className="p-4 safe-top"><Back onClick={() => nav(-1)} />{base.error ? <ErrorState message={base.error} onRetry={base.refresh} /> : <div className="mt-6 grid gap-3"><Skeleton className="h-40" /><Skeleton className="h-10" /><Skeleton className="h-64" /></div>}</div>

  const d = detail.data
  const lineups = d?.lineups
  const scorers = (d?.events ?? []).filter((e) => /goal/.test(e.type))
  const showScore = match.status !== 'scheduled' && match.homeScore !== undefined
  const selectedTeam = side === 'home' ? lineups?.home : lineups?.away
  const noDetail = !match.provenance.some((p) => p.source === 'espn')

  return (
    <div className="pb-24">
      <div className="relative overflow-hidden border-b border-line bg-gradient-to-b from-surface2 to-bg px-4 pb-5 pt-4 safe-top">
        <div className="mb-4 flex items-center justify-between"><Back onClick={() => nav(-1)} /><Link to={`/league/${encodeURIComponent(match.competitionId)}`} className="eyebrow inline-flex min-h-[44px] items-center">{compName.find((c) => c.id === match.competitionId)?.name ?? match.competitionId}</Link>{match.homeScore !== undefined && match.status !== 'scheduled' ? <button onClick={() => setShare({ kind: 'match' })} aria-label="Share image" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-extrabold text-[color:var(--accent-ink)]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>Share</button> : <div className="w-11" />}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
          {(['home', 'away'] as const).map((k) => {
            const t = match[k]; const espnTeam = t.provenance.find((p) => p.source === 'espn')?.sourceId
            return (
              <div key={k} className="grid justify-items-center gap-2 text-center" style={{ order: k === 'home' ? 0 : 2 }}>
                {espnTeam ? <Link to={`/team/${encodeURIComponent(match.competitionId)}/${espnTeam}`} state={{ name: t.name }}><Crest src={t.crest} name={t.name} size={64} /></Link> : <Crest src={t.crest} name={t.name} size={64} />}
                <div className="max-w-full break-words text-[14px] font-bold leading-tight [overflow-wrap:anywhere]">{t.name}</div>
                <Star on={s.favTeams.includes(t.id)} onClick={() => toggleIn('favTeams', t.id)} label={`Favourite ${t.name}`} />
              </div>
            )
          })}
          <div className="grid justify-items-center gap-2 pt-3" style={{ order: 1 }}>
            {showScore ? <div className="flex items-center gap-2 text-[40px] font-black leading-none"><motion.span key={match.homeScore} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{match.homeScore}</motion.span><span className="text-faint">–</span><motion.span key={match.awayScore} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{match.awayScore}</motion.span></div> : <div className="text-xl font-black text-faint">{match.timeUnverified ? dateLocal(match.kickoffUtc) : timeLocal(match.kickoffUtc)}</div>}
            <StatusPill m={match} asOf={detail.fetchedAt ?? base.fetchedAt} />
            <div className="text-[11px] text-faint">{dateLocal(match.kickoffUtc)}</div>
          </div>
        </div>
      </div>

      <div className="sticky top-[var(--offline-h,0px)] z-20 bg-bg/90 px-4 py-3 backdrop-blur-xl"><Tabs label="Match" value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'lineups', label: 'Lineups' }, { id: 'timeline', label: 'Timeline' }, { id: 'stats', label: 'Stats' }]} /></div>

      <div className="px-4">
        {detail.error && <ErrorState message={detail.error} onRetry={detail.refresh} />}
        {noDetail && <EmptyState title="No match detail for this game" hint="The sources that cover this competition provide fixtures and results only — no lineups, events or statistics." />}
        {!noDetail && detail.loading && !d && <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>}

        {!noDetail && d && tab === 'overview' && (
          <div className="grid gap-4">
            <section className="card p-4"><div className="eyebrow mb-3">Goals</div>
              {scorers.length ? <ul className="grid gap-2.5">{scorers.map((e, i) => <li key={i} className={`flex flex-wrap items-center gap-x-2 text-sm [overflow-wrap:anywhere] ${e.team === 'away' ? 'flex-row-reverse text-right' : ''}`}>⚽ <b>{e.player}</b><span className="text-faint">{e.minute}</span>{e.type === 'own-goal' && <span className="text-xs text-muted">(og)</span>}{e.type === 'penalty-goal' && <span className="text-xs text-muted">(pen)</span>}{e.assist && <span className="text-xs text-muted">assist {e.assist}</span>}</li>)}</ul> : <p className="text-sm text-muted">{match.status === 'scheduled' ? 'Match has not started.' : 'No goals recorded.'}</p>}
            </section>
            <section className="card p-4"><div className="eyebrow mb-3">Key events</div>
              {d.events.filter((e) => ['yellow', 'red', 'sub'].includes(e.type)).slice(0, 8).map((e, i) => <div key={i} className="flex items-center gap-2 py-1 text-sm">{e.type === 'yellow' ? '🟨' : e.type === 'red' ? '🟥' : '🔁'}<b>{e.player}</b><span className="text-faint">{e.minute}</span></div>)}
              {!d.events.some((e) => ['yellow', 'red', 'sub'].includes(e.type)) && <p className="text-sm text-muted">Nothing yet.</p>}
            </section>
          </div>
        )}

        {!noDetail && d && tab === 'lineups' && (
          lineups?.home || lineups?.away ? (
            <div>
              <div className="mb-3"><Tabs label="Side" value={side} onChange={setSide} tabs={[{ id: 'home', label: match.home.shortName ?? match.home.name }, { id: 'away', label: match.away.shortName ?? match.away.name }]} /></div>
              {selectedTeam ? <Pitch key={side} lineup={selectedTeam} teamName={selectedTeam.teamName} onSelect={setPicked} selectedKey={picked ? `${picked.id ?? picked.name}` : undefined} /> : <EmptyState title="Lineup unavailable for this team" />}
              <p className="mt-4 text-[11px] text-faint">Lineup from ESPN{lineups.provenance ? ` · ${ago(lineups.provenance.fetchedAt)}` : ''}. Shape is drawn from the provider's formation and position labels.</p>
            </div>
          ) : <EmptyState title="Lineups not available yet" hint="Confirmed lineups are published by the data source shortly before kick-off. We never show a predicted lineup as official." />
        )}

        {!noDetail && d && tab === 'timeline' && (d.events.length ? <Timeline events={d.events} homeName={match.home.name} awayName={match.away.name} /> : <EmptyState title="No events yet" hint="Goals, cards and substitutions appear here as they happen." />)}
        {!noDetail && d && tab === 'stats' && (d.stats.length ? <div className="card p-4"><StatBars stats={d.stats} /></div> : <EmptyState title="No statistics yet" hint="Match statistics aren't available from the data source for this game." />)}

        <p className="mt-5 text-center text-[11px] text-faint">{detail.fetchedAt ? `Last updated ${ago(detail.fetchedAt)}${detail.stale ? ' (saved copy)' : ''}` : ''}{isLive(match) ? ' · refreshes every 30 s while open' : ''}</p>
      </div>

      {share && <Suspense fallback={null}><ShareEditor match={match} detail={detail.data} detailLoading={detail.loading && !detail.data} competitionName={compName.find((c) => c.id === match.competitionId)?.name} asOf={detail.fetchedAt ?? base.fetchedAt} initialKind={share.kind} initialPlayerKey={share.playerKey} onClose={() => setShare(null)} /></Suspense>}
      <BottomSheet open={!!picked} onClose={() => setPicked(null)} label="Player details">
        {picked && <PlayerSheet onShare={(p) => { setPicked(null); setShare({ kind: 'player', playerKey: candidateKey(side, p.name) }) }} p={picked} team={selectedTeam?.teamName ?? ''} teamId={(side === 'home' ? match.home : match.away).provenance.find((x) => x.source === 'espn')?.sourceId} comp={match.competitionId} onClose={() => setPicked(null)} />}
      </BottomSheet>
    </div>
  )
}

const STAT_LABEL: Record<string, string> = { totalGoals: 'Goals', goalAssists: 'Assists', totalShots: 'Shots', shotsOnTarget: 'On target', saves: 'Saves', foulsCommitted: 'Fouls', foulsSuffered: 'Fouled', yellowCards: 'Yellows', redCards: 'Reds' }
function PlayerSheet({ p, team, teamId, comp, onClose, onShare }: { p: LineupPlayer; team: string; teamId?: string; comp: string; onClose: () => void; onShare: (p: LineupPlayer) => void }) {
  const stats = Object.entries(p.stats ?? {}).filter(([k]) => STAT_LABEL[k]).map(([k, v]) => ({ k, v }))
  const initials = p.name.split(/\s+/).slice(-2).map((w) => w[0]).join('')
  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-surface3 text-xl font-black">{initials}{p.photo && <img src={p.photo} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}</div>
        <div className="min-w-0"><div className="text-xl font-black leading-tight">{p.name}</div><div className="mt-1 text-sm text-muted">{team}{p.position ? ` · ${p.position}` : ''}{p.jersey ? ` · #${p.jersey}` : ''}</div>{p.subbedOut && <div className="mt-1 text-xs text-warn">Substituted off</div>}{!p.starter && <div className="mt-1 text-xs text-muted">On the bench</div>}</div>
      </div>
      <div className="eyebrow mb-2 mt-5">Match stats</div>
      {stats.length ? <div className="grid grid-cols-3 gap-2">{stats.map(({ k, v }) => <div key={k} className="rounded-2xl bg-surface2 p-3 text-center"><div className="text-xl font-extrabold">{v}</div><div className="text-[11px] text-muted">{STAT_LABEL[k]}</div></div>)}</div> : <p className="text-sm text-muted">No individual match statistics were supplied for this player.</p>}
      <button onClick={() => onShare(p)} className="mt-5 min-h-[48px] w-full rounded-2xl bg-surface3 text-sm font-bold">Share player card</button>
      {p.id && teamId && <Link onClick={onClose} to={`/player/${encodeURIComponent(comp)}/${teamId}/${p.id}`} className="mt-2 block rounded-2xl bg-accent py-3.5 text-center text-sm font-bold text-[color:var(--accent-ink)]">View player profile</Link>}
    </div>
  )
}
