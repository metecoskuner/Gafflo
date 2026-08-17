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

// Applying as a couple implies at least 2 applicants. Older or externally-written profiles
// (e.g. couple: true with a stale householdSize of 1) must not silently lose the couple status
// on reload — that discards true information the tenant gave us. Instead the household size is
// raised to meet the couple, exactly like the live Profile form does — never the reverse.
function reconcileCoupleHousehold(applyingAsCouple, householdSize) {
  if (!applyingAsCouple) return householdSize
  const known = householdSize === null || householdSize === undefined || householdSize === '' ? null : Number(householdSize)
  return Math.max(2, Number.isFinite(known) ? known : 1)
}

export function normalizeTenantProfileForState(profile = {}) {
  const applyingAsCouple = isApplyingAsCouple(profile)
  const { coupleRequirement, ...rest } = profile
  void coupleRequirement
  return {
    ...rest,
    householdSize: reconcileCoupleHousehold(applyingAsCouple, profile.householdSize),
    applyingAsCouple,
  }
}

export function normalizeTenantProfileForStorage(profile = {}, defaults = {}) {
  const applyingAsCouple = isApplyingAsCouple(profile)
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
    householdSize: reconcileCoupleHousehold(applyingAsCouple, profile.householdSize),
    applyingAsCouple,
  }
}
