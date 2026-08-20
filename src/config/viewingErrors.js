// Centralized, deterministic classification of real backend viewing errors — mirrors
// config/applicationErrors.js's own role and structure exactly. Keyed primarily by SQLSTATE
// (error.code from services/viewingsService.js's raise()); the message lookup only applies within
// the SQLSTATEs that legitimately cover more than one distinct real meaning (42501 covers account-
// not-active, not-authorized, and blocked across all four RPCs; P0001 covers plain validation/
// state-transition raises; 23505 is the unique_violation on "one open proposal per application").
// Every entry is an exact match (or, for the one message the backend interpolates a live value
// into, a prefix match) against a known, versioned server string — see
// supabase/migrations/20260819015347_viewings_pipeline.sql for the authoritative, finite set this
// maps. Anything unmatched falls through to one safe, generic, non-technical message.

const KNOWN_MESSAGES = {
  'Account is not active': 'Your account cannot currently do this. Contact support if this seems wrong.',
  'Not authorized': 'You are not able to do this.',
  'This listing is not currently in a state that accepts new viewing proposals': 'This listing is not currently accepting new viewing proposals.',
  'This applicant is not currently able to receive a viewing proposal': 'This applicant cannot currently receive a viewing proposal.',
  'A new viewing cannot be proposed for this application': 'A new viewing cannot be proposed for this application right now.',
  'Propose at least one viewing time': 'Add at least one viewing time.',
  'Propose at most 3 viewing times': 'Propose at most 3 viewing times.',
  'Each viewing slot needs a valid starts_at and ends_at': 'Enter a valid date and time for every viewing slot.',
  "Each viewing slot's end time must be after its start time": 'Each end time must be after its start time.',
  'Viewing times must be in the future': 'Viewing times must be in the future.',
  'Duplicate viewing slot times are not allowed': 'Remove duplicate viewing times.',
  'This viewing is already confirmed for a different time': 'This viewing is already confirmed for a different time.',
  'This viewing proposal is no longer open': 'This viewing proposal is no longer open.',
  'That time is not one of the proposed slots for this viewing': 'That time is not one of the proposed times for this viewing.',
  'That viewing time has already passed': 'That viewing time has already passed.',
  'This viewing cannot be confirmed right now': 'This viewing cannot be confirmed right now.',
  'This listing is no longer in a state that accepts viewing confirmations': 'This listing can no longer accept viewing confirmations.',
  'This viewing proposal cannot be cancelled from its current state': 'This viewing can no longer be cancelled.',
  'Use cancel_viewing() to move a viewing-stage application back to shortlisted': 'Cancel the active viewing before changing this application further.',
}

// propose_viewing() interpolates the application's live status into this one message
// ("...(current status: %)"), so it can never be an exact match.
const SHORTLISTED_ONLY_PREFIX = 'A viewing can only be proposed for a shortlisted application'

const GENERIC_FALLBACK = 'Something went wrong. Please try again.'

export function describeViewingError(error) {
  if (!error) return GENERIC_FALLBACK
  // 23505 (unique_violation) means a real concurrent proposal already won the race for this
  // application — the caller's own attempt simply lost, not a client bug.
  if (error.code === '23505') return 'This application already has an open viewing proposal.'
  if (error.code === '42501' || error.code === 'P0001') {
    if (typeof error.message === 'string' && error.message.startsWith(SHORTLISTED_ONLY_PREFIX)) {
      return 'A viewing can only be proposed for a shortlisted application.'
    }
    if (KNOWN_MESSAGES[error.message]) return KNOWN_MESSAGES[error.message]
  }
  return GENERIC_FALLBACK
}
