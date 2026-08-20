// Stage G — the ONLY module that issues supabase.from('saved_listings'|'smart_match_decisions'|
// 'smart_match_daily_usage') / supabase.rpc('set_listing_saved'|'record_smart_match_decision'|
// 'get_smart_match_usage') calls. Pages call EngagementProvider's actions, which call these
// functions — never the client directly (mirrors viewingsService.js/messagingService.js's role
// from Stage E/F). RLS + the guarded SECURITY DEFINER functions on the real tables are the
// actual authorization boundary.
import { supabase } from '../lib/supabase'

function raise(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage)
  wrapped.code = error?.code
  throw wrapped
}

// RLS (saved_listings_select_own) already returns exactly the caller's own rows — one
// unfiltered select is both correct and sufficient, matching every prior Stage's own
// fetchMyX() precedent.
export async function fetchMySavedListings() {
  const { data, error } = await supabase.from('saved_listings').select('id, listing_id, created_at')
  if (error) raise(error, 'Could not load saved listings.')
  return data || []
}

export async function fetchMySmartMatchDecisions() {
  const { data, error } = await supabase.from('smart_match_decisions').select('id, listing_id, decision, decided_at')
  if (error) raise(error, 'Could not load Smart Match history.')
  return data || []
}

export async function setListingSaved(listingId, saved) {
  const { error } = await supabase.rpc('set_listing_saved', { p_listing_id: listingId, p_saved: saved })
  if (error) raise(error, saved ? 'Could not save this listing.' : 'Could not remove this saved listing.')
}

// Returns { decision, smartMatchCount, interestedCount } — the RPC's own authoritative
// post-write usage, so the caller never needs a second round trip just to refresh counts.
export async function recordSmartMatchDecision(listingId, decision) {
  const { data, error } = await supabase.rpc('record_smart_match_decision', { p_listing_id: listingId, p_decision: decision })
  if (error) raise(error, 'Could not record this Smart Match decision.')
  return data
}

export async function fetchSmartMatchUsage() {
  const { data, error } = await supabase.rpc('get_smart_match_usage')
  if (error) raise(error, 'Could not load today\'s Smart Match usage.')
  return data?.[0] || { usage_date: null, smart_match_count: 0, interested_count: 0 }
}
