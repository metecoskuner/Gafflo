import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import RoomDetailsModal from './components/RoomDetailsModal'
import { AppStateProvider } from './context/AppState'
import Home from './pages/Home'
import SavedRooms from './pages/SavedRooms'
import SwipeRooms from './pages/SwipeRooms'
import TenantProfile from './pages/TenantProfile'

function AppLayout() {
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation
  const routeLocation = backgroundLocation || location

  return (
    <>
      <div className="page-shell mx-auto flex min-h-screen w-full max-w-[1120px] flex-col px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:px-6 md:pb-12">
        <Navbar />
        <main className="flex-1 py-4 md:py-7">
          <Routes location={routeLocation}>
            <Route path="/" element={<Home />} />
            <Route path="/profile" element={<TenantProfile />} />
            <Route path="/rooms" element={<SwipeRooms />} />
            <Route path="/saved" element={<SavedRooms />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
      <BottomNav />

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
