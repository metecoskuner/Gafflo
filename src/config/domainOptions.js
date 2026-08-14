const option = (value, label = value) => ({ value, label })

export const ANY_VALUE = 'any'

export const propertyTypeOptions = [
  option('apartment', 'Apartment'),
  option('house', 'House'),
  option('studio', 'Studio'),
]

export const roomParentPropertyTypeOptions = [
  option('apartment', 'Apartment'),
  option('house', 'House'),
]

export const roomTypeOptions = [
  option('single', 'Single'),
  option('double', 'Double'),
  option('ensuite', 'Ensuite'),
]

export const bathroomArrangementOptions = [
  option('private', 'Private bathroom'),
  option('shared', 'Shared bathroom'),
  option('ensuite', 'Ensuite'),
]

export const bedTypeOptions = [
  option('single', 'Single bed'),
  option('double', 'Double bed'),
  option('king', 'King bed'),
]

export const furnishedOptions = [
  option('furnished', 'Furnished'),
  option('part_furnished', 'Part-furnished'),
  option('unfurnished', 'Unfurnished'),
]

export const petOptions = [
  option('none', 'No pets'),
  option('cat', 'Cat'),
  option('dog', 'Dog'),
  option('other', 'Other pet'),
]

export const petPolicyOptions = [
  option('considered', 'Pets considered'),
  option('not_allowed', 'No pets preferred'),
]

export const smokingOptions = [
  option('no', 'No'),
  option('outside_only', 'Outside only'),
  option('yes', 'Yes'),
]

export const parkingOptions = [
  option('none', 'No'),
  option('street_permit', 'Street permit nearby'),
  option('included', 'Included'),
  option('driveway', 'Driveway'),
]

export const parkingNeedOptions = [option('no', 'No'), option('yes', 'Yes')]

export const leaseDurationOptions = [
  option('6', '6 months'),
  option('12', '12 months'),
  option('18', '18 months'),
  option('24', '24+ months'),
]

export const leasePreferenceOptions = [
  option('6', 'Up to 6 months'),
  option('12', '12 months'),
  option('24', '12+ months'),
]

const aliases = {
  propertyType: {
    apartment: 'apartment',
    house: 'house',
    studio: 'studio',
    'one-bedroom apartment': 'apartment',
    '1 bedroom apartment': 'apartment',
  },
  roomType: {
    single: 'single',
    double: 'double',
    ensuite: 'ensuite',
    'en-suite': 'ensuite',
    'en suite': 'ensuite',
  },
  bathroomArrangement: {
    private: 'private',
    shared: 'shared',
    ensuite: 'ensuite',
    'en-suite': 'ensuite',
    'en suite': 'ensuite',
  },
  furnished: {
    furnished: 'furnished',
    'part-furnished': 'part_furnished',
    'part furnished': 'part_furnished',
    part_furnished: 'part_furnished',
    unfurnished: 'unfurnished',
  },
  pets: {
    'no pets': 'none',
    no: 'none',
    none: 'none',
    cat: 'cat',
    dog: 'dog',
    'other pet': 'other',
    other: 'other',
  },
  petPolicy: {
    comfortable: 'considered',
    considered: 'considered',
    yes: 'considered',
    'pets considered': 'considered',
    'not comfortable': 'not_allowed',
    no: 'not_allowed',
    'no pets preferred': 'not_allowed',
    not_allowed: 'not_allowed',
  },
  smoking: {
    no: 'no',
    yes: 'yes',
    'outside only': 'outside_only',
    outside_only: 'outside_only',
  },
  parking: {
    no: 'none',
    none: 'none',
    'street permit nearby': 'street_permit',
    street_permit: 'street_permit',
    included: 'included',
    driveway: 'driveway',
  },
}

function key(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeWithAlias(group, value, fallback = '') {
  if (!value) return fallback
  return aliases[group][key(value)] || value
}

function labelFor(options, value, fallback = value || '') {
  return options.find((item) => item.value === value)?.label || fallback
}

export function normalizePropertyType(value) {
  return normalizeWithAlias('propertyType', value, 'apartment')
}

export function normalizeRoomParentPropertyType(value) {
  const normalized = normalizePropertyType(value)
  return normalized === 'house' ? 'house' : 'apartment'
}

export function normalizeRoomType(value) {
  return normalizeWithAlias('roomType', value, 'single')
}

export function normalizeBathroomArrangement(value) {
  return normalizeWithAlias('bathroomArrangement', value, 'shared')
}

export function normalizeFurnished(value) {
  return normalizeWithAlias('furnished', value, 'furnished')
}

export function normalizePet(value) {
  return normalizeWithAlias('pets', value, 'none')
}

export function normalizePetPolicy(value) {
  return normalizeWithAlias('petPolicy', value, 'not_allowed')
}

export function normalizeSmoking(value) {
  return normalizeWithAlias('smoking', value, 'no')
}

export function normalizeParking(value) {
  return normalizeWithAlias('parking', value, 'none')
}

export function normalizeLeaseMonths(value, fallback = 12) {
  if (value === ANY_VALUE || value === 'Any') return ANY_VALUE
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : String(fallback)
}

export function domainLabel(group, value) {
  const labels = {
    propertyType: propertyTypeOptions,
    roomParentPropertyType: roomParentPropertyTypeOptions,
    roomType: roomTypeOptions,
    bathroomArrangement: bathroomArrangementOptions,
    furnished: furnishedOptions,
    pets: petOptions,
    petPolicy: petPolicyOptions,
    smoking: smokingOptions,
    parking: parkingOptions,
    lease: leaseDurationOptions,
  }
  return labelFor(labels[group] || [], value)
}

export function withAny(options) {
  return [option(ANY_VALUE, 'Any'), ...options]
}
