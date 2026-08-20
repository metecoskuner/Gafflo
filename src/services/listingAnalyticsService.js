// Stage I — the ONLY module that issues supabase.rpc('record_listing_view'|
// 'get_listing_analytics'|'get_my_listing_analytics') calls. Pages call
// ListingAnalyticsProvider actions, which call these functions — never the client directly.
// There is deliberately no supabase.from('listing_views') call anywhere in the frontend: raw
// viewer rows are not a client-readable surface.
import { supabase } from '../lib/supabase'

function raise(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage)
  wrapped.code = error?.code
  throw wrapped
}

export async function recordListingView(listingId) {
  const { data, error } = await supabase.rpc('record_listing_view', { p_listing_id: listingId })
  if (error) raise(error, 'Could not record this listing view.')
  return Boolean(data)
}

export async function fetchListingAnalytics(listingId) {
  const { data, error } = await supabase.rpc('get_listing_analytics', { p_listing_id: listingId })
  if (error) raise(error, 'Could not load listing analytics.')
  return data?.[0] || null
}

export async function fetchMyListingAnalytics() {
  const { data, error } = await supabase.rpc('get_my_listing_analytics')
  if (error) raise(error, 'Could not load listing analytics.')
  return data || []
}
