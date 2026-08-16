// Frontend-only shape for a listing's paid exposure boost. No payment happens here — this
// just describes the state a real purchase would eventually set.
// promotion: { type: 'boost', status: 'active', startsAt: isoString, endsAt: isoString }
//
// Trust rule: a boost may only affect Browse ordering. It must never reach Smart Match
// ranking or the Rental Fit score — calculatePropertyMatch never reads this field, and
// callers must keep it that way. "You can pay for exposure. You cannot pay for compatibility."

export function isListingPromoted(property, now = new Date()) {
  const promotion = property?.promotion
  if (!promotion || promotion.type !== 'boost' || promotion.status !== 'active') return false
  const nowTime = new Date(now).getTime()
  const startsAt = new Date(promotion.startsAt).getTime()
  const endsAt = new Date(promotion.endsAt).getTime()
  if (!Number.isFinite(nowTime) || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return false
  return nowTime >= startsAt && nowTime <= endsAt
}

// Smart Match ranking is compatibility-only. Boost must never be a factor here.
export function sortBySmartMatchScore(properties) {
  return [...properties].sort((a, b) => b.match.score - a.match.score)
}

// Browse may weight exposure: active, non-expired boosts surface first. Within each group,
// listings still rank by Rental Fit, so a boost buys placement, never a better match score.
export function sortForBrowseExposure(properties, now = new Date()) {
  const promoted = []
  const standard = []
  for (const property of properties) {
    if (isListingPromoted(property, now)) promoted.push(property)
    else standard.push(property)
  }
  return [...sortBySmartMatchScore(promoted), ...sortBySmartMatchScore(standard)]
}

export function canBoostListing(property, now = new Date()) {
  if (!property) return false
  if (!['published', 'active'].includes(property.listingStatus)) return false
  return !isListingPromoted(property, now)
}
