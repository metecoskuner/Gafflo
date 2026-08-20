// Real messaging (Stage E) uses the backend's own client_message_id idempotency mechanism
// instead of a client-side text/time duplicate heuristic — see config/messageAdapter.js and
// context/MessagingProvider.jsx. sanitizeMessageBody still applies there (mirrors the backend's
// own whitespace normalization before the 1200-char check). hasDuplicateRecentMessage and
// hasDuplicateEnquiry were specific to the retired mock enquiry/conversation domain and have no
// real equivalent — deleted rather than ported, along with their tests.
export function sanitizeMessageBody(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 1200)
}

// Still used by config/entitlements.js's dormant (not currently wired to any real UI, and
// explicitly out of scope to build further — see the Stage E report) canSendPremiumFollowUp —
// kept only for that, operating on the same mock-shaped conversation object it always has.
export function hasLandlordMessage(conversation) {
  return (conversation?.messages || []).some((message) => message.sender === 'landlord')
}
