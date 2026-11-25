import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crest, EmptyState, Logo, Star, cx } from '../../components/ui'
import { getSettings, toggleIn, updateSettings, useSettings } from '../../app/settings'
import { useCompetitions } from '../leagues/useCompetitions'
import { resolveCompetitionName } from '../../services/football/repository'
import { espnProvider } from '../../services/football/providers/espn'
import { useSwr } from '../../hooks/useSwr'
import { kvClear, kvStats } from '../../services/football/cache/db'
import { HOUR } from '../../services/football/cache/swr'
import { APP_VERSION, applyUpdate, checkForUpdate, useUpdate } from '../../app/update'
import { ago } from '../../utils/time'

export function Favourites() {
  const s = useSettings(); const comps = useCompetitions()
  const leagues = comps.filter((c) => s.favLeagues.includes(c.id))
  return (
    <div className="px-4 pb-28 pt-4 safe-top">
      <h1 className="mb-5 text-2xl font-black">Favourites</h1>
      <h2 className="eyebrow mb-2">Competitions</h2>
      {leagues.length ? <div className="grid gap-2">{leagues.map((c) => <Link key={c.id} to={`/league/${encodeURIComponent(c.id)}`} className="card flex items-center justify-between p-4"><b>{c.name}</b><Star on onClick={() => toggleIn('favLeagues', c.id)} label={`Remove ${c.name}`} /></Link>)}</div> : <p className="mb-2 text-sm text-muted">Star a competition on Home or in Discover.</p>}
      <h2 className="eyebrow mb-2 mt-6">Clubs</h2>
      {s.favTeams.length ? <div className="grid gap-2">{s.favTeams.map((t) => <div key={t} className="card flex items-center justify-between p-4"><b className="min-w-0 capitalize [overflow-wrap:anywhere]">{t}</b><Star on onClick={() => toggleIn('favTeams', t)} label={`Remove ${t}`} /></div>)}</div> : <p className="text-sm text-muted">Star a club from any match or team page. Matches with your clubs appear under Home → Favourites.</p>}
      <h2 className="eyebrow mb-2 mt-6">Players</h2>
      {s.favPlayers.length ? <p className="text-sm text-muted">{s.favPlayers.length} player(s) starred.</p> : <p className="text-sm text-muted">Star players on their profile page.</p>}
    </div>
  )
}

export function Discover() {
  const s = useSettings(); const feat = useCompetitions()
  const [q, setQ] = useState(''); const [busy, setBusy] = useState<string>()
  const cat = useSwr<string[]>('espn-catalogue', 24 * HOUR, async (sig) => (await espnProvider.competitions!(sig)).map((c) => c.id))
  const known = new Set(feat.map((f) => f.id))
  const hits = (cat.data ?? []).filter((id) => !known.has(id) && id.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40)
  async function add(id: string) {
    setBusy(id)
    try { const name = await resolveCompetitionName(id); updateSettings({ extraLeagues: [...getSettings().extraLeagues, { id, name }] }) } catch { updateSettings({ extraLeagues: [...getSettings().extraLeagues, { id, name: id }] }) } finally { setBusy(undefined) }
  }
  return (
    <div className="px-4 pb-28 pt-4 safe-top">
      <h1 className="mb-4 text-2xl font-black">Discover</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search competition codes (e.g. ned, bra, arg)…" aria-label="Search competitions" className="mb-5 min-h-[48px] w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none focus:border-accent" />
      <h2 className="eyebrow mb-2">Your competitions</h2>
      <div className="mb-6 grid gap-2">{feat.map((c) => <div key={c.id} className="card flex items-center justify-between p-3 pl-4"><Link to={`/league/${encodeURIComponent(c.id)}`} className="flex min-h-[44px] flex-1 items-center font-semibold">{c.name}</Link>{s.extraLeagues.some((e) => e.id === c.id) ? <button onClick={() => updateSettings({ extraLeagues: s.extraLeagues.filter((e) => e.id !== c.id) })} className="min-h-[44px] px-3 text-xs font-bold text-faint">Remove</button> : <Star on={s.favLeagues.includes(c.id)} onClick={() => toggleIn('favLeagues', c.id)} label="Favourite" />}</div>)}</div>
      <h2 className="eyebrow mb-2">More from the catalogue {cat.data ? `(${cat.data.length})` : ''}</h2>
      {cat.loading && !cat.data && <p className="text-sm text-muted">Loading catalogue…</p>}
      <div className="grid gap-2">{hits.map((id) => <div key={id} className="card flex items-center justify-between p-3 pl-4"><code className="text-sm">{id}</code><button disabled={busy === id} onClick={() => add(id)} className="min-h-[44px] rounded-full bg-accent px-4 text-xs font-bold text-[color:var(--accent-ink)] disabled:opacity-50">{busy === id ? 'Adding…' : 'Add to Home'}</button></div>)}</div>
      {cat.data && !hits.length && <EmptyState title="Nothing matches" hint="Codes look like eng.1, esp.2, ned.1 or uefa.champions." />}
    </div>
  )
}

export function Settings() {
  const s = useSettings()
  const st = useSwr<{ entries: number; bytes: number }>('cache-stats', 0, () => kvStats())
  const up = useUpdate()
  return (
    <div className="px-4 pb-28 pt-4 safe-top">
      <h1 className="mb-5 text-2xl font-black">Settings</h1>
      <div className="card divide-y divide-line">
        <Row title="Light theme" hint="Dark is the default."><Switch on={s.theme === 'light'} onChange={(v) => updateSettings({ theme: v ? 'light' : 'dark' })} label="Light theme" /></Row>
        <Row title="Use ESPN data" hint="Unofficial public endpoints: live scores, lineups, events, stats and tables. Turn off to use only OpenLigaDB and openfootball (fixtures and results only)."><Switch on={s.espnEnabled} onChange={(v) => updateSettings({ espnEnabled: v })} label="Use ESPN data" /></Row>
        <Row title="Saved data" hint={st.data ? `${st.data.entries} cached items · ${(st.data.bytes / 1024).toFixed(0)} KB` : '…'}><button onClick={async () => { await kvClear(); st.refresh() }} className="min-h-[44px] rounded-full bg-surface3 px-4 text-xs font-bold">Clear</button></Row>
        <Row title="App version" hint={`${APP_VERSION}${up.needRefresh ? ' · update ready' : ' · up to date'}${up.lastCheck ? ` · checked ${ago(up.lastCheck)}` : ''}. Football scores refresh separately.`}>
          {up.needRefresh ? <button onClick={() => void applyUpdate()} disabled={up.updating} className="min-h-[44px] rounded-full bg-accent px-4 text-xs font-bold text-[color:var(--accent-ink)] disabled:opacity-60">{up.updating ? 'Updating…' : 'Update now'}</button>
            : <button onClick={() => void checkForUpdate(true)} className="min-h-[44px] rounded-full bg-surface3 px-4 text-xs font-bold">Check</button>}
        </Row>
        <Row title="Reset app" hint="Fixes a stuck or out-of-date install: clears the service worker and caches, then reloads."><button onClick={resetApp} className="min-h-[44px] rounded-full bg-surface3 px-4 text-xs font-bold">Reset</button></Row>
        <Row title="Replay welcome" hint=""><button onClick={() => updateSettings({ onboarded: false })} className="min-h-[44px] rounded-full bg-surface3 px-4 text-xs font-bold">Open</button></Row>
      </div>
      <div className="mt-8 grid justify-items-center gap-2 text-center text-[12px] text-faint"><Logo size={40} /><p>MishPlay · data from ESPN (unofficial), OpenLigaDB and openfootball (CC0). Not affiliated with any league or club. Crests belong to their owners.</p></div>
    </div>
  )
}
async function resetApp() {
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister() } catch { /* no SW */ }
  try { for (const k of await caches.keys()) await caches.delete(k) } catch { /* no Cache API */ }
  await kvClear()
  location.replace('/')
}
const Row = ({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) => <div className="flex items-center justify-between gap-4 p-4"><div><div className="text-[14px] font-semibold">{title}</div>{hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}</div>{children}</div>
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="grid h-11 w-14 shrink-0 place-items-center"><span className={cx('relative h-7 w-12 rounded-full transition-colors', on ? 'bg-accent' : 'bg-surface3')}><motion.span layout className="absolute top-1 h-5 w-5 rounded-full bg-white shadow" style={{ left: on ? 24 : 4 }} /></span></button>
}

export function Onboarding() {
  const s = useSettings(); const comps = useCompetitions()
  if (s.onboarded) return null
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-bg px-5 pb-10 pt-12 safe-top" role="dialog" aria-label="Welcome to MishPlay">
      <div className="mx-auto max-w-md">
        <Logo size={60} maxVw={16} /><h1 className="mb-1 mt-5 text-3xl font-black tracking-tight">Welcome to Mish<span className="text-accent">Play</span></h1>
        <p className="mb-6 text-muted">Pick the competitions you follow. You can skip this and change it any time.</p>
        <div className="mb-8 grid grid-cols-2 gap-2">{comps.map((c) => <button key={c.id} onClick={() => toggleIn('favLeagues', c.id)} aria-pressed={s.favLeagues.includes(c.id)} className={cx('card p-4 text-left text-sm font-bold transition-colors', s.favLeagues.includes(c.id) && '!border-accent !bg-accent/10')}>{c.name}<div className="mt-1 text-[11px] font-medium text-muted">{c.country}</div></button>)}</div>
        <button onClick={() => updateSettings({ onboarded: true })} className="mb-3 w-full rounded-2xl bg-accent py-3.5 font-bold text-[color:var(--accent-ink)]">{s.favLeagues.length ? 'Continue' : 'Continue without choosing'}</button>
        <button onClick={() => updateSettings({ onboarded: true })} className="w-full py-2 text-sm text-muted">Skip</button>
      </div>
    </div>
  )
}
