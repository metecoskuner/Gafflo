import { differenceInDaysSafe } from './dateUtils'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAreaList(preferredAreas = []) {
  return preferredAreas.map((item) => normalize(item))
}

export function calculateRoomMatch(tenantProfile, room) {
  if (!tenantProfile) {
    return {
      score: 68,
      reasons: [
        'Create a renter profile to unlock more precise matching.',
        'This is a demo match score based on the room listing alone.',
      ],
      warnings: [],
    }
  }

  let score = 35
  const reasons = []
  const warnings = []

  if (normalize(tenantProfile.city) === normalize(room.city)) {
    score += 15
    reasons.push(`This room is in ${room.city}, matching your target city.`)
  } else {
    warnings.push(`This room is in ${room.city}, not in your selected city.`)
  }

  const preferredAreas = normalizeAreaList(tenantProfile.preferredAreas)
  const hasPreferredAreas = preferredAreas.length > 0
  if (preferredAreas.includes(normalize(room.area))) {
    score += 25
    reasons.push('It is located in one of your preferred areas.')
  } else if (hasPreferredAreas) {
    warnings.push('This area is not in your preferred list.')
  }

  if (room.rent >= Number(tenantProfile.budgetMin) && room.rent <= Number(tenantProfile.budgetMax)) {
    score += 25
    reasons.push('This room is within your budget.')
  } else if (room.rent > Number(tenantProfile.budgetMax)) {
    warnings.push('This room is above your maximum budget.')
  } else if (room.rent < Number(tenantProfile.budgetMin)) {
    warnings.push('This room is below your stated budget range.')
  }

  const moveInGap = differenceInDaysSafe(tenantProfile.moveInDate, room.availableFrom)
  if (moveInGap <= 30) {
    score += 15
    reasons.push('The available date is close to your move-in date.')
  } else {
    warnings.push('The available date may not match your move-in date.')
  }

  if (normalize(tenantProfile.lifestyle) === normalize(room.lifestyle)) {
    score += 10
    reasons.push('The house vibe matches your lifestyle.')
  } else {
    warnings.push('The house vibe may not match your preferred lifestyle.')
  }

  if (normalize(tenantProfile.cleanliness) === normalize(room.cleanliness)) {
    score += 5
    reasons.push('The cleanliness expectations look aligned.')
  } else {
    warnings.push('The cleanliness expectations may feel different from your preference.')
  }

  const smokingCompatible =
    normalize(tenantProfile.smoking) === 'no'
      ? normalize(room.smokingAllowed) === 'no' || normalize(room.smokingAllowed) === 'outside only'
      : true

  const petsCompatible =
    normalize(tenantProfile.pets) === 'not comfortable'
      ? normalize(room.petsAllowed) === 'not comfortable'
      : true

  if (smokingCompatible && petsCompatible) {
    score += 5
    reasons.push('The house rules fit your preferences.')
  } else {
    warnings.push('Some house rules may not fully fit your smoking or pet preferences.')
  }

  const boundedScore = Math.max(0, Math.min(100, score))

  return {
    score: boundedScore,
    reasons:
      reasons.length > 0
        ? reasons
        : ['This room could still be worth a look, but your profile would improve the match signal.'],
    warnings,
  }
}
