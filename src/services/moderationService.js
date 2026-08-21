// Stage K — the ONLY module that issues moderator-facing supabase.rpc() calls. The workspace
// page calls the functions this exports, never the client directly.
import { supabase } from '../lib/supabase'

function raise(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage)
  wrapped.code = error?.code
  throw wrapped
}

export async function amIModerator() {
  const { data, error } = await supabase.rpc('am_i_moderator')
  if (error) return false
  return Boolean(data)
}

export async function fetchOpenReports() {
  const { data, error } = await supabase.rpc('list_listing_reports', { p_status: 'open' })
  if (error) raise(error, 'Could not load reports.')
  return data || []
}

export async function resolveReport(reportId, status) {
  const { error } = await supabase.rpc('resolve_listing_report', { p_report_id: reportId, p_status: status })
  if (error) raise(error, 'Could not update this report.')
}

export async function fetchPendingListings() {
  const { data, error } = await supabase.rpc('list_listings_pending_review')
  if (error) raise(error, 'Could not load listings pending review.')
  return data || []
}

// Reused for both the reports queue's "listing title/address summary" and the pending-listings
// queue's own detail — get_listing_for_moderation() already exists (Phase 1B) and is
// moderator-gated the same way every RPC here is; no new listing-read RPC is needed for this.
export async function fetchListingForModeration(listingId) {
  const { data, error } = await supabase.rpc('get_listing_for_moderation', { p_listing_id: listingId })
  if (error) raise(error, 'Could not load this listing.')
  return data
}

export async function approveListing(listingId) {
  const { error } = await supabase.rpc('moderator_approve_listing', { p_listing_id: listingId })
  if (error) raise(error, 'Could not approve this listing.')
}

export async function rejectListing(listingId, reason) {
  const { error } = await supabase.rpc('moderator_reject_listing', { p_listing_id: listingId, p_reason: reason })
  if (error) raise(error, 'Could not reject this listing.')
}

export async function removeListing(listingId, reason) {
  const { error } = await supabase.rpc('moderator_remove_listing', { p_listing_id: listingId, p_reason: reason })
  if (error) raise(error, 'Could not remove this listing.')
}
