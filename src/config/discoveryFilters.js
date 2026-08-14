import {
  ANY_VALUE,
  normalizeBathroomArrangement,
  normalizeFurnished,
  normalizeLeaseMonths,
  normalizeParking,
  normalizePetPolicy,
} from './domainOptions'
import { LISTING_CATEGORIES, isRoomListing, normalizeListingCategory, normalizeListingForStorage } from './listingCategories'
import { compareLocalDates } from '../utils/localDate'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

export function propertyMatchesFilters(property, filters) {
  if (!['published', 'active'].includes(property.listingStatus)) return false
  const listingCategory = normalizeListingCategory(property.listingCategory, property)
  const roomListing = isRoomListing(listingCategory)
  if (filters.priceMin && property.rent < Number(filters.priceMin)) return false
  if (filters.priceMax && property.rent > Number(filters.priceMax)) return false
  if (filters.location !== 'Any') {
    const target = normalize(filters.location)
    if (normalize(property.city) !== target && normalize(property.area) !== target) return false
  }
  if (filters.moveInBy) {
    const comparison = compareLocalDates(property.availableFrom, filters.moveInBy)
    if (comparison === null || comparison > 0) return false
  }
  if (![ANY_VALUE, 'Any'].includes(filters.listingCategory)) {
    if (filters.listingCategory === 'room' && !roomListing) return false
    if (filters.listingCategory !== 'room' && listingCategory !== filters.listingCategory) return false
  }
  if (!roomListing && ![ANY_VALUE, 'Any'].includes(filters.propertyType) && normalizeListingForStorage(property).propertyType !== normalizeListingForStorage({ propertyType: filters.propertyType }).propertyType) return false
  if (roomListing && ![ANY_VALUE, 'Any'].includes(filters.roomType) && property.roomType !== filters.roomType) return false
  if (roomListing && filters.privateBathroom === 'Required' && !['private', 'ensuite'].includes(normalizeBathroomArrangement(property.bathroomArrangement))) return false
  if (roomListing && filters.billsIncluded === 'Required' && !property.billsIncluded) return false
  if (roomListing && filters.ownerOccupied === 'Required' && listingCategory !== LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM) return false
  if (roomListing && filters.ownerOccupied === 'Excluded' && listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM) return false
  if (roomListing && filters.couplesAccepted === 'Required' && !property.couplesAccepted) return false
  if (![ANY_VALUE, 'Any'].includes(filters.furnishedPreference) && normalizeFurnished(property.furnished) !== normalizeFurnished(filters.furnishedPreference)) return false
  if (!roomListing && filters.bedrooms !== 'Any' && property.bedrooms < Number(filters.bedrooms)) return false
  if (filters.pets === 'Required' && normalizePetPolicy(property.petsAllowed) !== 'considered') return false
  if (filters.parking === 'Required' && normalizeParking(property.parking) === 'none') return false
  if (![ANY_VALUE, 'Any'].includes(filters.leaseLength) && Number(normalizeLeaseMonths(filters.leaseLength)) < Number(property.minStayMonths || 0)) return false
  return true
}
