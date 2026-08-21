// Stage J1 — the ONLY module that calls supabase.rpc('report_listing'). There is deliberately no
// supabase.from('listing_reports') call anywhere in the frontend: raw report rows are not a
// client-readable surface for anyone, including the reporter themselves (see the migration's own
// comment on why no read RPC exists for a non-moderator).
import { supabase } from '../lib/supabase'

export async function reportListing(listingId, reason, description) {
  const { data, error } = await supabase.rpc('report_listing', {
    p_listing_id: listingId,
    p_reason: reason,
    p_description: description || null,
  })
  if (error) {
    const wrapped = new Error(error.message || 'Could not submit this report.')
    wrapped.code = error.code
    throw wrapped
  }
  return Boolean(data)
}
