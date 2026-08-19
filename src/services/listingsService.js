// Stage C — the ONLY module that issues supabase.from('listings'|'listing_images') /
// supabase.storage.from('listing-photos') / listing-related supabase.rpc() calls. Pages call
// ListingsProvider's actions, which call these functions — never the client directly (mirrors
// AccountProfileProvider's "single real source of truth" role from Stage B). Every function here
// uses the shared publishable-key client from lib/supabase.js; nothing here ever touches
// service_role or the DB password. RLS on the real tables/bucket policies is the actual
// authorization boundary — these are thin, typed wrappers around it, not a second copy of it.
import { mapListingFieldsToRow } from '../config/listingAdapter'
import { supabase } from '../lib/supabase'

const BUCKET = 'listing-photos'

const PUBLIC_LISTING_COLUMNS = [
  'id', 'owner_id', 'listing_category',
  'city', 'area', 'approximate_address',
  'rent', 'deposit', 'bills_included', 'available_from', 'min_stay_months',
  'property_type', 'bedrooms', 'bathrooms', 'max_occupants',
  'parent_property_type', 'room_type', 'total_bedrooms', 'current_household_size', 'max_household_size',
  'bathroom_arrangement', 'owner_lives_in_property', 'couples_accepted',
  'pets_policy', 'smoking_policy', 'furnished', 'parking', 'viewing_type',
  'amenities', 'features', 'listing_rules', 'household_summary',
  'title', 'description', 'availability_confirmed_at', 'created_at', 'updated_at', 'published_at',
].join(', ')

function raise(error, fallbackMessage) {
  throw new Error(error?.message || fallbackMessage)
}

// ---- reads ------------------------------------------------------------------------------------

export async function fetchPublicListings() {
  const { data, error } = await supabase.from('public_listings').select(PUBLIC_LISTING_COLUMNS)
  if (error) raise(error, 'Could not load listings.')
  return data || []
}

export async function fetchMyListings() {
  const { data, error } = await supabase.rpc('get_my_listings')
  if (error) raise(error, 'Could not load your listings.')
  return data || []
}

export async function fetchListingImagesForListings(listingIds) {
  if (!listingIds.length) return []
  const { data, error } = await supabase
    .from('listing_images')
    .select('id, listing_id, storage_path, label, position, is_cover, mime_type, size_bytes')
    .in('listing_id', listingIds)
    .order('position', { ascending: true })
  if (error) raise(error, 'Could not load listing photos.')
  return data || []
}

export async function fetchPublicProfileSummaries(profileIds) {
  const unique = [...new Set(profileIds.filter(Boolean))]
  if (!unique.length) return {}
  const { data, error } = await supabase.rpc('get_public_profile_summaries', { p_profile_ids: unique })
  if (error) raise(error, 'Could not load owner display names.')
  const map = {}
  ;(data || []).forEach((row) => {
    map[row.id] = { displayName: row.display_name || '', avatarUrl: row.avatar_url || null }
  })
  return map
}

// ---- writes: listing lifecycle ------------------------------------------------------------

// .select() with no column list defaults to `select=*`, which the column-restricted SELECT
// grant (see the Stage C migration's section 8) rejects outright — that grant deliberately never
// includes exact_address/eircode/rejection_reason/removed_reason/the internal moderation
// timestamps for `authenticated`, only get_my_listing()/get_my_listings() (SECURITY DEFINER) can
// read those. Confirmed against the real project: a bare `.select()` after insert/update returns
// 403 "permission denied for table listings". PUBLIC_LISTING_COLUMNS is exactly the grant's own
// column list, so requesting it back here always succeeds — refreshListings() re-fetches the
// full authoritative row (via get_my_listings()) right after anyway, so this is never the last
// word on what the caller sees, just an immediate, always-succeeding echo of what was just written.
export async function createListingDraft(ownerId, fields) {
  const row = { ...mapListingFieldsToRow(fields), owner_id: ownerId }
  const { data, error } = await supabase.from('listings').insert(row).select(PUBLIC_LISTING_COLUMNS).single()
  if (error) raise(error, 'Could not create the listing draft.')
  return data
}

export async function updateListingFields(listingId, fields) {
  const row = mapListingFieldsToRow(fields)
  const { data, error } = await supabase.from('listings').update(row).eq('id', listingId).select(PUBLIC_LISTING_COLUMNS).single()
  if (error) raise(error, 'Could not save the listing.')
  return data
}

export async function requestListingReview(listingId) {
  const { error } = await supabase.rpc('request_listing_review', { p_listing_id: listingId })
  if (error) raise(error, error?.message || 'Listing is not ready for review.')
}

export async function withdrawListingFromReview(listingId) {
  const { error } = await supabase.rpc('withdraw_listing_from_review', { p_listing_id: listingId })
  if (error) raise(error, 'Could not withdraw this listing from review.')
}

export async function pauseListing(listingId) {
  const { error } = await supabase.rpc('pause_listing', { p_listing_id: listingId })
  if (error) raise(error, 'Could not pause this listing.')
}

export async function resumeListing(listingId) {
  const { error } = await supabase.rpc('resume_listing', { p_listing_id: listingId })
  if (error) raise(error, 'Could not resume this listing.')
}

export async function markListingRented(listingId) {
  const { error } = await supabase.rpc('mark_listing_rented', { p_listing_id: listingId })
  if (error) raise(error, 'Could not mark this listing as rented.')
}

// ---- writes: photos -----------------------------------------------------------------------

const MIME_TO_EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function extensionForMime(mimeType) {
  return MIME_TO_EXTENSION[mimeType] || 'jpg'
}

// Two real network steps, not one: Storage bytes, then DB metadata registration. On a
// registration failure the object already exists in Storage with nothing durable pointing at
// it — best-effort delete it immediately so a retry cannot collide on the same generated path
// and so no orphan silently lingers. If the cleanup delete itself fails (e.g. a transient
// network error), the upload error is still what the caller sees and acts on; the object stays
// as an orphan for a future storage sweep (see the Stage C final report) rather than being
// reported to the landlord as a success.
export async function uploadAndRegisterListingImage(listingId, file, { label = 'other', isCover = false } = {}) {
  const imageId = crypto.randomUUID()
  const path = `${listingId}/${imageId}.${extensionForMime(file.type)}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
  if (uploadError) raise(uploadError, 'Could not upload this photo.')

  try {
    const { data: newImageId, error: registerError } = await supabase.rpc('register_listing_image', {
      p_listing_id: listingId,
      p_storage_path: path,
      p_label: label,
      p_is_cover: isCover,
    })
    if (registerError) throw registerError
    return { id: newImageId, storagePath: path }
  } catch (registerError) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    raise(registerError, 'Photo uploaded but could not be saved to the listing. It was not kept.')
  }
}

export async function setListingCoverImage(listingId, imageId) {
  const { error } = await supabase.rpc('set_listing_cover_image', { p_listing_id: listingId, p_image_id: imageId })
  if (error) raise(error, 'Could not set the cover photo.')
}

export async function reorderListingImages(listingId, imageIds) {
  const { error } = await supabase.rpc('reorder_listing_images', { p_listing_id: listingId, p_image_ids: imageIds })
  if (error) raise(error, 'Could not reorder photos.')
}

// The one real, atomic deletion path (listing_images row + Storage object, same server-side
// transaction) — see the harden_real_platform_grants migration's delete_listing_image() for
// why this must never be replaced with a raw `storage.objects` delete from the client.
export async function deleteListingImage(imageId) {
  const { error } = await supabase.rpc('delete_listing_image', { p_image_id: imageId })
  if (error) raise(error, 'Could not delete this photo.')
}

// ---- signed URLs --------------------------------------------------------------------------

export async function createSignedImageUrls(paths, expiresInSeconds) {
  if (!paths.length) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresInSeconds)
  if (error) raise(error, 'Could not load listing photos.')
  const map = {}
  ;(data || []).forEach((item) => {
    if (!item.error && item.signedUrl) map[item.path] = item.signedUrl
  })
  return map
}
