// Stage F — translates real viewing_proposals/viewing_slots rows into the shape components
// consume, and handles the one place local (Ireland) date/time form input converts to a real
// timestamptz. `applicationId` (not `application_id`) mirrors applicationAdapter.js's own
// camelCase convention.

// A landlord's "date" + "start time" + "end time" form fields are three separate local strings
// (YYYY-MM-DD, HH:MM) — never assembled with Date.UTC or a manually appended "Z", both of which
// would treat the wall-clock numbers as UTC and silently shift an intended 18:00 Dublin time to
// 17:00/19:00 UTC. The multi-argument Date constructor below interprets year/month/day/hours/
// minutes as local time in whatever timezone the browser is actually running in (Ireland, for
// every real Gafflo user) and .toISOString() converts that to the correct UTC instant, DST
// included automatically — the same "no explicit timeZone override, trust the environment" idiom
// utils/dateUtils.js's formatDate/formatViewingSlotDateTime already use for the reverse direction.
export function combineLocalDateAndTimeToIso(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null
  const [year, month, day] = String(dateValue).split('-').map(Number)
  const [hours, minutes] = String(timeValue).split(':').map(Number)
  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) return null
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function mapViewingSlotRowToSlot(row) {
  return { id: row.id, startsAt: row.starts_at, endsAt: row.ends_at }
}

export function mapViewingProposalRowToProposal(row, ctx) {
  const slots = (row.viewing_slots || [])
    .map(mapViewingSlotRowToSlot)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const acceptedSlot = slots.find((slot) => slot.id === row.confirmed_slot_id) || null
  const isTenant = row.tenant_id === ctx.userId

  return {
    id: row.id,
    applicationId: row.application_id,
    landlordId: row.landlord_id,
    tenantId: row.tenant_id,
    isTenant,
    status: row.status,
    slots,
    acceptedSlot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    respondedAt: row.responded_at,
    cancelledAt: row.cancelled_at,
  }
}

// "At most one open (pending/confirmed) proposal per application" is a real backend invariant
// (viewing_proposals_one_open_per_application) — an application can only ever have more than one
// proposal in its full history if the earlier ones are declined/cancelled, so this is a safe,
// simple pick, not a guess.
export function getActiveViewingForApplication(viewings, applicationId) {
  return viewings.find((viewing) => viewing.applicationId === applicationId && (viewing.status === 'pending' || viewing.status === 'confirmed')) || null
}
