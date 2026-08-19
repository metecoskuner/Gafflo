import useAccountProfile from '../context/useAccountProfile'

// Mirrors AuthGate: sits inside AccountProfileProvider, above AppStateProvider, so the mock
// marketplace, RoleSelection and onboarding never render off partially-loaded (or stale
// previous-user) profile state — no flash of the wrong role, wrong onboarding step, or fake
// defaults while the real profiles/tenant_profiles/landlord_profiles rows are still loading.
export default function ProfileGate({ children }) {
  const { loading } = useAccountProfile()

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white">
        <span
          className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600"
          role="status"
          aria-label="Loading your profile"
        />
      </div>
    )
  }

  return children
}
