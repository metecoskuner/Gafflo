import {
  normalizeBathroomArrangement,
  normalizeFurnished,
  normalizeParking,
  normalizePetPolicy,
  normalizePropertyType,
  normalizeRoomParentPropertyType,
  normalizeRoomType,
  normalizeSmoking,
} from './domainOptions'

export const LISTING_CATEGORIES = {
  ENTIRE_PROPERTY: 'entire_property',
  PRIVATE_ROOM: 'private_room',
  OWNER_OCCUPIED_ROOM: 'owner_occupied_room',
}

export const listingCategoryOptions = [
  {
    value: LISTING_CATEGORIES.ENTIRE_PROPERTY,
    label: 'Entire property',
    description: 'An apartment, house or studio rented as a complete home.',
  },
  {
    value: LISTING_CATEGORIES.PRIVATE_ROOM,
    label: 'Private room',
    description: 'A private bedroom in a shared house or apartment.',
  },
  {
    value: LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM,
    label: 'Room in my own home',
    detailLabel: 'Room in owner-occupied home',
    description: 'A room in a home where the owner also lives.',
  },
]

const listingCategoryValues = new Set(listingCategoryOptions.map((option) => option.value))
const roomCategories = new Set([LISTING_CATEGORIES.PRIVATE_ROOM, LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM])
const preReviewStatuses = new Set(['draft', 'rejected'])

export function isRoomListing(category) {
  return roomCategories.has(normalizeListingCategory(category))
}

export function listingCategoryLabel(value) {
  const normalized = normalizeListingCategory(value)
  const option = listingCategoryOptions.find((item) => item.value === normalized)
  return option?.detailLabel || option?.label || 'Entire property'
}

export function tenantLookingForMatches(lookingFor = 'any', listingCategory = LISTING_CATEGORIES.ENTIRE_PROPERTY) {
  const category = normalizeListingCategory(listingCategory)
  if (!lookingFor || lookingFor === 'any') return true
  if (lookingFor === 'room') return isRoomListing(category)
  return lookingFor === category
}

export function inferListingCategory(listing = {}) {
  if (listingCategoryValues.has(listing.listingCategory)) return listing.listingCategory
  if (listing.ownerLivesInProperty === true) return LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM
  if (
    listing.roomType ||
    listing.parentPropertyType ||
    listing.totalBedrooms ||
    listing.currentHouseholdSize ||
    listing.maxHouseholdSize ||
    listing.bathroomArrangement
  ) {
    return LISTING_CATEGORIES.PRIVATE_ROOM
  }
  return LISTING_CATEGORIES.ENTIRE_PROPERTY
}

export function normalizeListingCategory(value, listing = {}) {
  return listingCategoryValues.has(value) ? value : inferListingCategory(listing)
}

export function normalizeListingForStorage(listing = {}) {
  const listingCategory = normalizeListingCategory(listing.listingCategory, listing)
  const isRoom = isRoomListing(listingCategory)
  const propertyType = isRoom ? normalizeRoomParentPropertyType(listing.parentPropertyType || listing.propertyType) : normalizePropertyType(listing.propertyType)
  const bedrooms = propertyType === 'studio' && !isRoom ? 0 : positiveInteger(listing.bedrooms, isRoom ? 1 : 1)
  const currentHouseholdSize = positiveInteger(listing.currentHouseholdSize, 1)
  const maxHouseholdSize = Math.max(positiveInteger(listing.maxHouseholdSize, currentHouseholdSize + 1), currentHouseholdSize + 1)

  return {
    ...listing,
    listingCategory,
    propertyType,
    parentPropertyType: isRoom ? propertyType : undefined,
    roomType: isRoom ? normalizeRoomType(listing.roomType) : undefined,
    ownerLivesInProperty: listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM,
    bedrooms: isRoom ? 1 : bedrooms,
    totalBedrooms: isRoom ? positiveInteger(listing.totalBedrooms, Math.max(2, bedrooms)) : undefined,
    bathrooms: positiveNumber(listing.bathrooms, 1),
    maxOccupants: isRoom ? positiveInteger(listing.maxOccupants, 1) : positiveInteger(listing.maxOccupants, bedrooms > 0 ? bedrooms : 1),
    currentHouseholdSize: isRoom ? currentHouseholdSize : undefined,
    maxHouseholdSize: isRoom ? maxHouseholdSize : undefined,
    bathroomArrangement: isRoom ? normalizeBathroomArrangement(listing.bathroomArrangement) : undefined,
    furnished: normalizeFurnished(listing.furnished),
    parking: normalizeParking(listing.parking),
    smokingAllowed: normalizeSmoking(listing.smokingAllowed),
    petsAllowed: normalizePetPolicy(listing.petsAllowed),
  }
}

export function normalizeListingFormValues(form = {}) {
  const listing = normalizeListingForStorage(form)
  return {
    ...listing,
    bedrooms: listing.propertyType === 'studio' && listing.listingCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? '0' : String(listing.bedrooms ?? ''),
    bathrooms: String(listing.bathrooms ?? ''),
    maxOccupants: String(listing.maxOccupants ?? ''),
    totalBedrooms: listing.totalBedrooms === undefined ? '' : String(listing.totalBedrooms),
    currentHouseholdSize: listing.currentHouseholdSize === undefined ? '' : String(listing.currentHouseholdSize),
    maxHouseholdSize: listing.maxHouseholdSize === undefined ? '' : String(listing.maxHouseholdSize),
  }
}

export function validateListingForReview(listing = {}, today = '') {
  const normalized = normalizeListingForStorage(listing)
  const errors = {}

  addTextError(errors, 'title', listing.title, 8, 90, 'Add a clear listing title.')
  if (!positiveNumber(listing.rent, 0)) errors.rent = 'Monthly rent must be more than EUR0.'
  if (listing.deposit === '' || Number(listing.deposit) < 0 || Number.isNaN(Number(listing.deposit))) errors.deposit = 'Deposit cannot be negative.'
  addTextError(errors, 'area', listing.area, 1, 70, 'Add the area or neighbourhood.')
  if (!listing.availableFrom) errors.availableFrom = 'Choose the available-from date.'
  if (today && listing.availableFrom && listing.availableFrom < today) errors.availableFrom = 'Available-from date cannot be in the past.'
  if (!positiveInteger(listing.minStayMonths, 0)) errors.minStayMonths = 'Minimum stay must be at least 1 month.'
  addTextError(errors, 'description', listing.description, 40, 900, 'Add at least 40 characters so renters understand the listing.')

  if (normalized.listingCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY) {
    if (!listing.propertyType || !['apartment', 'house', 'studio'].includes(normalized.propertyType)) errors.propertyType = 'Choose a property type.'
    if (normalized.propertyType !== 'studio' && !positiveInteger(listing.bedrooms, 0)) errors.bedrooms = 'Add the number of bedrooms.'
    if (!positiveNumber(listing.bathrooms, 0)) errors.bathrooms = 'Add the number of bathrooms.'
    if (!positiveInteger(listing.maxOccupants, 0)) errors.maxOccupants = 'Add the maximum occupants.'
  } else {
    if (!listing.roomType || !['single', 'double', 'ensuite'].includes(normalized.roomType)) errors.roomType = 'Choose a room type.'
    if (!listing.bathroomArrangement || !['private', 'shared', 'ensuite'].includes(normalized.bathroomArrangement)) errors.bathroomArrangement = 'Choose the bathroom arrangement.'
    if (!positiveInteger(listing.totalBedrooms, 0)) errors.totalBedrooms = 'Add the total bedrooms in the home.'
    if (!positiveNumber(listing.bathrooms, 0)) errors.bathrooms = 'Add the total bathrooms.'
    const capacity = validateRoomCapacity(listing)
    if (!capacity.valid) errors.maxHouseholdSize = capacity.reason
  }

  return { valid: Object.keys(errors).length === 0, errors, listing: normalized }
}

export function getListingCompleteness(listing = {}, today = '') {
  const { errors } = validateListingForReview(listing, today)
  const category = normalizeListingCategory(listing.listingCategory, listing)
  const requiredFields =
    category === LISTING_CATEGORIES.ENTIRE_PROPERTY
      ? ['rent', 'area', 'availableFrom', 'propertyType', 'description']
      : ['roomType', 'rent', 'area', 'availableFrom', 'bathroomArrangement', 'totalBedrooms', 'maxHouseholdSize', 'description']
  const missing = requiredFields.filter((field) => errors[field])
  if (category === LISTING_CATEGORIES.ENTIRE_PROPERTY && normalizePropertyType(listing.propertyType) !== 'studio' && errors.bedrooms) missing.push('bedrooms')
  return { complete: missing.length === 0, missing, errors }
}

export function validateRoomCapacity(listing = {}) {
  const current = positiveInteger(listing.currentHouseholdSize, 0)
  const max = positiveInteger(listing.maxHouseholdSize, 0)
  if (!current) return { valid: false, reason: 'Add the current household size.' }
  if (!max) return { valid: false, reason: 'Add the maximum household size after move-in.' }
  if (max <= current) return { valid: false, reason: 'Max household size must allow at least one new person.' }
  return { valid: true, reason: '' }
}

export function getCategoryResetFields(fromCategory, toCategory) {
  const from = normalizeListingCategory(fromCategory)
  const to = normalizeListingCategory(toCategory)
  if (from === to) return []
  if (from === LISTING_CATEGORIES.ENTIRE_PROPERTY || to === LISTING_CATEGORIES.ENTIRE_PROPERTY) {
    return [
      'propertyType',
      'bedrooms',
      'roomType',
      'parentPropertyType',
      'bathroomArrangement',
      'totalBedrooms',
      'currentHouseholdSize',
      'maxHouseholdSize',
      'ownerLivesInProperty',
    ]
  }
  return ['ownerLivesInProperty']
}

export function canChangeListingCategory(listing = {}, toCategory) {
  const from = normalizeListingCategory(listing.listingCategory, listing)
  const to = normalizeListingCategory(toCategory)
  const resetFields = getCategoryResetFields(from, to)
  const unsafe = resetFields.length > 0
  const status = listing.listingStatus || 'draft'
  return {
    allowed: from === to || !unsafe || preReviewStatuses.has(status),
    requiresConfirmation: from !== to && unsafe && preReviewStatuses.has(status),
    unsafe,
    resetFields,
    reason: unsafe && !preReviewStatuses.has(status) ? 'Category changes are locked once a listing is in review or published.' : '',
  }
}

function addTextError(errors, field, value, minLength, maxLength, emptyMessage) {
  const length = String(value || '').trim().length
  if (length < minLength) errors[field] = emptyMessage
  if (length > maxLength) errors[field] = `Keep this under ${maxLength} characters.`
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function positiveNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
