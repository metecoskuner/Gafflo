import Auth from '../pages/Auth'
import useAuth from '../context/useAuth'

// Sits directly inside AuthProvider, above AppStateProvider: the marketplace (mock or real)
// never mounts until Supabase has actually reported a session, so there is no frame where an
// unauthenticated visitor briefly sees marketplace UI while auth is still resolving.
export default function AuthGate({ children }) {
  const { loading, user, devAuthBypassActive } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white">
        <span
          className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600"
          role="status"
          aria-label="Loading Gafflo"
        />
      </div>
    )
  }

  if (!user) {
    return <Auth />
  }

  return (
    <>
      {devAuthBypassActive ? <DevAuthBypassBanner /> : null}
      {children}
    </>
  )
}

// Loud on purpose — this only ever renders when VITE_DEV_BYPASS_AUTH bypassed real Supabase
// auth (see config/devAuthBypass.js), so anyone looking at the screen knows nothing they see is
// backed by a real session. `pointer-events-none` because this status text wraps to two lines on
// narrow (~390px) viewports, tall enough to sit over the app header's own buttons underneath it —
// without this, that made the notifications/filter icons genuinely unclickable at mobile widths
// (Stage Z). The banner has no interactive content of its own, so this is a no-op for it.
function DevAuthBypassBanner() {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-[999] bg-amber-500 px-3 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-black"
    >
      Dev auth bypass active — local inspection only, no real Supabase session
    </div>
  )
}
