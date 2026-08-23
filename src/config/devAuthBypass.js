// DEV-ONLY escape hatch so a developer can see the full app shell (role selection, onboarding,
// dashboard, discover, profile, etc.) without completing the real Supabase email-OTP flow — and
// without sending a real magic-link email — on every reload.
//
// Safety model (read before touching this file):
// - Gated on `import.meta.env.DEV`, which Vite hardcodes to `false` for every `vite build`
//   production bundle regardless of what a stray .env file contains, *and* an explicit opt-in
//   flag. A leftover VITE_DEV_BYPASS_AUTH=true in a deployed .env therefore still cannot
//   activate this in production — the DEV check alone already makes the branch unreachable.
// - Never touches the real Supabase auth client (see ../lib/supabase.js). No token is issued, no
//   credential is stored, no supabase.auth.signIn*/setSession call is ever made. Every real
//   supabase.from()/rpc() call the app makes while this is on is therefore a genuine,
//   unauthenticated (anon) request — still fully governed by real RLS. It cannot grant backend
//   privileges, and cannot read or write anything a logged-out visitor couldn't already reach.
// - AccountProfileProvider substitutes a local, clearly-labelled fake profile instead of fetching
//   one from Supabase, so ProfileGate resolves and the app renders past onboarding. That fake
//   state is mirrored into sessionStorage (see loadDevBypassProfileState/saveDevBypassProfileState
//   below) purely so a direct URL/reload doesn't lose an already-made role choice and bounce back
//   to RoleSelection — it is still never sent to Supabase, still cleared on sign-out (see
//   AuthProvider's dev-bypass signOut branch) or when the tab/browser closes (sessionStorage, not
//   localStorage), and is not the retired fixture/mock data architecture (gafflo.properties and
//   friends) — it exists solely to unblock local rendering across reloads within one tab.
export const DEV_AUTH_BYPASS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

// Deliberately not a real auth.uid() any Supabase row could ever carry — no RLS policy can match
// this against a real owner/profile id, so it stays inert even if a query somehow used it.
export const DEV_BYPASS_USER = {
  id: '00000000-0000-4000-8000-000000000000',
  email: 'dev-bypass@localhost',
}

// A real write failing under dev-bypass always has the same root cause (no real session for RLS
// to authorize), and the raw error text a guarded RPC/table returns for that ("permission denied
// for table saved_listings", etc.) is a real Postgres message, not something written for a
// tenant/landlord to read. Swap in one honest, consistent explanation instead — but only in
// bypass mode; a genuine real-auth failure still surfaces its real message unchanged, since that
// one might actually be actionable (a validation error, a real conflict) rather than "there was
// never a session here to begin with."
export function friendlyWriteError(rawError) {
  if (!DEV_AUTH_BYPASS_ENABLED) return rawError
  return "This needs a real sign-in — local preview can't save changes."
}

export function warnDevAuthBypassActive() {
  console.warn(
    '[Gafflo] VITE_DEV_BYPASS_AUTH is ON — auth and profile gates are skipped using local-only ' +
      'fake state, for UI inspection only. There is no real Supabase session: real reads/writes ' +
      'still run unauthenticated and are still subject to RLS, so most backend writes will fail. ' +
      'Never set this flag outside local development.',
  )
}

// A fresh-looking, obviously-fake profile shell — never fetched from or written to Supabase.
// `profile.lastActiveRole` starts null on purpose so the bypass walks the same RoleSelection ->
// Onboarding -> Dashboard path a real first-time user would, rather than skipping it.
export function createDevBypassProfileState() {
  return {
    profile: { id: DEV_BYPASS_USER.id, displayName: 'Dev Bypass (local only)', avatarUrl: null, lastActiveRole: null },
    tenantProfile: null,
    landlordProfile: null,
    loading: false,
    error: null,
  }
}

const DEV_BYPASS_STATE_STORAGE_KEY = 'gafflo-dev-bypass-profile-state'

// A direct URL (or a plain reload) of e.g. /profile or /listings/new used to always bounce back
// to RoleSelection, even right after picking a role and finishing the fake onboarding walk —
// createDevBypassProfileState() re-seeds a genuinely blank profile on every mount, and a full
// page load always re-mounts. sessionStorage carries the already-made choice across that reload
// without pretending it's a real, durably persisted account: it is tab-scoped, gone the moment
// the tab/browser closes, and explicitly cleared on dev-bypass sign-out below.
export function loadDevBypassProfileState() {
  try {
    const raw = sessionStorage.getItem(DEV_BYPASS_STATE_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // Storage unavailable (privacy mode, etc.) or corrupted — fall through to a fresh state,
    // exactly as if this were the very first load. A local-preview convenience is never worth a
    // hard failure over.
  }
  return createDevBypassProfileState()
}

export function saveDevBypassProfileState(state) {
  try {
    sessionStorage.setItem(DEV_BYPASS_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // best-effort only, same reasoning as above
  }
}

export function clearDevBypassProfileState() {
  try {
    sessionStorage.removeItem(DEV_BYPASS_STATE_STORAGE_KEY)
  } catch {
    // best-effort only
  }
}
