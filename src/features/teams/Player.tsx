import { useNavigate, useParams } from 'react-router-dom'
import { Back, EmptyState, ErrorState, Skeleton, Star } from '../../components/ui'
import { useTeamPage } from './Team'
import { toggleIn, useSettings } from '../../app/settings'

export default function Player() {
  const { comp = '', teamId = '', playerId = '' } = useParams()
  const nav = useNavigate(); const s = useSettings()
  const q = useTeamPage(decodeURIComponent(comp), teamId)
  const p = q.data?.squad.find((x) => x.id === playerId)
  const rows: [string, string | number | undefined][] = p ? [['Position', p.position], ['Shirt number', p.jersey ? `#${p.jersey}` : undefined], ['Age', p.age], ['Height', p.height], ['Nationality', p.nationality], ['Team', p.teamName]] : []
  return (
    <div className="pb-28">
      <div className="safe-top flex items-center justify-between px-4 pb-3 pt-4"><Back onClick={() => nav(-1)} />{p && <Star on={s.favPlayers.includes(p.id)} onClick={() => toggleIn('favPlayers', p.id)} label={`Favourite ${p.name}`} />}</div>
      {q.loading && !q.data && <div className="px-4"><Skeleton className="h-64" /></div>}
      {q.error && !q.data && <ErrorState message={q.error} onRetry={q.refresh} />}
      {q.data && !p && <EmptyState title="Player not found" hint="This player isn't in the current squad data." />}
      {p && (
        <div className="px-4">
          <div className="mb-6 grid justify-items-center gap-3 text-center">
            <div className="relative grid h-40 w-40 place-items-center overflow-hidden rounded-[40px] bg-surface3 text-4xl font-black">{p.name.split(' ').slice(-2).map((w) => w[0]).join('')}{p.photo && <img src={p.photo} alt={p.name} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}</div>
            <h1 className="text-2xl font-black">{p.name}</h1>
          </div>
          <div className="card divide-y divide-line">{rows.filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => <div key={k} className="flex justify-between px-4 py-3 text-sm"><span className="text-muted">{k}</span><b>{v}</b></div>)}</div>
          <p className="mt-4 text-center text-[11px] text-faint">Season statistics aren't provided by the free data sources, so none are shown. Profile data: ESPN.</p>
        </div>
      )}
    </div>
  )
}
