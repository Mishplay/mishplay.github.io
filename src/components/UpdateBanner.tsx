import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { applyUpdate, clearOfflineReady, postpone, useUpdate } from '../app/update'
import { Logo } from './ui'

/**
 * APP update prompt. Football data refreshes on its own and never uses this.
 * Non-blocking card above the bottom nav. Not shown on match pages (never interrupts a match), only once per session
 * after "Later", and the update stays installable from Settings.
 */
export function UpdateBanner() {
  const u = useUpdate()
  const onMatch = useLocation().pathname.startsWith('/match/')
  useEffect(() => { if (!u.offlineReady) return; const t = setTimeout(clearOfflineReady, 4500); return () => clearTimeout(t) }, [u.offlineReady])
  const show = u.needRefresh && (!u.dismissed || u.updating) && !onMatch
  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div role="alertdialog" aria-labelledby="upd-title" aria-describedby="upd-desc" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed inset-x-3 z-40 mx-auto max-w-xl" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}>
            <div className="card p-4">
              <div className="flex items-start gap-3">
                <Logo size={34} />
                <div className="min-w-0 flex-1">
                  <div className="eyebrow text-accent">App update</div>
                  <div id="upd-title" className="text-[15px] font-extrabold leading-tight">Update available</div>
                  <p id="upd-desc" className="mt-1 text-[13px] text-muted [overflow-wrap:anywhere]">A new version of MishPlay is ready with improvements and fixes. Your favourites and saved data are kept. <span className="text-faint">Scores and fixtures refresh on their own.</span></p>
                  {u.error && <p role="alert" className="mt-1 text-[12px] text-warn">{u.error}</p>}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => void applyUpdate()} disabled={u.updating} className="min-h-[44px] flex-1 rounded-2xl bg-accent text-sm font-bold text-[color:var(--accent-ink)] disabled:opacity-60">{u.updating ? 'Updating…' : 'Update now'}</button>
                <button onClick={postpone} disabled={u.updating} className="min-h-[44px] rounded-2xl bg-surface3 px-5 text-sm font-bold disabled:opacity-60">Later</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {u.offlineReady && !show && (
          <motion.div role="status" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 z-40 mx-auto w-fit max-w-[calc(100vw-24px)] rounded-full bg-surface3 px-4 py-2 text-[13px] font-semibold" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}>
            MishPlay is ready to use offline
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
