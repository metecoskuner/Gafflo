// Stage D — the ONLY module that issues supabase.from('applications'|'application_status_events')
// / supabase.rpc('create_application'|'withdraw_application'|'mark_application_viewed'|
// 'landlord_set_application_status') calls. Pages call ApplicationsProvider's actions, which call
// these functions — never the client directly (mirrors listingsService.js's role from Stage C).
// RLS + the guarded SECURITY DEFINER functions on the real tables are the actual authorization
// boundary; these are thin, typed wrappers around it, not a second copy of it.
import { supabase } from '../lib/supabase'

const APPLICATION_COLUMNS = [
  'id', 'listing_id', 'tenant_id', 'status',
  'tenant_snapshot', 'rental_fit_score', 'rental_fit_breakdown', 'rental_fit_algorithm_version',
  'first_viewed_at', 'created_at', 'updated_at',
].join(', ')

// Preserves error.code (PostgREST/Postgres SQLSTATE, e.g. '23505' or '42501') alongside a
// human-readable message — callers branch on the code (see ApplicationsProvider.applyToListing's
// duplicate-application handling) while still getting the same message-first fallback shape
// listingsService.js's raise() uses.
function raise(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage)
  wrapped.code = error?.code
  throw wrapped
}

// RLS alone already returns exactly the right row set for whoever is asking — every application
// where the caller is the tenant, UNION every application to a listing the caller owns (see
// applications_select_tenant / applications_select_landlord in the Stage D migration) — so one
// unfiltered select is both correct and sufficient. ApplicationsProvider splits the result by
// tenant_id afterward rather than this module trying to know which "side" the caller is on.
export async function fetchMyApplications() {
  const { data, error } = await supabase.from('applications').select(APPLICATION_COLUMNS)
  if (error) raise(error, 'Could not load applications.')
  return data || []
}

export async function fetchApplicationStatusEvents(applicationId) {
  const { data, error } = await supabase
    .from('application_status_events')
    .select('id, application_id, from_status, to_status, actor_id, created_at')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true })
  if (error) raise(error, 'Could not load application history.')
  return data || []
}

// The only INSERT path — tenant identity, owner identity, status, snapshot and Rental Fit are
// all derived server-side from p_listing_id alone (see create_application() in the Stage D
// migration). Never pass anything else here.
export async function createApplication(listingId) {
  const { data, error } = await supabase.rpc('create_application', { p_listing_id: listingId })
  if (error) raise(error, 'Could not submit this application.')
  return data
}

export async function withdrawApplication(applicationId) {
  const { error } = await supabase.rpc('withdraw_application', { p_application_id: applicationId })
  if (error) raise(error, 'Could not withdraw this application.')
}

export async function markApplicationViewed(applicationId) {
  const { error } = await supabase.rpc('mark_application_viewed', { p_application_id: applicationId })
  if (error) raise(error, 'Could not update this application.')
}

// p_new_status must be one of landlord_interested/shortlisted/not_selected/closed — the only
// four values landlord_set_application_status() accepts. See config/applicationStatus.js for the
// single place the frontend enumerates these.
export async function landlordSetApplicationStatus(applicationId, status) {
  const { error } = await supabase.rpc('landlord_set_application_status', {
    p_application_id: applicationId,
    p_new_status: status,
  })
  if (error) raise(error, 'Could not update this applicant.')
}
