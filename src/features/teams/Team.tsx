import { Link, useNavigate, useParams } from 'react-router-dom'
import { Back, Crest, EmptyState, ErrorState, Skeleton, Star } from '../../components/ui'
import { MatchCard } from '../../components/MatchCard'
import { useSwr } from '../../hooks/useSwr'
import { fetchTeamPage, type TeamPage } from '../../services/football/providers/espn'
import { teamKey } from '../../services/football/identity'
import { toggleIn, useSettings } from '../../app/settings'
import { ago } from '../../utils/time'
import { HOUR } from '../../services/football/cache/swr'

export function useTeamPage(comp: string, teamId: string) {
  return useSwr<TeamPage>(`team|${comp}|${teamId}`, 3 * HOUR, (sig) => fetchTeamPage(comp, teamId, sig))
}

export default function Team() {
  const { comp = '', teamId = '' } = useParams(); const c = decodeURIComponent(comp)
  const nav = useNavigate(); const s = useSettings()
  const q = useTeamPage(c, teamId)
  const t = q.data
  const upcoming = (t?.fixtures ?? []).filter((m) => m.status === 'scheduled').slice(0, 5)
  const recent = (t?.fixtures ?? []).filter((m) => m.status === 'finished').slice(-5).reverse()
  const form = recent.map((m) => { const home = teamKey(m.home.name) === teamKey(t!.name); const f = home ? m.homeScore! : m.awayScore!, a = home ? m.awayScore! : m.homeScore!; return f > a ? 'W' : f < a ? 'L' : 'D' }).reverse()
  const key = t ? teamKey(t.name) : ''
  return (
    <div className="pb-28">
      <div className="safe-top flex items-center justify-between px-4 pb-3 pt-4"><Back onClick={() => nav(-1)} />{t && <Star on={s.favTeams.includes(key)} onClick={() => toggleIn('favTeams', key)} label={`Favourite ${t.name}`} />}</div>
      {q.loading && !t && <div className="grid gap-3 px-4"><Skeleton className="h-40" /><Skeleton className="h-60" /></div>}
      {q.error && !t && <ErrorState message={q.error} onRetry={q.refresh} />}
      {t && (
        <>
          <div className="mb-6 grid justify-items-center gap-2 px-4 text-center"><Crest src={t.crest} name={t.name} size={88} /><h1 className="text-2xl font-black">{t.name}</h1><div className="text-sm text-muted">{c}{t.standingSummary ? ` · ${t.standingSummary}` : ''}</div>
            <div className="mt-2 flex gap-3">
              {t.record && <div className="rounded-2xl bg-surface2 px-4 py-2 text-center"><div className="text-lg font-extrabold">{t.record}</div><div className="text-[11px] text-muted">W-D-L</div></div>}
              {form.length > 0 && <div className="rounded-2xl bg-surface2 px-4 py-2"><div className="flex gap-1">{form.map((f, i) => <span key={i} className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-black ${f === 'W' ? 'bg-accent text-[color:var(--accent-ink)]' : f === 'L' ? 'bg-live text-white' : 'bg-surface3 text-muted'}`}>{f}</span>)}</div><div className="mt-1 text-[11px] text-muted">Recent form</div></div>}
            </div></div>
          <h2 className="eyebrow mb-3 px-4">Upcoming</h2>
          {upcoming.length ? <div className="hide-scroll mb-6 flex gap-3 overflow-x-auto px-4">{upcoming.map((m, i) => <MatchCard key={m.id} m={m} index={i} />)}</div> : <p className="mb-6 px-4 text-sm text-muted">No upcoming fixtures listed.</p>}
          <h2 className="eyebrow mb-3 px-4">Squad ({t.squad.length})</h2>
          {t.squad.length ? <div className="grid grid-cols-2 gap-2 px-4">{t.squad.map((p) => (
            <Link key={p.id} to={`/player/${encodeURIComponent(c)}/${teamId}/${p.id}`} className="card flex items-center gap-3 p-3">
              <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-surface3 text-xs font-bold">{p.name.split(' ').slice(-2).map((w) => w[0]).join('')}{p.photo && <img src={p.photo} alt="" loading="lazy" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}</div>
              <div className="min-w-0"><div className="truncate text-[13px] font-semibold">{p.name}</div><div className="text-[11px] text-muted">{p.jersey ? `#${p.jersey} · ` : ''}{p.position ?? ''}</div></div>
            </Link>))}</div> : <EmptyState title="Squad not available" />}
        </>
      )}
    </div>
  )
}
