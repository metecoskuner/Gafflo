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
// - AccountProfileProvider substitutes a local, in-memory, clearly-labelled fake profile instead
//   of fetching one from Supabase, so ProfileGate resolves and the app renders past onboarding.
//   That fake state lives only in React state for this tab's lifetime — it is never written to
//   localStorage/sessionStorage, never sent to Supabase, and is not the retired fixture/mock data
//   architecture (gafflo.properties and friends) — it exists solely to unblock local rendering.
export const DEV_AUTH_BYPASS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

// Deliberately not a real auth.uid() any Supabase row could ever carry — no RLS policy can match
// this against a real owner/profile id, so it stays inert even if a query somehow used it.
export const DEV_BYPASS_USER = {
  id: '00000000-0000-4000-8000-000000000000',
  email: 'dev-bypass@localhost',
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
