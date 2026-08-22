export const listingStatusLabels = {
  draft: 'Draft',
  pending_verification: 'In review',
  published: 'Published',
  active: 'Published',
  paused: 'Paused',
  rented: 'Rented',
  rejected: 'Needs changes',
  removed_by_platform: 'Removed',
}

const listingTransitions = {
  draft: ['pending_verification'],
  pending_verification: ['draft'],
  published: ['paused', 'rented'],
  active: ['paused', 'rented'],
  paused: ['published', 'rented'],
  rented: [],
  rejected: ['draft', 'pending_verification'],
}

export function canTransitionListing(from, to) {
  if (from === to) return true
  return listingTransitions[from]?.includes(to) || false
}

export function canListingReceiveEnquiry(property) {
  return ['published', 'active'].includes(property?.listingStatus)
}

export function canViewListing({ role, viewerId, property, hasHistoricalRelationship = false }) {
  if (!property) return { allowed: false, mode: 'none' }
  if (role === 'landlord' && property.ownerId === viewerId) return { allowed: true, mode: 'own' }
  if (canListingReceiveEnquiry(property)) return { allowed: true, mode: 'public' }
  if (role === 'tenant' && hasHistoricalRelationship) return { allowed: true, mode: 'historical' }
  return { allowed: false, mode: 'none' }
}

export function getListingActions(status) {
  const actions = [
    { status: 'pending_verification', label: 'Request review' },
    { status: 'published', label: 'Resume' },
    { status: 'paused', label: 'Pause' },
    { status: 'rented', label: 'Mark rented', destructive: true },
  ]
  return actions.filter((action) => canTransitionListing(status, action.status) && action.status !== status)
}
