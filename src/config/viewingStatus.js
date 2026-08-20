// Stage F — the ONLY place that enumerates the real viewing_proposal_status_t vocabulary
// (pending/confirmed/declined/cancelled) or decides how it labels — mirrors
// config/applicationStatus.js's own role for application_status_t. Deliberately a distinct enum
// from application_status_t: a viewing_proposals row's status and its parent application's status
// are related but never the same value (see config/viewingAdapter.js).

export const MAX_VIEWING_SLOTS = 3

const STATUS_INFO = {
  pending: { label: 'Awaiting your response', landlordLabel: 'Awaiting tenant response', description: 'Waiting for the tenant to choose a time.' },
  confirmed: { label: 'Confirmed', landlordLabel: 'Confirmed', description: 'This viewing is confirmed.' },
  declined: { label: 'Declined', landlordLabel: 'Declined', description: 'The tenant declined this viewing.' },
  cancelled: { label: 'Cancelled', landlordLabel: 'Cancelled', description: 'This viewing was cancelled.' },
}

export function getViewingStatusInfo(status) {
  return STATUS_INFO[status] || { label: status || 'Unknown', landlordLabel: status || 'Unknown', description: '' }
}

// Client-side pre-check only, mirroring propose_viewing()'s own validation exactly (1-3 slots,
// ends_at > starts_at, starts_at in the future, no duplicate starts) so obvious mistakes are
// caught before a round trip — the backend re-validates everything itself regardless and remains
// the real authority (see the propose_viewing() RPC in the Stage F migration).
export function validateProposedSlots(slots, now = new Date()) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return { valid: false, reason: 'Add at least one viewing time.' }
  }
  if (slots.length > MAX_VIEWING_SLOTS) {
    return { valid: false, reason: `Propose at most ${MAX_VIEWING_SLOTS} viewing times.` }
  }

  const nowTime = new Date(now).getTime()
  const seenStarts = new Set()

  for (const slot of slots) {
    if (!slot?.startsAt || !slot?.endsAt) {
      return { valid: false, reason: 'Enter a date, start time and end time for every viewing slot.' }
    }
    const startTime = new Date(slot.startsAt).getTime()
    const endTime = new Date(slot.endsAt).getTime()
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
      return { valid: false, reason: 'Enter a valid date and time for every viewing slot.' }
    }
    if (endTime <= startTime) {
      return { valid: false, reason: 'Each end time must be after its start time.' }
    }
    if (startTime <= nowTime) {
      return { valid: false, reason: 'Viewing times must be in the future.' }
    }
    if (seenStarts.has(startTime)) {
      return { valid: false, reason: 'Remove duplicate viewing times.' }
    }
    seenStarts.add(startTime)
  }

  return { valid: true, reason: '' }
}
