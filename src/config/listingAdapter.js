// Stage C — maps between the real `listings` row shape (snake_case DB columns, from
// public_listings / get_my_listings() / get_my_listing()) and the frontend property shape
// every existing presentation component (Discover, PropertyDetailsModal, LandlordProperties,
// Dashboard, SavedProperties) already expects. Mirrors config/accountProfile.js's row<->fields
// bridge pattern from Stage B.
//
// Enum values are intentionally NOT translated for most fields — domainOptions.js's
// propertyType/roomType/parentPropertyType/bathroomArrangement/furnished/petPolicy/smoking/
// parking option values already match the DB enums exactly (e.g. 'part_furnished',
// 'not_allowed', 'street_permit'), so those pass through unchanged. Only viewing_type and photo
// labels use different spellings on each side and need an explicit map.

const VIEWING_TYPE_TO_LABEL = { in_person: 'In-person', virtual: 'Virtual or in-person' }
const VIEWING_TYPE_TO_DB = { 'In-person': 'in_person', 'Virtual or in-person': 'virtual' }

export function viewingTypeToLabel(value) {
  return VIEWING_TYPE_TO_LABEL[value] || 'In-person'
}
export function viewingTypeToDb(label) {
  return VIEWING_TYPE_TO_DB[label] || 'in_person'
}

export const PHOTO_LABEL_TO_DB = {
  Cover: 'cover',
  'Cover / Room': 'cover',
  'Living room': 'living_room',
  Kitchen: 'kitchen',
  Bedroom: 'bedroom',
  Bathroom: 'bathroom',
  'Shared living area': 'shared_living_area',
  Exterior: 'exterior',
  Other: 'other',
}
const DB_LABEL_TO_PHOTO = {
  cover: 'Cover',
  living_room: 'Living room',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  shared_living_area: 'Shared living area',
  exterior: 'Exterior',
  other: 'Other',
}

export function photoLabelToDb(label) {
  return PHOTO_LABEL_TO_DB[label] || 'other'
}
export function dbLabelToPhotoLabel(value) {
  return DB_LABEL_TO_PHOTO[value] || 'Other'
}

// ---- listings row -> frontend property shape ----------------------------------------------
// `images`/`photoMetadata` (signed URLs, resolved async from listing_images) and `ownerName`
// (resolved async via get_public_profile_summaries) are attached by the caller (ListingsProvider)
// once those batched lookups complete — this function only maps the synchronous listing fields.
//
// trust/promotion/listingTerms/petsInHome/viewingSlots have no backend column at all (see the
// Stage C final report's unsupported-field audit) — every one of them is set to an honest
// empty/null value here, never a fabricated demo object, so downstream components (TrustSummary,
// promotion.js's isListingPromoted, PropertyDetailsModal's listingTerms fallback) fall through to
// their existing "nothing to show yet" rendering instead of inventing verification or a paid boost.
export function mapListingRowToProperty(row) {
  if (!row) return null
  return {
    id: row.id,
    ownerId: row.owner_id,
    // public_listings/the restricted base-table grant never include `status` (only published
    // rows are visible there at all) — so its absence unambiguously means "published".
    listingStatus: row.status || 'published',
    rejectionReason: row.rejection_reason ?? null,
    listingCategory: row.listing_category,

    city: row.city || '',
    area: row.area || '',
    approximateAddress: row.approximate_address || '',
    // Only present on the landlord's own full-detail read (get_my_listing/get_my_listings) —
    // absent (undefined) on a public row, which mapListingRowToProperty callers must never
    // read for a listing they don't own.
    exactAddress: row.exact_address ?? '',
    eircode: row.eircode ?? '',

    rent: row.rent,
    deposit: row.deposit,
    billsIncluded: Boolean(row.bills_included),
    availableFrom: row.available_from,
    minStayMonths: row.min_stay_months,

    propertyType: row.property_type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    maxOccupants: row.max_occupants,

    parentPropertyType: row.parent_property_type,
    roomType: row.room_type,
    totalBedrooms: row.total_bedrooms,
    currentHouseholdSize: row.current_household_size,
    maxHouseholdSize: row.max_household_size,
    bathroomArrangement: row.bathroom_arrangement,
    ownerLivesInProperty: Boolean(row.owner_lives_in_property),
    couplesAccepted: Boolean(row.couples_accepted),

    petsAllowed: row.pets_policy,
    smokingAllowed: row.smoking_policy,
    furnished: row.furnished,
    parking: row.parking,
    viewingType: viewingTypeToLabel(row.viewing_type),

    amenities: row.amenities || [],
    features: row.features || [],
    listingRules: row.listing_rules || [],
    householdSummary: row.household_summary || '',

    title: row.title || '',
    description: row.description || '',

    availabilityConfirmedAt: row.availability_confirmed_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at || '',
    publishedAt: row.published_at || null,

    // Never fabricated — see the module comment above.
    trust: null,
    promotion: null,
    listingTerms: '',
    petsInHome: false,
    viewingSlots: [],

    // Filled in by the caller once resolved; safe non-crashing defaults meanwhile.
    ownerName: '',
    ownerType: 'Private landlord',
    images: [],
    photoMetadata: [],
  }
}

// ---- frontend fields -> listings row (INSERT/UPDATE) ---------------------------------------
// Only-if-present, matching config/accountProfile.js's mapTenantProfileFieldsToRow shape — a
// caller can send a partial update. Deliberately excludes: id, status, rejection_reason,
// removed_reason, every *_at lifecycle timestamp, and owner_id (never writable by `authenticated`
// per the Stage C migrations' column grants — owner_id is set once, at INSERT, by the caller
// explicitly passing the real auth.uid()). exact_address/eircode are also deliberately excluded:
// no current UI collects either one, so writing '' would fabricate a placeholder over a genuine
// NULL — see the Stage C final report's null-semantics section.
export function mapListingFieldsToRow(fields) {
  const row = {}
  if ('listingCategory' in fields) row.listing_category = fields.listingCategory
  if ('city' in fields) row.city = fields.city || null
  if ('area' in fields) row.area = fields.area || null
  if ('approximateAddress' in fields) row.approximate_address = fields.approximateAddress || null
  if ('rent' in fields) row.rent = numOrNull(fields.rent)
  if ('deposit' in fields) row.deposit = numOrNull(fields.deposit)
  if ('billsIncluded' in fields) row.bills_included = Boolean(fields.billsIncluded)
  if ('availableFrom' in fields) row.available_from = fields.availableFrom || null
  if ('minStayMonths' in fields) row.min_stay_months = intOrNull(fields.minStayMonths)
  if ('propertyType' in fields) row.property_type = fields.propertyType || null
  if ('bedrooms' in fields) row.bedrooms = intOrNull(fields.bedrooms)
  if ('bathrooms' in fields) row.bathrooms = numOrNull(fields.bathrooms)
  if ('maxOccupants' in fields) row.max_occupants = intOrNull(fields.maxOccupants)
  if ('parentPropertyType' in fields) row.parent_property_type = fields.parentPropertyType || null
  if ('roomType' in fields) row.room_type = fields.roomType || null
  if ('totalBedrooms' in fields) row.total_bedrooms = intOrNull(fields.totalBedrooms)
  if ('currentHouseholdSize' in fields) row.current_household_size = intOrNull(fields.currentHouseholdSize)
  if ('maxHouseholdSize' in fields) row.max_household_size = intOrNull(fields.maxHouseholdSize)
  if ('bathroomArrangement' in fields) row.bathroom_arrangement = fields.bathroomArrangement || null
  if ('ownerLivesInProperty' in fields) row.owner_lives_in_property = Boolean(fields.ownerLivesInProperty)
  if ('couplesAccepted' in fields) row.couples_accepted = Boolean(fields.couplesAccepted)
  if ('petsAllowed' in fields) row.pets_policy = fields.petsAllowed
  if ('smokingAllowed' in fields) row.smoking_policy = fields.smokingAllowed
  if ('furnished' in fields) row.furnished = fields.furnished
  if ('parking' in fields) row.parking = fields.parking
  if ('viewingType' in fields) row.viewing_type = viewingTypeToDb(fields.viewingType)
  if ('amenities' in fields) row.amenities = fields.amenities || []
  if ('features' in fields) row.features = fields.features || []
  if ('listingRules' in fields) row.listing_rules = fields.listingRules || []
  if ('householdSummary' in fields) row.household_summary = fields.householdSummary || null
  if ('title' in fields) row.title = fields.title || null
  if ('description' in fields) row.description = fields.description || null
  return row
}

function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number.parseInt(String(value), 10)
  return Number.isFinite(num) ? num : null
}

// ---- listing_images row -> frontend photoMetadata shape -------------------------------------
// `src` (a resolved signed URL) is attached by the caller — see ListingsProvider — this only
// maps the durable, DB-owned metadata (id, label, position, isCover).
export function mapListingImageRowToPhoto(row, src) {
  return {
    id: row.id,
    storagePath: row.storage_path,
    label: dbLabelToPhotoLabel(row.label),
    position: row.position,
    isCover: Boolean(row.is_cover),
    src: src || '',
  }
}
