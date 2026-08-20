// Centralized, deterministic classification of real backend messaging errors — mirrors
// config/applicationErrors.js's approach exactly. Keyed primarily by SQLSTATE (error.code from
// services/messagingService.js's raise()); the message lookup only ever applies within the two
// SQLSTATEs that cover more than one distinct real meaning (42501/P0001), and always as an exact
// match against a known, versioned server string from
// supabase/migrations/20260819001016_messaging_pipeline.sql — never a substring/regex guess.
// Anything unmatched (network error, unexpected backend change) falls through to one safe,
// generic message — no SQL/PostgREST internals ever reach the UI through this path.
//
// Note: "Messaging is not currently available in this conversation" is the backend's own single
// message for BOTH "you are blocked/blocking the other participant" AND "one participant isn't
// active" — this is intentional (see the migration's send_message() comment: RLS/the block table
// never lets a client learn "who blocked whom" from the other side), so the frontend cannot and
// must not try to guess which of the two it was.

const KNOWN_MESSAGES = {
  'Account is not active': 'Your account cannot currently do this. Contact support if this seems wrong.',
  'A tenant profile is required to start a conversation': 'Complete your tenant profile before messaging a landlord.',
  'Listing not found': 'This listing could not be found.',
  'This listing is not currently open for enquiries': 'This listing is not currently accepting messages.',
  'This listing is not currently accepting enquiries': 'This listing is not currently accepting messages.',
  'You cannot start a conversation about your own listing': 'You cannot message yourself about your own listing.',
  'Message cannot be empty': 'Write a message before sending.',
  'Message is too long (maximum 1200 characters)': 'Message is too long (maximum 1200 characters).',
  'Not authorized': 'You are not able to do this.',
  'Messaging is not currently available in this conversation': 'Messaging is not currently available in this conversation.',
  'You have already sent a message — wait for the landlord to reply before sending another':
    'You already sent a message — wait for the landlord to reply before sending another.',
  'Cannot block yourself': 'You cannot block yourself.',
  'User not found': 'That user could not be found.',
}

const GENERIC_FALLBACK = 'Something went wrong. Please try again.'

export function describeMessagingError(error) {
  if (!error) return GENERIC_FALLBACK
  if ((error.code === '42501' || error.code === 'P0001') && KNOWN_MESSAGES[error.message]) {
    return KNOWN_MESSAGES[error.message]
  }
  return GENERIC_FALLBACK
}
