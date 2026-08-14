import { domainLabel } from './domainOptions'
import { LISTING_CATEGORIES, isRoomListing } from './listingCategories'
import { formatDate } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatCurrency'

export function getSmartMatchFacts(property) {
  if (isRoomListing(property.listingCategory)) {
    return [
      { label: 'Room', value: domainLabel('roomType', property.roomType) },
      { label: 'Bathroom', value: domainLabel('bathroomArrangement', property.bathroomArrangement) },
      { label: 'Bills', value: property.billsIncluded ? 'Included' : 'Separate' },
      { label: 'Household', value: `${property.currentHouseholdSize || 1}/${property.maxHouseholdSize || 2}` },
      { label: 'Furnished', value: domainLabel('furnished', property.furnished) },
      { label: 'Owner', value: property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 'Owner lives here' : 'Not owner occupied' },
    ]
  }

  return [
    { label: 'Type', value: domainLabel('propertyType', property.propertyType) },
    { label: 'Beds', value: property.bedrooms ? `${property.bedrooms}` : 'Studio' },
    { label: 'Furnished', value: domainLabel('furnished', property.furnished) },
    { label: 'Parking', value: domainLabel('parking', property.parking) },
    { label: 'Bills', value: property.billsIncluded ? 'Included' : 'Separate' },
    { label: 'Available', value: formatDate(property.availableFrom) },
  ]
}

export function getBrowseFacts(property) {
  if (isRoomListing(property.listingCategory)) {
    return [
      { label: 'Rent', value: `${formatCurrency(property.rent)}/mo` },
      { label: 'Room', value: domainLabel('roomType', property.roomType) },
      { label: 'Bathroom', value: domainLabel('bathroomArrangement', property.bathroomArrangement) },
      { label: 'Bills', value: property.billsIncluded ? 'Included' : 'Separate' },
      { label: 'Owner', value: property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 'Owner lives here' : 'Shared home' },
      { label: 'Available', value: formatDate(property.availableFrom) },
    ]
  }

  return [
    { label: 'Rent', value: `${formatCurrency(property.rent)}/mo` },
    { label: 'Type', value: domainLabel('propertyType', property.propertyType) },
    { label: 'Beds', value: property.bedrooms ? `${property.bedrooms}` : 'Studio' },
    { label: 'Area', value: property.area },
    { label: 'Available', value: formatDate(property.availableFrom) },
    { label: 'Amenities', value: (property.amenities || property.features || []).slice(0, 2).join(', ') || 'Details inside' },
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
