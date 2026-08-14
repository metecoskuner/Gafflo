export const listingStatusLabels = {
  draft: 'Draft',
  pending_verification: 'In review',
  published: 'Published',
  active: 'Published',
  paused: 'Paused',
  rented: 'Rented',
  rejected: 'Needs changes',
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

export function getListingActions(status) {
  const actions = [
    { status: 'pending_verification', label: 'Request review' },
    { status: 'published', label: 'Resume' },
    { status: 'paused', label: 'Pause' },
    { status: 'rented', label: 'Mark rented', destructive: true },
  ]
  return actions.filter((action) => canTransitionListing(status, action.status) && action.status !== status)
}
