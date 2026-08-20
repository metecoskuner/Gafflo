// Centralized, deterministic classification of real backend Saved/Smart Match errors — mirrors
// config/viewingErrors.js's own role and structure exactly. Keyed by SQLSTATE (error.code from
// services/engagementService.js's raise()); the message lookup only applies within 42501/P0001,
// which legitimately cover more than one distinct real meaning across the two RPCs. Every entry
// is an exact match against a known, versioned server string — see
// supabase/migrations/20260820120000_saved_smart_match_persistence.sql for the authoritative,
// finite set this maps. Anything unmatched falls through to one safe, generic, non-technical
// message — never raw Postgres/PostgREST/stack-trace text.

const KNOWN_MESSAGES = {
  'Account is not active': 'Your account cannot currently do this. Contact support if this seems wrong.',
  'A tenant profile is required to save listings': 'Complete your tenant profile to save listings.',
  'A tenant profile is required for Smart Match': 'Complete your tenant profile to use Smart Match.',
  'Listing not found': 'This listing could not be found.',
  'You cannot save your own listing': 'You cannot save your own listing.',
  'You cannot Smart Match your own listing': 'You cannot Smart Match your own listing.',
  'This listing is not currently available to save': 'This listing is not currently available to save.',
  'This listing is not currently available for Smart Match': 'This listing is no longer available.',
  'You have already made a different Smart Match decision for this listing': 'You have already made a different decision on this listing.',
  "You have reached today's Smart Match limit": "You've reached today's Smart Match limit.",
  "You have reached today's Interested limit": "You've reached today's Interested limit.",
}

const GENERIC_FALLBACK = 'Something went wrong. Please try again.'

export function describeEngagementError(error) {
  if (!error) return GENERIC_FALLBACK
  if ((error.code === '42501' || error.code === 'P0001') && KNOWN_MESSAGES[error.message]) {
    return KNOWN_MESSAGES[error.message]
  }
  return GENERIC_FALLBACK
}

export function isSmartMatchQuotaError(error) {
  return error?.message === "You have reached today's Smart Match limit"
}

export function isInterestedQuotaError(error) {
  return error?.message === "You have reached today's Interested limit"
}
