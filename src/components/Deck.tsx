import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Match } from '../services/football/types'
import { MatchCard } from './MatchCard'
import { Skeleton, Star } from './ui'

const order = (m: Match) => (m.status === 'live' || m.status === 'halftime' ? 0 : m.status === 'scheduled' ? 1 : m.status === 'finished' ? 2 : 3)
export const sortForDeck = (ms: Match[]) => [...ms].sort((a, b) => order(a) - order(b) || (order(a) === 2 ? b.kickoffUtc.localeCompare(a.kickoffUtc) : a.kickoffUtc.localeCompare(b.kickoffUtc)))

/** One horizontally scrolling competition section. */
export function Deck({ id, name, country, matches, loading, fav, onFav, error, asOf }: { asOf?: number; id: string; name: string; country?: string; matches?: Match[]; loading?: boolean; fav: boolean; onFav: () => void; error?: ReactNode }) {
  return (
    <section aria-label={name} className="mb-6 w-full min-w-0 max-w-full">
      <div className="mb-3 flex items-center justify-between px-4">
        <Link to={`/league/${encodeURIComponent(id)}`} className="min-w-0">
          <div className="eyebrow">{country}</div>
          <h2 className="truncate text-lg font-extrabold tracking-tight">{name} <span className="text-accent">›</span></h2>
        </Link>
        <Star on={fav} onClick={onFav} label={fav ? `Unfavourite ${name}` : `Favourite ${name}`} />
      </div>
      {loading && !matches ? (
        <div className="hide-scroll flex gap-3 overflow-x-hidden px-4" aria-hidden><Skeleton className="h-[148px] w-[272px] shrink-0" /><Skeleton className="h-[148px] w-[272px] shrink-0" /></div>
      ) : (
        <div className="hide-scroll flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1" data-testid="deck-scroller">
          {sortForDeck(matches ?? []).map((m, i) => <MatchCard key={m.id} m={m} index={i} asOf={asOf} />)}
        </div>
      )}
      {error}
    </section>
  )
}
