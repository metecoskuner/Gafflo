// Stage F — the ONLY module that issues supabase.from('viewing_proposals'|'viewing_slots') /
// supabase.rpc('propose_viewing'|'accept_viewing_slot'|'decline_viewing'|'cancel_viewing') calls.
// Pages call ViewingsProvider's actions, which call these functions — never the client directly
// (mirrors applicationsService.js/messagingService.js's role from Stage D/E). RLS + the guarded
// SECURITY DEFINER functions on the real tables are the actual authorization boundary.
import { supabase } from '../lib/supabase'

const PROPOSAL_COLUMNS =
  'id, application_id, landlord_id, tenant_id, status, confirmed_slot_id, ' +
  'created_at, updated_at, responded_at, cancelled_at, ' +
  'viewing_slots(id, starts_at, ends_at)'

function raise(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage)
  wrapped.code = error?.code
  throw wrapped
}

// RLS (viewing_proposals_select_participant) already returns exactly the caller's own proposals
// (as tenant OR landlord) — one unfiltered select is both correct and sufficient, matching
// applicationsService.js's own fetchMyApplications() precedent. viewing_slots is embedded so this
// is one round trip for every proposal + its slots, never one query per proposal.
export async function fetchMyViewingProposals() {
  const { data, error } = await supabase.from('viewing_proposals').select(PROPOSAL_COLUMNS)
  if (error) raise(error, 'Could not load viewings.')
  return data || []
}

// The only INSERT path for viewing_proposals/viewing_slots. slots is an array of
// { startsAt, endsAt } ISO strings (already timezone-correct — see config/viewingAdapter.js's
// slotsToPayload) — landlord_id/tenant_id/status/application status are all derived server-side
// from p_application_id alone; the only client input is which application and which candidate
// times. Returns the new proposal's id (uuid), not a full row — callers refetch.
export async function proposeViewing(applicationId, slots) {
  const { data, error } = await supabase.rpc('propose_viewing', {
    p_application_id: applicationId,
    p_slots: slots.map((slot) => ({ starts_at: slot.startsAt, ends_at: slot.endsAt })),
  })
  if (error) raise(error, 'Could not propose this viewing.')
  return data
}

export async function acceptViewingSlot(proposalId, slotId) {
  const { error } = await supabase.rpc('accept_viewing_slot', { p_proposal_id: proposalId, p_slot_id: slotId })
  if (error) raise(error, 'Could not confirm this viewing time.')
}

export async function declineViewing(proposalId) {
  const { error } = await supabase.rpc('decline_viewing', { p_proposal_id: proposalId })
  if (error) raise(error, 'Could not decline this viewing.')
}

export async function cancelViewing(proposalId) {
  const { error } = await supabase.rpc('cancel_viewing', { p_proposal_id: proposalId })
  if (error) raise(error, 'Could not cancel this viewing.')
}
