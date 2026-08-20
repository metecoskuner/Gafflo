// Centralized, deterministic classification of real backend application errors. Keyed primarily
// by SQLSTATE (error.code from services/applicationsService.js's raise()), which is stable
// regardless of any future wording change; the message lookup below only ever applies within the
// two SQLSTATEs that legitimately cover more than one distinct real meaning (42501 covers
// "account not active", "not authorized" and "cannot apply to your own listing" across
// create_application/withdraw_application/mark_application_viewed/
// landlord_set_application_status; P0001 covers several plain validation/state-transition raises)
// — see supabase/migrations/20260818232524_applications_pipeline.sql for the authoritative,
// finite set this maps. Every entry is an exact match against a known, versioned server string,
// never a substring/regex guess against arbitrary text. Anything that doesn't match a known
// code+message combination (a network error, an unexpected backend change, anything else) falls
// through to one safe, generic, non-technical message — no SQL/PostgREST internals, stack traces,
// or raw object dumps are ever allowed to reach the UI through this path.

const KNOWN_MESSAGES = {
  'Account is not active': 'Your account cannot currently do this. Contact support if this seems wrong.',
  'You cannot apply to your own listing': 'You cannot apply to your own listing.',
  'This listing is not currently open for applications': 'This listing is not currently accepting applications.',
  'This listing is not currently accepting applications': 'This listing is not currently accepting applications.',
  'A tenant profile is required to apply': 'Complete your tenant profile before applying.',
  'Listing not found': 'This listing could not be found.',
  'You have already applied to this listing': 'You have already applied to this listing.',
  'Not authorized': 'You are not able to do this.',
  'This application has already reached a terminal state': 'This application has already reached a final state and can no longer be changed.',
  'Not a valid landlord decision status': 'That action is not available for this application.',
}

const GENERIC_FALLBACK = 'Something went wrong. Please try again.'

export function describeApplicationError(error) {
  if (!error) return GENERIC_FALLBACK
  // 23505 (unique_violation) never reaches the UI as an error in normal use — applyToListing
  // treats it as "already applied" and reconciles silently — but a caller that does surface it
  // (e.g. a forced direct duplicate) still gets a real, correct message, not a raw constraint name.
  if (error.code === '23505') return KNOWN_MESSAGES['You have already applied to this listing']
  if ((error.code === '42501' || error.code === 'P0001') && KNOWN_MESSAGES[error.message]) {
    return KNOWN_MESSAGES[error.message]
  }
  return GENERIC_FALLBACK
}
