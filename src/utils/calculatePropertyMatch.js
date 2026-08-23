import {
  normalizeBathroomArrangement,
  normalizeFurnished,
  normalizeLeaseMonths,
  normalizeParking,
  normalizePet,
  normalizePetPolicy,
  normalizeSmoking,
} from '../config/domainOptions'
import { normalizePreferredAreas } from '../config/locationOptions'
import { LISTING_CATEGORIES, isRoomListing, tenantLookingForMatches } from '../config/listingCategories'
import { directionalDayGap } from './dateUtils'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAreaList(preferredAreas = []) {
  return normalizePreferredAreas(preferredAreas).map((item) => normalize(item))
}

// True only for a real, provided number — distinguishes "the tenant said €0" from "the tenant
// hasn't said anything yet" (null/undefined/''), which must never be scored as a €0 budget.
function isKnownNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

export function calculatePropertyMatch(tenantProfile, property) {
  if (!tenantProfile) {
    // null, never an invented number (e.g. the old flat 68) — this listing genuinely has not
    // been scored against anything yet. See components/MatchBadge.jsx for how a null score
    // renders as "Unscored" rather than a fabricated percentage.
    return {
      score: null,
      reasons: ['Add a tenant profile to see a personalized Rental Fit score for this listing.'],
      warnings: [],
      hardStops: [],
    }
  }

  let score = 20
  const reasons = []
  const warnings = []
  const hardStops = []
  const roomListing = isRoomListing(property.listingCategory)

  if (tenantLookingForMatches(tenantProfile.lookingFor, property.listingCategory)) {
    score += 8
    if (tenantProfile.lookingFor && tenantProfile.lookingFor !== 'any') {
      reasons.push(roomListing ? 'This room matches what you are looking for.' : 'This entire property matches what you are looking for.')
    }
  } else {
    warnings.push(roomListing ? 'You are mainly looking for entire properties.' : 'You are mainly looking for rooms.')
  }

  if (normalize(tenantProfile.targetCity) === normalize(property.city)) {
    score += 12
    reasons.push(`This listing is in ${property.city}, matching your target city.`)
  } else {
    warnings.push(`This listing is in ${property.city}, not in your selected city.`)
  }

  const preferredAreas = normalizeAreaList(tenantProfile.preferredAreas)
  const hasPreferredAreas = preferredAreas.length > 0
  if (preferredAreas.includes(normalize(property.area))) {
    score += 18
    reasons.push('It is located in one of your preferred areas.')
  } else if (hasPreferredAreas) {
    warnings.push('This area is not in your preferred list.')
  }

  const hasBudgetMin = isKnownNumber(tenantProfile.budgetMin)
  const hasBudgetMax = isKnownNumber(tenantProfile.budgetMax)
  if (!hasBudgetMin && !hasBudgetMax) {
    // Neither side given — could be "never touched" or a deliberate "No minimum/No maximum"
    // choice (Stage Y/Y2 treat these as the same real, complete answer elsewhere in the app), so
    // this must never be scored or treated as a mismatch. The message says "flexible," not "not
    // set yet," so it doesn't read as an outstanding task when Profile already calls it complete.
    warnings.push('Your budget is flexible, so rent fit is not scored.')
  } else {
    const budgetMin = hasBudgetMin ? Number(tenantProfile.budgetMin) : 0
    const budgetMax = hasBudgetMax ? Number(tenantProfile.budgetMax) : Infinity
    if (property.rent >= budgetMin && property.rent <= budgetMax) {
      score += 22
      reasons.push('The monthly rent is within your budget.')
    } else if (property.rent > budgetMax) {
      const gap = property.rent - budgetMax
      if (gap > 300) hardStops.push('The rent is materially above your maximum budget.')
      else warnings.push('The monthly rent is above your maximum budget.')
    } else if (property.rent < budgetMin) {
      score += 8
      reasons.push('The monthly rent is below your stated minimum budget.')
    }
  }

  const moveInGap = directionalDayGap(tenantProfile.moveInDate, property.availableFrom)
  if (moveInGap === null) {
    warnings.push('Move-in timing is incomplete, so date fit is not scored.')
  } else if (moveInGap >= -14 && moveInGap <= 30) {
    score += 12
    reasons.push('The available date is close to your move-in date.')
  } else if (moveInGap < -14) {
    warnings.push('This listing may be available too early for your move-in timing.')
  } else {
    warnings.push('This listing may be available later than your move-in date.')
  }

  const householdSize = Number(tenantProfile.householdSize || 1)
  const maxOccupants = Number(property.maxOccupants || 1)
  if (householdSize <= maxOccupants) {
    score += 10
    reasons.push('The listed occupancy can fit your household size.')
  } else {
    hardStops.push(roomListing ? 'This room occupancy is too small for the applicants.' : 'The listed maximum occupancy is too small for your household.')
  }

  if (roomListing) {
    const needsCoupleRoom = Boolean(tenantProfile.applyingAsCouple ?? tenantProfile.coupleRequirement)
    const capacityAfterMoveIn = Number(property.currentHouseholdSize || 0) + householdSize
    if (needsCoupleRoom && !property.couplesAccepted) hardStops.push('Couples are not accepted for this room.')
    if (capacityAfterMoveIn > Number(property.maxHouseholdSize || property.currentHouseholdSize || 1)) hardStops.push('Household capacity exceeded.')

    if (tenantProfile.ownerOccupiedAcceptable === false && property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM) {
      hardStops.push('Owner-occupied excluded by tenant preference.')
    } else if (property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM) {
      reasons.push('Owner lives in the property.')
    }

    const bathroom = normalizeBathroomArrangement(property.bathroomArrangement)
    if (tenantProfile.privateBathroomPreferred) {
      if (['private', 'ensuite'].includes(bathroom)) {
        score += 7
        reasons.push('The bathroom arrangement matches your private bathroom preference.')
      } else {
        warnings.push('This room has a shared bathroom.')
      }
    }

    if (tenantProfile.billsIncludedPreferred) {
      if (property.billsIncluded) {
        score += 5
        reasons.push('Bills are included for this room.')
      } else {
        warnings.push('Bills are separate for this room.')
      }
    }
  }

  const preferredLease = Number(normalizeLeaseMonths(tenantProfile.leaseLength, 12))
  if (!preferredLease || preferredLease >= Number(property.minStayMonths || 0)) {
    score += 8
    reasons.push('The minimum lease term fits your preference.')
  } else {
    warnings.push('The minimum lease may be longer than your stated preference.')
  }

  if (
    !tenantProfile.furnishedPreference ||
    tenantProfile.furnishedPreference === 'Any' ||
    tenantProfile.furnishedPreference === 'any' ||
    normalizeFurnished(tenantProfile.furnishedPreference) === normalizeFurnished(property.furnished)
  ) {
    score += 7
    reasons.push('The furnishing setup fits your preference.')
  } else {
    warnings.push('The furnishing setup may not match your preference.')
  }

  const needsParking = normalize(tenantProfile.parkingNeeded) === 'yes'
  if (!needsParking || normalizeParking(property.parking) !== 'none') {
    score += 6
    if (needsParking) reasons.push('The listing appears to support your parking need.')
  } else {
    hardStops.push('You need parking, but this listing does not include it.')
  }

  const tenantSmoking = normalizeSmoking(tenantProfile.smoking)
  const listingSmoking = normalizeSmoking(property.smokingAllowed)
  const smokingCompatible =
    tenantSmoking === 'no' ||
    listingSmoking === 'yes' ||
    (tenantSmoking === 'outside_only' && listingSmoking === 'outside_only')

  const hasPets = !['none', ''].includes(normalizePet(tenantProfile.pets))
  const petPolicy = normalizePetPolicy(property.petsAllowed)
  const petsCompatible = hasPets ? petPolicy !== 'not_allowed' : true

  if (smokingCompatible && petsCompatible) {
    score += 7
    if (hasPets && petPolicy === 'considered') warnings.push('Pets are considered for this listing, but acceptance is not guaranteed.')
    else reasons.push('The listing rules fit your smoking and pet preferences.')
  } else {
    hardStops.push('Some listing rules may not fit your smoking or pet preferences.')
  }

  const readyDocuments = [tenantProfile.referencesReady, tenantProfile.incomeReady, tenantProfile.idReady].filter(Boolean).length
  if (readyDocuments === 3) {
    score += 8
    reasons.push('Your references, income proof and ID readiness are strong for this listing.')
  } else if (readyDocuments > 0) {
    score += 3
    warnings.push('Some application readiness items are still incomplete.')
  } else {
    warnings.push('Application readiness is not set yet.')
  }

  score -= hardStops.length * 18

  const hardStopCap = hardStops.length ? 58 : 100
  const boundedScore = Math.max(0, Math.min(hardStopCap, score))

  return {
    score: boundedScore,
    reasons:
      reasons.length > 0
        ? reasons
        : ['This listing could still be worth a look, but your profile would improve the match signal.'],
    warnings: [...new Set(warnings)],
    hardStops: [...new Set(hardStops)],
  }
}
