import {
  normalizeBathroomArrangement,
  normalizeFurnished,
  normalizeParking,
  normalizePetPolicy,
  normalizePropertyType,
  normalizeRoomParentPropertyType,
  normalizeRoomType,
  normalizeSmoking,
  bathroomArrangementOptions,
  furnishedOptions,
  parkingOptions,
  petPolicyOptions,
  propertyTypeOptions,
  roomParentPropertyTypeOptions,
  roomTypeOptions,
  smokingOptions,
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
  const minCurrentHousehold = listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 1 : 0
  const currentHouseholdSize = Math.max(positiveInteger(listing.currentHouseholdSize, minCurrentHousehold), minCurrentHousehold)
  const roomOccupancy = positiveInteger(listing.maxOccupants, 1)
  const maxHouseholdSize = Math.max(positiveInteger(listing.maxHouseholdSize, currentHouseholdSize + roomOccupancy), currentHouseholdSize + roomOccupancy)

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
    maxOccupants: isRoom ? roomOccupancy : positiveInteger(listing.maxOccupants, bedrooms > 0 ? bedrooms : 1),
    currentHouseholdSize: isRoom ? currentHouseholdSize : undefined,
    maxHouseholdSize: isRoom ? maxHouseholdSize : undefined,
    bathroomArrangement: isRoom ? normalizeBathroomArrangement(listing.bathroomArrangement) : undefined,
    furnished: normalizeFurnished(listing.furnished),
    parking: normalizeParking(listing.parking),
    smokingAllowed: normalizeSmoking(listing.smokingAllowed),
    petsAllowed: normalizePetPolicy(listing.petsAllowed),
  }
}

export function normalizeListingDraftForStorage(listing = {}) {
  const listingCategory = normalizeListingCategory(listing.listingCategory, listing)
  const isRoom = isRoomListing(listingCategory)
  const propertyType = isRoom
    ? normalizeDraftEnum(listing.parentPropertyType || listing.propertyType, normalizeRoomParentPropertyType, roomParentPropertyTypeOptions)
    : normalizeDraftEnum(listing.propertyType, normalizePropertyType, propertyTypeOptions)
  return {
    ...listing,
    listingCategory,
    propertyType,
    parentPropertyType: isRoom ? propertyType : undefined,
    roomType: isRoom ? normalizeDraftEnum(listing.roomType, normalizeRoomType, roomTypeOptions) : undefined,
    ownerLivesInProperty: listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM,
    bedrooms: isRoom ? nullablePositiveInteger(listing.bedrooms) : propertyType === 'studio' ? 0 : nullablePositiveInteger(listing.bedrooms),
    totalBedrooms: isRoom ? nullablePositiveInteger(listing.totalBedrooms) : undefined,
    bathrooms: nullablePositiveNumber(listing.bathrooms),
    maxOccupants: nullablePositiveInteger(listing.maxOccupants),
    currentHouseholdSize: isRoom ? nullableNonNegativeInteger(listing.currentHouseholdSize) : undefined,
    maxHouseholdSize: isRoom ? nullablePositiveInteger(listing.maxHouseholdSize) : undefined,
    bathroomArrangement: isRoom ? normalizeDraftEnum(listing.bathroomArrangement, normalizeBathroomArrangement, bathroomArrangementOptions) : undefined,
    minStayMonths: nullablePositiveInteger(listing.minStayMonths),
    furnished: normalizeDraftEnum(listing.furnished, normalizeFurnished, furnishedOptions),
    parking: normalizeDraftEnum(listing.parking, normalizeParking, parkingOptions),
    smokingAllowed: normalizeDraftEnum(listing.smokingAllowed, normalizeSmoking, smokingOptions),
    petsAllowed: normalizeDraftEnum(listing.petsAllowed, normalizePetPolicy, petPolicyOptions),
  }
}

export function normalizeListingFormState(form = {}) {
  const listingCategory = normalizeListingCategory(form.listingCategory, form)
  const isRoom = isRoomListing(listingCategory)
  const propertyType = isRoom ? normalizeRoomParentPropertyType(form.parentPropertyType || form.propertyType) : normalizePropertyType(form.propertyType)
  return {
    ...form,
    listingCategory,
    propertyType,
    parentPropertyType: isRoom ? propertyType : undefined,
    roomType: isRoom ? normalizeRoomType(form.roomType) : undefined,
    ownerLivesInProperty: listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM,
    rent: stringifyFormNumber(form.rent),
    deposit: stringifyFormNumber(form.deposit),
    bedrooms: propertyType === 'studio' && !isRoom ? '0' : stringifyFormNumber(form.bedrooms),
    bathrooms: stringifyFormNumber(form.bathrooms),
    maxOccupants: stringifyFormNumber(form.maxOccupants),
    minStayMonths: stringifyFormNumber(form.minStayMonths),
    totalBedrooms: isRoom ? stringifyFormNumber(form.totalBedrooms) : '',
    currentHouseholdSize: isRoom ? stringifyFormNumber(form.currentHouseholdSize) : '',
    maxHouseholdSize: isRoom ? stringifyFormNumber(form.maxHouseholdSize) : '',
    bathroomArrangement: isRoom ? normalizeBathroomArrangement(form.bathroomArrangement) : undefined,
    furnished: normalizeFurnished(form.furnished),
    parking: normalizeParking(form.parking),
    smokingAllowed: normalizeSmoking(form.smokingAllowed),
    petsAllowed: normalizePetPolicy(form.petsAllowed),
  }
}

export const normalizeListingFormValues = normalizeListingFormState

export function validateListingForReview(listing = {}, today = '', options = {}) {
  const normalized = normalizeListingForStorage(listing)
  const errors = {}
  const reviewPhotoCount = getReviewPhotoCount(listing, options)

  addTextError(errors, 'title', listing.title, 8, 90, 'Add a clear listing title.')
  if (!positiveNumber(listing.rent, 0)) errors.rent = 'Monthly rent must be more than EUR0.'
  if (listing.deposit === '' || Number(listing.deposit) < 0 || Number.isNaN(Number(listing.deposit))) errors.deposit = 'Deposit cannot be negative.'
  addTextError(errors, 'area', listing.area, 1, 70, 'Add the area or neighbourhood.')
  if (!listing.availableFrom) errors.availableFrom = 'Choose the available-from date.'
  if (today && listing.availableFrom && listing.availableFrom < today) errors.availableFrom = 'Available-from date cannot be in the past.'
  if (!positiveInteger(listing.minStayMonths, 0)) errors.minStayMonths = 'Minimum stay must be at least 1 month.'
  addTextError(errors, 'description', listing.description, 40, 900, 'Add at least 40 characters so renters understand the listing.')
  if (reviewPhotoCount < 1) {
    errors.images = options.hasSessionOnlyPhotos
      ? 'Photo upload will be completed when secure photo storage is connected, so review can’t be requested yet. Save this listing as a draft to keep your progress.'
      : isRoomListing(normalized.listingCategory)
        ? 'Add at least one room photo before requesting review.'
        : 'Add at least one listing photo before requesting review.'
  }

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
    if (!positiveInteger(listing.maxOccupants, 0)) errors.maxOccupants = 'Choose the room occupancy.'
    const capacity = validateRoomCapacity(listing, normalized.listingCategory)
    Object.assign(errors, capacity.errors)
  }

  return { valid: Object.keys(errors).length === 0, errors, listing: normalized }
}

export function getListingCompleteness(listing = {}, today = '', options = {}) {
  const { errors } = validateListingForReview(listing, today, options)
  const missing = Object.keys(errors)
  return { complete: missing.length === 0, missing, errors }
}

export function validateRoomCapacity(listing = {}, listingCategory = normalizeListingCategory(listing.listingCategory, listing)) {
  const errors = {}
  const rawCurrent = listing.currentHouseholdSize
  const current = positiveInteger(rawCurrent, rawCurrent === 0 || rawCurrent === '0' ? 0 : -1)
  const max = positiveInteger(listing.maxHouseholdSize, 0)
  const maxOccupants = positiveInteger(listing.maxOccupants, 0)
  if (current < 0) errors.currentHouseholdSize = 'Add the current household size.'
  if (listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM && current < 1) errors.currentHouseholdSize = 'Owner-occupied rooms must include the owner in the current household.'
  if (!max) errors.maxHouseholdSize = 'Add the maximum household size after move-in.'
  if (!maxOccupants) errors.maxOccupants = 'Choose the room occupancy.'
  if (!errors.maxHouseholdSize && !errors.currentHouseholdSize && max < current) errors.maxHouseholdSize = 'Max household size cannot be below the current household size.'
  if (!errors.maxHouseholdSize && !errors.currentHouseholdSize && !errors.maxOccupants && current + maxOccupants > max) errors.maxHouseholdSize = 'Max household size must fit the current household plus this room occupancy.'
  return { valid: Object.keys(errors).length === 0, errors, reason: Object.values(errors)[0] || '' }
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

function nullablePositiveInteger(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function nullableNonNegativeInteger(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function nullablePositiveNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeDraftEnum(value, normalizer, options) {
  if (value === '' || value === null || value === undefined) return null
  const normalized = normalizer(value)
  return options.some((option) => option.value === normalized) ? normalized : null
}

function getReviewPhotoCount(listing = {}, options = {}) {
  if (Number.isFinite(Number(options.photoCount))) return Math.max(0, Number(options.photoCount))
  const photos = listing.photoMetadata || listing.images || []
  const values = Array.isArray(photos) ? photos : [photos]
  return values.filter((photo) => {
    const src = typeof photo === 'string' ? photo : photo?.src || photo?.url || photo?.previewUrl || ''
    return Boolean(src) && !String(src).startsWith('blob:')
  }).length
}

function stringifyFormNumber(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}
