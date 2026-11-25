import { motion } from 'framer-motion'
import { Logo } from './ui'

/** Branded loader: the M-goalpost glyph with a rolling ball. */
export function Splash() {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-bg" role="status" aria-label="Loading MishPlay">
      <div className="grid justify-items-center gap-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}><Logo size={112} maxVw={26} /></motion.div>
        <div className="relative h-6 overflow-hidden" style={{ width: 'min(160px, 44vw)' }}><div className="absolute bottom-0 left-0 right-0 h-px bg-line" />
          <div className="anim-ball-roll absolute bottom-1 left-1/2 -ml-2.5 h-5 w-5 rounded-full bg-accent shadow-[0_0_18px_var(--accent)]"><span className="absolute inset-1.5 rounded-full bg-bg" /></div>
        </div>
        <div className="eyebrow">MishPlay</div>
      </div>
    </div>
  )
}
