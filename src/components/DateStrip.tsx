import { addDays, dayLabel, localYmd } from '../utils/time'
import { cx } from './ui'

export function DateStrip({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const today = localYmd(new Date())
  const quick = [addDays(today, -1), today, addDays(today, 1)]
  const isQuick = quick.includes(value)
  return (
    <div className="flex items-center gap-2 px-4" role="group" aria-label="Match date">
      {quick.map((d) => (
        <button key={d} onClick={() => onChange(d)} aria-pressed={value === d} className={cx('min-h-[44px] flex-1 rounded-2xl border text-[13px] font-bold transition-colors', value === d ? 'border-accent bg-accent text-[color:var(--accent-ink)]' : 'border-line bg-surface text-muted')}>{dayLabel(d, today)}</button>
      ))}
      <label className={cx('relative grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-2xl border', !isQuick ? 'border-accent text-accent' : 'border-line bg-surface text-muted')} title="Pick a date">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        <input type="date" aria-label="Choose date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="absolute inset-0 h-full w-full min-w-0 max-w-full cursor-pointer opacity-0" />
      </label>
    </div>
  )
}
