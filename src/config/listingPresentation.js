import { domainLabel } from './domainOptions'
import { LISTING_CATEGORIES, isRoomListing } from './listingCategories'
import { formatDate } from '../utils/dateUtils'

export function getSmartMatchFacts(property) {
  if (isRoomListing(property.listingCategory)) {
    return [
      { label: 'Room', value: domainLabel('roomType', property.roomType) },
      { label: 'Bathroom', value: domainLabel('bathroomArrangement', property.bathroomArrangement) },
      { label: 'Bills', value: property.billsIncluded ? 'Included' : 'Separate' },
      { label: 'Owner', value: property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 'Owner lives here' : 'Not owner occupied' },
      { label: 'Available', value: formatDate(property.availableFrom) },
    ]
  }

  return [
    { label: 'Type', value: domainLabel('propertyType', property.propertyType) },
    { label: 'Beds', value: property.bedrooms ? `${property.bedrooms}` : 'Studio' },
    { label: 'Available', value: formatDate(property.availableFrom) },
    { label: 'Furnished', value: domainLabel('furnished', property.furnished) },
    { label: 'Parking', value: domainLabel('parking', property.parking) },
  ]
}

// Rent, area/city, and availability are already shown in the card's image caption above these
// facts, so this list only adds genuinely new information instead of repeating it.
export function getBrowseFacts(property) {
  if (isRoomListing(property.listingCategory)) {
    return [
      { label: 'Room', value: domainLabel('roomType', property.roomType) },
      { label: 'Bathroom', value: domainLabel('bathroomArrangement', property.bathroomArrangement) },
      { label: 'Bills', value: property.billsIncluded ? 'Included' : 'Separate' },
      { label: 'Owner', value: property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 'Owner lives here' : 'Shared home' },
    ]
  }

  return [
    { label: 'Type', value: domainLabel('propertyType', property.propertyType) },
    { label: 'Beds', value: property.bedrooms ? `${property.bedrooms}` : 'Studio' },
    { label: 'Furnished', value: domainLabel('furnished', property.furnished) },
    { label: 'Parking', value: domainLabel('parking', property.parking) },
  ]
}

export function formatFreshness(value, label = 'Updated', now = new Date()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffDays = Math.floor((new Date(now).setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86400000)
  if (diffDays < 0) return ''
  if (diffDays === 0) return `${label} today`
  if (diffDays === 1) return `${label} yesterday`
  return `${label} ${diffDays} days ago`
}

export function shouldShowTenantMatch(role) {
  return role !== 'landlord'
}
