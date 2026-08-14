import { differenceInDaysSafe } from './dateUtils'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAreaList(preferredAreas = []) {
  return preferredAreas.map((item) => normalize(item))
}

export function calculatePropertyMatch(tenantProfile, property) {
  if (!tenantProfile) {
    return {
      score: 68,
      reasons: [
        'Create a tenant profile to unlock more precise rental-fit matching.',
        'This match score is based on the property listing until your profile is complete.',
      ],
      warnings: [],
      hardStops: [],
    }
  }

  let score = 20
  const reasons = []
  const warnings = []
  const hardStops = []

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

  if (property.rent >= Number(tenantProfile.budgetMin) && property.rent <= Number(tenantProfile.budgetMax)) {
    score += 22
    reasons.push('The monthly rent is within your budget.')
  } else if (property.rent > Number(tenantProfile.budgetMax)) {
    const gap = property.rent - Number(tenantProfile.budgetMax)
    if (gap > 300) hardStops.push('The rent is materially above your maximum budget.')
    else warnings.push('The monthly rent is above your maximum budget.')
  } else if (property.rent < Number(tenantProfile.budgetMin)) {
    warnings.push('The monthly rent is below your stated budget range.')
  }

  const moveInGap = differenceInDaysSafe(tenantProfile.moveInDate, property.availableFrom)
  if (moveInGap <= 30) {
    score += 12
    reasons.push('The available date is close to your move-in date.')
  } else {
    warnings.push('The available date may not match your move-in date.')
  }

  const householdSize = Number(tenantProfile.householdSize || 1)
  const maxOccupants = Number(property.maxOccupants || 1)
  if (householdSize <= maxOccupants) {
    score += 10
    reasons.push('The listed occupancy can fit your household size.')
  } else {
    hardStops.push('The listed maximum occupancy is too small for your household.')
  }

  const preferredLease = Number.parseInt(tenantProfile.leaseLength, 10)
  if (!preferredLease || preferredLease >= Number(property.minStayMonths || 0)) {
    score += 8
    reasons.push('The minimum lease term fits your preference.')
  } else {
    warnings.push('The minimum lease may be longer than your stated preference.')
  }

  if (
    !tenantProfile.furnishedPreference ||
    tenantProfile.furnishedPreference === 'Any' ||
    normalize(tenantProfile.furnishedPreference) === normalize(property.furnished)
  ) {
    score += 7
    reasons.push('The furnishing setup fits your preference.')
  } else {
    warnings.push('The furnishing setup may not match your preference.')
  }

  const needsParking = normalize(tenantProfile.parkingNeeded) === 'yes'
  if (!needsParking || normalize(property.parking) !== 'no') {
    score += 6
    if (needsParking) reasons.push('The listing appears to support your parking need.')
  } else {
    hardStops.push('You need parking, but this listing does not include it.')
  }

  const smokingCompatible = normalize(tenantProfile.smoking) === 'no' ? normalize(property.smokingAllowed) !== 'yes' : true

  const hasPets = !['no', 'no pets', 'none', ''].includes(normalize(tenantProfile.pets))
  const petsCompatible = hasPets ? normalize(property.petsAllowed) === 'comfortable' : true

  if (smokingCompatible && petsCompatible) {
    score += 7
    reasons.push('The listing rules fit your smoking and pet preferences.')
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

  const boundedScore = Math.max(0, Math.min(100, score))

  return {
    score: boundedScore,
    reasons:
      reasons.length > 0
        ? reasons
        : ['This listing could still be worth a look, but your profile would improve the match signal.'],
    warnings,
    hardStops,
  }
}
