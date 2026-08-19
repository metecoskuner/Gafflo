import Auth from '../pages/Auth'
import useAuth from '../context/useAuth'

// Sits directly inside AuthProvider, above AppStateProvider: the marketplace (mock or real)
// never mounts until Supabase has actually reported a session, so there is no frame where an
// unauthenticated visitor briefly sees marketplace UI while auth is still resolving.
export default function AuthGate({ children }) {
  const { loading, user } = useAuth()

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

  return children
}
