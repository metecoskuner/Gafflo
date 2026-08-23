// Single source of truth for Gafflo's public support contact address, read from VITE_SUPPORT_EMAIL.
// This is a PUBLIC, non-secret value — any VITE_-prefixed variable is inlined into the shipped
// client bundle and visible to anyone who opens dev tools, exactly like VITE_SUPABASE_URL. Never
// put anything sensitive behind this pattern.
//
// Returns null, never a fabricated address, when unset — every caller must handle that honestly
// (e.g. by softening "email us" copy) rather than assuming a real inbox always exists. See
// docs/dev-qa.md's "Support contact" section for why this is currently unset and what's required
// before public launch.

// Split out from getSupportEmail() so the normalization itself (trim, blank-string-is-unset) is
// unit-testable without needing to mock import.meta.env, which Vite/Vitest resolve statically.
export function normalizeSupportEmail(raw) {
  const trimmed = String(raw || '').trim()
  return trimmed || null
}

export function getSupportEmail() {
  return normalizeSupportEmail(import.meta.env.VITE_SUPPORT_EMAIL)
}
