import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BottomNav, OfflineBanner } from '../components/Chrome'
import { Splash } from '../components/Splash'
import Home from '../features/home/Home'
import League from '../features/leagues/League'
import MatchCentre from '../features/matches/MatchCentre'
import Team from '../features/teams/Team'
import Player from '../features/teams/Player'
import { Discover, Favourites, Onboarding, Settings as SettingsPage } from '../features/favourites/Pages'
import { GoalCelebration } from '../features/matches/goals'
import { UpdateBanner } from '../components/UpdateBanner'
import { DiagOverlay } from './DiagOverlay'
import { useSettings } from './settings'

function Page({ children }: { children: React.ReactNode }) {
  return <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="mx-auto min-h-full max-w-xl">{children}</motion.main>
}

function Shell() {
  const loc = useLocation()
  return (
    <>
      <Routes location={loc} key={loc.pathname.split('/')[1]}>
        <Route path="/" element={<Page><Home /></Page>} />
        <Route path="/league/:id" element={<Page><League /></Page>} />
        <Route path="/match/:comp/:id" element={<Page><MatchCentre /></Page>} />
        <Route path="/team/:comp/:teamId" element={<Page><Team /></Page>} />
        <Route path="/player/:comp/:teamId/:playerId" element={<Page><Player /></Page>} />
        <Route path="/discover" element={<Page><Discover /></Page>} />
        <Route path="/favourites" element={<Page><Favourites /></Page>} />
        <Route path="/settings" element={<Page><SettingsPage /></Page>} />
        <Route path="*" element={<Page><Home /></Page>} />
      </Routes>
      <OfflineBanner /><UpdateBanner /><DiagOverlay /><BottomNav /><GoalCelebration /><Onboarding />
    </>
  )
}

export default function App() {
  const s = useSettings()
  const [ready, setReady] = useState(false)
  useEffect(() => { document.documentElement.dataset.theme = s.theme; document.querySelector('meta[name=theme-color]')?.setAttribute('content', s.theme === 'light' ? '#f3f6fa' : '#070a0f') }, [s.theme])
  useEffect(() => { const t = setTimeout(() => setReady(true), 900); return () => clearTimeout(t) }, [])
  return (
    <BrowserRouter>
      <AnimatePresence>{!ready && <motion.div key="splash" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><Splash /></motion.div>}</AnimatePresence>
      <Shell />
    </BrowserRouter>
  )
}
