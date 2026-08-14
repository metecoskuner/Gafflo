import {
  ANY_VALUE,
  normalizeFurnished,
  normalizeLeaseMonths,
  normalizeParking,
  normalizePet,
  normalizeSmoking,
} from './domainOptions'
import { cityOptions, normalizePreferredAreas } from './locationOptions'
import { LISTING_CATEGORIES } from './listingCategories'

export function isApplyingAsCouple(profile = {}) {
  return profile.applyingAsCouple === true || (profile.applyingAsCouple === undefined && profile.coupleRequirement === true)
}

export function normalizeTenantProfileForState(profile = {}) {
  const applyingAsCouple = isApplyingAsCouple(profile) && Number(profile.householdSize || 1) >= 2
  const { coupleRequirement, ...rest } = profile
  void coupleRequirement
  return {
    ...rest,
    applyingAsCouple,
  }
}

export function normalizeTenantProfileForStorage(profile = {}, defaults = {}) {
  const applyingAsCouple = isApplyingAsCouple(profile) && Number(profile.householdSize) >= 2
  const { coupleRequirement, notifications, areaDraft, ...rest } = {
    ...defaults,
    ...profile,
  }
  void coupleRequirement
  void notifications
  void areaDraft

  return {
    ...rest,
    leaseLength: normalizeLeaseMonths(profile.leaseLength, 12),
    furnishedPreference: [ANY_VALUE, 'Any'].includes(profile.furnishedPreference) ? ANY_VALUE : normalizeFurnished(profile.furnishedPreference),
    pets: normalizePet(profile.pets),
    smoking: normalizeSmoking(profile.smoking),
    parkingNeeded: String(profile.parkingNeeded || '').trim().toLowerCase() === 'yes' || normalizeParking(profile.parkingNeeded) !== 'none' ? 'yes' : 'no',
    targetCity: cityOptions.includes(profile.targetCity) ? profile.targetCity : defaults.targetCity,
    preferredAreas: normalizePreferredAreas(profile.preferredAreas, profile.targetCity),
    lookingFor: ['any', LISTING_CATEGORIES.ENTIRE_PROPERTY, 'room'].includes(profile.lookingFor) ? profile.lookingFor : 'any',
    privateBathroomPreferred: Boolean(profile.privateBathroomPreferred),
    billsIncludedPreferred: Boolean(profile.billsIncludedPreferred),
    ownerOccupiedAcceptable: profile.ownerOccupiedAcceptable !== false,
    applyingAsCouple,
  }
}
