import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import RoomDetailsModal from './components/RoomDetailsModal'
import Button from './components/Button'
import { AppStateProvider } from './context/AppState'
import useAppState from './context/useAppState'
import Home from './pages/Home'
import Messages from './pages/Messages'
import SavedRooms from './pages/SavedRooms'
import SwipeRooms from './pages/SwipeRooms'
import TenantProfile from './pages/TenantProfile'

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation
  const routeLocation = backgroundLocation || location
  const isLandingPage = routeLocation.pathname === '/'
  const isAppRoute = !isLandingPage
  const { canUndo, undoLastAction } = useAppState()
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  useEffect(() => {
    if (!isAppRoute) return undefined

    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [isAppRoute])

  const handleUndo = () => {
    if (!undoLastAction()) return
    const shell = document.getElementById('app-shell-scroll')
    shell?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  return (
    <>
      {isAppRoute ? (
        <div className="page-shell relative mx-auto h-[100dvh] w-full max-w-[560px] overflow-hidden md:max-w-[620px]">
          <AppHeader canUndo={canUndo} onFilterOpen={() => setIsFilterOpen(true)} onUndo={handleUndo} />
          <main
            id="app-shell-scroll"
            className="h-[100dvh] overflow-y-auto px-4 pb-[calc(9.75rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+5.5rem)] md:px-6"
          >
            <Routes location={routeLocation}>
              <Route path="/profile" element={<TenantProfile />} />
              <Route path="/rooms" element={<SwipeRooms />} />
              <Route path="/saved" element={<SavedRooms />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <BottomNav />
          <FilterSheet
            isOpen={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
            onUpdateProfile={() => {
              setIsFilterOpen(false)
              navigate('/profile')
            }}
          />
        </div>
      ) : (
        <div className="page-shell mx-auto flex min-h-screen w-full max-w-[1120px] flex-col px-4 pb-10 md:px-6 md:pb-12">
          <Navbar />
          <main className="flex-1 py-4 md:py-7">
            <Routes location={routeLocation}>
              <Route path="/" element={<Home />} />
              <Route path="/profile" element={<TenantProfile />} />
              <Route path="/rooms" element={<SwipeRooms />} />
              <Route path="/saved" element={<SavedRooms />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      )}

      {backgroundLocation ? (
        <Routes>
          <Route path="/rooms/:roomId" element={<RoomDetailsModal />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/rooms/:roomId" element={<RoomDetailsModal standalone />} />
        </Routes>
      )}
    </>
  )
}

export default function App() {
  return (
    <AppStateProvider>
      <AppLayout />
    </AppStateProvider>
  )
}

function AppHeader({ canUndo, onUndo, onFilterOpen }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] md:px-6">
      <div className="pointer-events-auto flex w-full items-center justify-between rounded-[24px] border border-white/70 bg-[rgba(255,247,237,0.82)] px-4 py-3 shadow-[0_18px_38px_-26px_rgba(15,23,42,0.34)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="shadow-pressable flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-base font-semibold text-white">
            ⌂
          </div>
          <div className="text-lg font-semibold tracking-tight text-slate-950">Gafflo</div>
        </div>

        <div className="flex items-center gap-2">
          <HeaderIconButton ariaLabel="Undo last swipe" disabled={!canUndo} icon="↶" onClick={onUndo} />
          <HeaderIconButton ariaLabel="Open filters" icon="☷" onClick={onFilterOpen} />
        </div>
      </div>
    </div>
  )
}

function HeaderIconButton({ ariaLabel, disabled = false, icon, onClick }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/88 text-lg text-slate-700 shadow-soft transition hover:bg-white active:scale-[0.97] disabled:opacity-45"
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}

function FilterSheet({ isOpen, onClose, onUpdateProfile }) {
  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-50">
      <button type="button" aria-label="Close filters" className="absolute inset-0 bg-slate-950/28 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6">
        <div className="card-surface card-shadow w-full rounded-[32px] px-5 pb-5 pt-4">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          <div className="mt-4 text-lg font-semibold text-slate-950">Filters</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Filters are coming soon. For now, Gafflo ranks rooms using your profile.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
            {['Budget', 'Area', 'Move-in date', 'House vibe'].map((item) => (
              <div key={item} className="surface-line rounded-[18px] bg-slate-50 px-3 py-3 font-medium">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-3">
            <Button className="flex-1" onClick={onUpdateProfile}>
              Update profile
            </Button>
            <Button className="flex-1" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
