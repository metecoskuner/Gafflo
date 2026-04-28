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
        'This room is in a popular Irish rental area.',
      ],
    }
  }

  let score = 35
  const reasons = []

  if (normalize(tenantProfile.city) === normalize(room.city)) {
    score += 15
    reasons.push(`This room is in ${room.city}, matching your target city.`)
  }

  const preferredAreas = normalizeAreaList(tenantProfile.preferredAreas)
  if (preferredAreas.includes(normalize(room.area))) {
    score += 25
    reasons.push('It is located in one of your preferred areas.')
  }

  if (room.rent >= Number(tenantProfile.budgetMin) && room.rent <= Number(tenantProfile.budgetMax)) {
    score += 25
    reasons.push('This room is within your budget.')
  }

  const moveInGap = differenceInDaysSafe(tenantProfile.moveInDate, room.availableFrom)
  if (moveInGap <= 30) {
    score += 15
    reasons.push('The available date is close to your move-in date.')
  }

  if (normalize(tenantProfile.lifestyle) === normalize(room.lifestyle)) {
    score += 10
    reasons.push('The house vibe matches your lifestyle.')
  }

  if (normalize(tenantProfile.cleanliness) === normalize(room.cleanliness)) {
    score += 5
    reasons.push('The cleanliness expectations look aligned.')
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
  }

  const boundedScore = Math.max(42, Math.min(98, score))

  return {
    score: boundedScore,
    reasons:
      reasons.length > 0
        ? reasons
        : ['This room could still be worth a look, but your profile would improve the match signal.'],
  }
}
