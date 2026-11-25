import { useEffect, useMemo, useRef, useState } from 'react'
// Poster typeface (bundled, so cards render identically and work offline). Latin + Latin-Extended cover player names.
import '@fontsource/hanken-grotesk/latin-500.css'
import '@fontsource/hanken-grotesk/latin-800.css'
import '@fontsource/hanken-grotesk/latin-ext-500.css'
import '@fontsource/hanken-grotesk/latin-ext-800.css'
import { Chip, Tabs, cx } from '../../components/ui'
import { useOnline } from '../../hooks/useSwr'
import { useSettings } from '../../app/settings'
import { teamKey } from '../../services/football/identity'
import type { Match, MatchDetail } from '../../services/football/types'
import { buildShareData, candidateKey, headlineOptions, type HeadlineId, type Side } from './model'
import { FORMATS, MATCH_TEMPLATES, render, type FormatId, type MatchTemplateId } from './draw'
import { loadImage, releaseImages, type Loaded } from './images'
import { BG_NIGHT, creditLines, findPortrait, type Portrait } from './portrait'
import { canShareFiles, canvasToBlob, downloadImage, fileName, shareImage } from './share'

export interface ShareEditorProps { match: Match; detail?: MatchDetail; detailLoading?: boolean; competitionName?: string; asOf?: number; initialKind?: 'match' | 'player'; initialPlayerKey?: string; onClose: () => void }

export default function ShareEditor({ match, detail, detailLoading, competitionName, asOf, initialKind = 'match', initialPlayerKey, onClose }: ShareEditorProps) {
  const online = useOnline()
  const s = useSettings()
  const now = useRef(Date.now())
  const data = useMemo(() => buildShareData(match, detail, { competition: competitionName, asOf, online, now: now.current, detailPending: detailLoading }), [match, detail, competitionName, asOf, online, detailLoading])
  const favSide: Side | undefined = s.favTeams.includes(match.home.id) || s.favTeams.includes(teamKey(match.home.name)) ? 'home' : s.favTeams.includes(match.away.id) || s.favTeams.includes(teamKey(match.away.name)) ? 'away' : undefined

  const topScorer = data.candidates.find((c) => c.goals > 0) ?? data.candidates[0]
  const [kind, setKind] = useState<'match' | 'player'>(initialKind === 'player' || !data.hasResult ? 'player' : 'match')
  const [format, setFormat] = useState<FormatId>('story')
  const [mTpl, setMTpl] = useState<MatchTemplateId>('result')
  const [showScorers, setShowScorers] = useState(true)
  const [showMinutes, setShowMinutes] = useState(true)
  const [guides, setGuides] = useState(false)
  const [highlight, setHighlight] = useState<Side>(favSide ?? 'home')
  const [playerKey, setPlayerKey] = useState<string | undefined>(initialPlayerKey ?? topScorer?.key)
  const [headlineId, setHeadlineId] = useState<HeadlineId>('auto')
  const [background, setBackground] = useState<'atmosphere' | 'photo'>('atmosphere')
  const [portrait, setPortrait] = useState<Portrait | null | 'loading'>(null)
  const [portraitOn, setPortraitOn] = useState(false)
  const [imgs, setImgs] = useState<{ home: Loaded | null; away: Loaded | null; bg: Loaded | null; portrait: Loaded | null; logo: Loaded | null }>({ home: null, away: null, bg: null, portrait: null, logo: null })
  const [loading, setLoading] = useState(true)
  const [fontReady, setFontReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shareable = useMemo(canShareFiles, [])

  const template = kind === 'match' ? mTpl : 'spotlight'
  const player = data.candidates.find((c) => c.key === playerKey)
  const headlines = player ? headlineOptions(player, data) : []
  const headline = headlines.find((h) => h.id === headlineId) ?? headlines[0]

  // licence-gated portrait lookup (exact provider id → Wikidata → Commons licence). Share-alike photos are never on by default.
  useEffect(() => {
    let alive = true; setPortrait(null); setPortraitOn(false)
    if (kind !== 'player' || !player?.espnId) return
    setPortrait('loading')
    findPortrait(player.espnId).then((p) => { if (!alive) return; setPortrait(p); setPortraitOn(p?.credit.cls === 'free') })
    return () => { alive = false }
  }, [kind, player?.espnId])
  const activePortrait = kind === 'player' && portraitOn && portrait && portrait !== 'loading' ? portrait : null
  // load only the images this poster needs; anything missing simply becomes a designed fallback
  useEffect(() => {
    let alive = true; setLoading(true)
    Promise.all([loadImage(match.home.crest), loadImage(match.away.crest), background === 'photo' ? loadImage(BG_NIGHT.url) : Promise.resolve(null), activePortrait ? loadImage(activePortrait.url) : Promise.resolve(null), loadImage('/mish-glyph.svg')])
      .then(([home, away, bg, pt, logo]) => { if (alive) { setImgs({ home, away, bg, portrait: pt, logo }); setLoading(false) } })
    return () => { alive = false }
  }, [match.home.crest, match.away.crest, background, activePortrait?.url])
  // the image credits printed on the poster are exactly the images actually drawn
  const credits = useMemo(() => {
    const used: { credit: Portrait['credit']; kind: string }[] = []
    if (background === 'photo' && imgs.bg && template !== 'fan') used.push({ credit: BG_NIGHT.credit, kind: 'Background' })
    if (activePortrait && imgs.portrait) used.push({ credit: activePortrait.credit, kind: 'Photo' })
    return ['Data: ESPN', ...creditLines(used)]
  }, [background, imgs.bg, imgs.portrait, activePortrait])
  // the poster typeface must be loaded (for every glyph we will draw) before the first render
  useEffect(() => {
    const sample = `0123456789${match.home.name}${match.away.name}${data.candidates.map((c) => c.name).join('')}`
    let alive = true
    Promise.all([document.fonts.load('800 64px "Hanken Grotesk"', sample), document.fonts.load('500 40px "Hanken Grotesk"', sample)]).catch(() => undefined).finally(() => alive && setFontReady(true))
    return () => { alive = false }
  }, [match.home.name, match.away.name, data.candidates])
  useEffect(() => () => releaseImages(), [])
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onClose])
  useEffect(() => { setHeadlineId('auto') }, [playerKey])

  const canRender = kind === 'match' ? data.hasResult : !!player && data.hasResult
  // once match details arrive and no player was chosen yet, default to the top scorer
  useEffect(() => { if (!playerKey && topScorer) setPlayerKey(topScorer.key) }, [playerKey, topScorer])
  useEffect(() => {
    if (loading || !fontReady || !canvasRef.current || !canRender) return
    render(canvasRef.current, { kind, format, template: kind === 'match' ? mTpl : 'spotlight', background, credits, data, showScorers, showMinutes, highlight, player, headline: headline?.text || undefined, imgs })
  }, [loading, fontReady, canRender, kind, format, mTpl, background, credits, data, showScorers, showMinutes, highlight, player, headline?.text, imgs])

  const name = () => fileName(kind === 'match' ? [match.home.name, String(match.homeScore), String(match.awayScore), match.away.name] : [player?.name ?? 'player', match.home.name, 'v', match.away.name], format)
  const caption = `${match.home.name} ${match.homeScore ?? ''}–${match.awayScore ?? ''} ${match.away.name}${data.status.kind === 'live' ? ' (live)' : ''}`
  async function make() { if (!canvasRef.current) throw new Error('Nothing to export yet'); return canvasToBlob(canvasRef.current) }
  async function onSave() { setBusy(true); try { downloadImage(await make(), name()); setMsg({ text: 'Image saved. Add it to your Instagram Story or post from your gallery.', tone: 'ok' }) } catch (e) { setMsg({ text: (e as Error).message, tone: 'warn' }) } finally { setBusy(false) } }
  async function onShare() {
    setBusy(true)
    try { const r = await shareImage(await make(), name(), caption); setMsg(r === 'shared' ? { text: 'Shared.', tone: 'ok' } : r === 'failed' ? { text: "Sharing didn't work on this device. Use Save image instead.", tone: 'warn' } : null) }
    catch (e) { setMsg({ text: (e as Error).message, tone: 'warn' }) } finally { setBusy(false) }
  }

  const F = FORMATS[format]
  return (
    <div role="dialog" aria-modal aria-label="Share image" className="fixed inset-0 z-[70] flex flex-col bg-bg">
      <div className="safe-top flex items-center justify-between px-4 pb-2">
        <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-surface2"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <h2 className="text-[17px] font-extrabold">Create image</h2><div className="w-11" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        <div className="relative mx-auto mb-4 w-fit max-w-full" data-testid="share-preview">
          {canRender ? (
            <>
              <canvas ref={canvasRef} data-testid="share-canvas" aria-label={`Preview of the ${F.label} image`} className={cx('block rounded-2xl shadow-[var(--shadow)]', loading && 'opacity-40')} style={{ maxHeight: '54dvh', maxWidth: '100%', width: 'auto', height: 'auto' }} />
              {guides && <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl">
                <div className="absolute inset-x-0 top-0 border-b border-dashed border-white/70 bg-black/30" style={{ height: `${(F.safeTop / F.h) * 100}%` }}><span className="m-1 block text-[10px] font-bold text-white/90">Instagram may cover this</span></div>
                <div className="absolute inset-x-0 bottom-0 border-t border-dashed border-white/70 bg-black/30" style={{ height: `${(F.safeBottom / F.h) * 100}%` }} />
              </div>}
            </>
          ) : (
            <div className="card grid max-w-sm place-items-center gap-2 p-6 text-center text-sm text-muted">{kind === 'match' ? 'A result card needs a score. It becomes available once the match has started and the source reports a score.' : 'No player data for this match yet.'}</div>
          )}
        </div>

        {data.detailPending && <p role="status" className="mb-3 text-center text-[12px] text-muted">Loading scorers and lineups…</p>}
        <Tabs label="Content" value={kind} onChange={setKind} tabs={[{ id: 'match', label: 'Match result' }, { id: 'player', label: 'Player' }]} />
        <Section title="Format"><div className="hide-scroll flex gap-2 overflow-x-auto">{(Object.keys(FORMATS) as FormatId[]).map((f) => <Chip key={f} active={format === f} onClick={() => setFormat(f)}>{FORMATS[f].short}</Chip>)}</div></Section>
        {kind === 'match' && <Section title="Template"><div className="hide-scroll flex gap-2 overflow-x-auto">{MATCH_TEMPLATES.map((t) => <Chip key={t.id} active={mTpl === t.id} onClick={() => setMTpl(t.id)}>{t.label}</Chip>)}</div></Section>}

        {!(kind === 'match' && mTpl === 'fan') && !activePortrait && <Section title="Background"><div className="hide-scroll flex gap-2 overflow-x-auto" role="group" aria-label="Background">
          <Chip active={background === 'atmosphere'} onClick={() => setBackground('atmosphere')}>MishPlay glow</Chip><Chip active={background === 'photo'} onClick={() => setBackground('photo')}>Stadium night</Chip></div>
          {background === 'photo' && <p className="mt-2 text-[12px] text-muted">Photo “{BG_NIGHT.credit.title}” by {BG_NIGHT.credit.author}, {BG_NIGHT.credit.licence} (Wikimedia Commons). Blurred and darkened; credited on the image.</p>}</Section>}
        {kind === 'match' && mTpl === 'fan' && <Section title="I support"><div className="flex gap-2">{(['home', 'away'] as Side[]).map((sd) => <Chip key={sd} active={highlight === sd} onClick={() => setHighlight(sd)}>{(sd === 'home' ? match.home : match.away).shortName ?? (sd === 'home' ? match.home : match.away).name}</Chip>)}</div></Section>}

        {kind === 'player' && (
          <>
            <Section title="Player">
              {data.candidates.length ? <div className="hide-scroll flex gap-2 overflow-x-auto" role="group" aria-label="Choose player">{data.candidates.slice(0, 40).map((c) => <Chip key={c.key} active={playerKey === c.key} onClick={() => setPlayerKey(c.key)}>{c.goals > 0 ? `⚽ ${c.name}${c.goals > 1 ? ` ×${c.goals}` : ''}` : c.name}</Chip>)}</div>
                : <p className="text-sm text-muted">The data source hasn't supplied lineups or goal events for this match, so there are no players to feature.</p>}
            </Section>
            {player && <Section title="Headline"><div className="hide-scroll flex gap-2 overflow-x-auto" role="group" aria-label="Headline">{headlines.map((h) => <Chip key={h.id} active={(headline?.id ?? 'auto') === h.id} onClick={() => setHeadlineId(h.id)}>{h.label}</Chip>)}</div>
              {headline?.id === 'potm' && <p className="mt-2 text-[12px] text-muted">This wording is your choice; MishPlay's data doesn't confirm a Player of the Match.</p>}</Section>}
            {player && <PortraitControl portrait={portrait} on={portraitOn} setOn={setPortraitOn} hasId={!!player.espnId} />}
          </>
        )}

        <Section title="Include"><div className="flex flex-wrap gap-2">
          <Chip active={showScorers && kind === 'match' && mTpl !== 'result'} disabled={kind !== 'match' || mTpl === 'result'} onClick={() => setShowScorers((v) => !v)}>List scorers</Chip>
          <Chip active={showMinutes} onClick={() => setShowMinutes((v) => !v)}>Goal minutes</Chip>
          <Chip active={guides} onClick={() => setGuides((v) => !v)}>Show safe area</Chip>
        </div></Section>
        {kind === 'match' && data.status.kind === 'live' && <p className="mt-3 text-[12px] text-muted">This match is live. The image is a snapshot, so it is labelled LIVE with the time it was made. It will not update.</p>}
        {kind === 'match' && data.status.kind === 'stale' && <p className="mt-3 text-[12px] text-muted">This is the last saved score, not a live one, and the image says so.</p>}
        <p className="mt-4 text-[11px] text-faint">Images are made on your device and never uploaded. Crests come from the data source (ESPN) and belong to their clubs. Photos are only used when openly licensed, and are credited on the image. Output: PNG, {F.w}×{F.h}.</p>
      </div>

      <div className="safe-bottom border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur-xl">
        <div className={cx('mb-2 min-h-[18px] text-[12px]', msg?.tone === 'warn' ? 'text-warn' : 'text-accent')} role="status" aria-live="polite">{msg?.text ?? (!shareable ? "This browser can't share images directly. Save the image, then add it to Instagram from your gallery." : "Share opens your device's share sheet, where you can pick Instagram.")}</div>
        <div className="flex gap-2 pb-3">
          {shareable && <button onClick={onShare} disabled={busy || loading || !canRender} className="min-h-[48px] flex-1 rounded-2xl bg-accent text-[15px] font-extrabold text-[color:var(--accent-ink)] disabled:opacity-50">{busy ? 'Working…' : 'Share'}</button>}
          <button onClick={onSave} disabled={busy || loading || !canRender} className={cx('min-h-[48px] rounded-2xl text-[15px] font-extrabold disabled:opacity-50', shareable ? 'bg-surface3 px-6' : 'flex-1 bg-accent text-[color:var(--accent-ink)]')}>Save image</button>
        </div>
      </div>
    </div>
  )
}
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="mt-4"><div className="eyebrow mb-2">{title}</div>{children}</div>

function PortraitControl({ portrait, on, setOn, hasId }: { portrait: Portrait | null | 'loading'; on: boolean; setOn: (v: boolean) => void; hasId: boolean }) {
  if (portrait === 'loading') return <p role="status" className="mt-3 text-[12px] text-muted">Checking for an openly licensed photo…</p>
  if (!portrait) return <p className="mt-3 text-[12px] text-muted">{hasId ? 'No openly licensed photo found for this player, so the poster uses the typography layout (crest, name, shirt number).' : 'No verified photo for this player, so the poster uses the typography layout.'}</p>
  const c = portrait.credit, sa = c.cls === 'sharealike'
  return (
    <Section title="Portrait">
      <div className="flex gap-2"><Chip active={on} onClick={() => setOn(!on)}>{sa ? 'Use CC BY-SA photo' : 'Use photo'}</Chip></div>
      <p className="mt-2 text-[12px] text-muted">{c.author} · {c.licence} · Wikimedia Commons.{sa ? ' ShareAlike: the poster is then labelled “licensed CC BY-SA 4.0”, and anyone who shares it must keep that licence.' : ' Credited on the poster.'}{c.restrictions ? ' Personality rights may apply to this person’s image.' : ''}</p>
    </Section>
  )
}
