export const applicationStatuses = {
  sent: {
    label: 'Sent',
    tenantTitle: 'Interest sent',
    description: 'Your interest has been sent to the listing owner.',
  },
  viewed: {
    label: 'Viewed',
    tenantTitle: 'Landlord viewed',
    description: 'The listing owner has seen your enquiry.',
  },
  'landlord interested': {
    label: 'Landlord interested',
    tenantTitle: 'Landlord interested',
    description: 'Good news — the landlord is interested. Messaging is the next step.',
  },
  shortlisted: {
    label: 'Shortlisted',
    tenantTitle: 'Shortlisted',
    description: 'You have been shortlisted for this property.',
  },
  'viewing proposed': {
    label: 'Viewing proposed',
    tenantTitle: 'Viewing proposed',
    description: 'The listing owner has proposed viewing times.',
  },
  'viewing confirmed': {
    label: 'Viewing confirmed',
    tenantTitle: 'Viewing confirmed',
    description: 'Your viewing is confirmed. Keep Messages open for access details.',
  },
  'viewing cancelled': {
    label: 'Viewing cancelled',
    tenantTitle: 'Viewing cancelled',
    description: 'This viewing is no longer going ahead.',
  },
  rejected: {
    label: 'Not selected',
    tenantTitle: 'Not selected',
    description: 'This property is not progressing, but you can keep browsing other matches.',
  },
  closed: {
    label: 'Closed',
    tenantTitle: 'Closed',
    description: 'This enquiry is closed.',
  },
  withdrawn: {
    label: 'Withdrawn',
    tenantTitle: 'Withdrawn',
    description: 'You withdrew this enquiry.',
  },
}

export function getApplicationStatus(status) {
  return applicationStatuses[status] || {
    label: status || 'Sent',
    tenantTitle: status || 'Sent',
    description: 'Your enquiry is being reviewed.',
  }
}

export function isClosedStatus(status) {
  return ['rejected', 'closed', 'withdrawn'].includes(status)
}

export function isLandlordEngagedStatus(status) {
  return ['landlord interested', 'shortlisted', 'viewing proposed', 'viewing confirmed'].includes(status)
}

export { canListingReceiveEnquiry }

export function getPrimaryTrustSignal(property) {
  const trust = property?.trust || {}
  if (trust.internalDemoState) return ''
  if (trust.propertyVerification === 'verified') return 'Property reviewed'
  if (trust.landlordVerification === 'verified') return 'Verified landlord'
  if (trust.identityStatus === 'checked') return 'Identity checked'
  if (trust.phoneVerified) return 'Phone verified'
  return ''
}

export function getTrustSignals(property) {
  const trust = property?.trust || {}
  if (trust.internalDemoState) return []
  return [
    trust.emailVerified ? 'Email verified' : null,
    trust.phoneVerified ? 'Phone verified' : null,
    trust.identityStatus === 'checked' ? 'Identity checked' : null,
    trust.landlordVerification === 'verified' ? 'Landlord verified' : null,
    trust.propertyVerification === 'verified' ? 'Property reviewed' : null,
  ].filter(Boolean)
}

// `trust` is `null` for every real listing on purpose (see config/listingAdapter.js) — a default
// parameter alone does not cover an explicitly passed null, only undefined, so it is normalized
// here rather than relying on the call site to remember that every time.
export function getTrustStatusLabel(status, trust = {}) {
  const safeTrust = trust || {}
  if (safeTrust.internalDemoState) return 'Not shown'
  const labels = {
    verified: 'Verified',
    pending: 'Pending',
    rejected: 'Rejected',
    not_verified: 'Not verified',
  }
  return labels[status] || 'Not verified'
}

export function isNewProperty(property, now = new Date()) {
  if (!property?.createdAt) return false
  const created = new Date(property.createdAt)
  if (Number.isNaN(created.getTime())) return false
  const ageDays = (new Date(now).getTime() - created.getTime()) / 86400000
  return ageDays >= 0 && ageDays <= 14
}

export function getTenantProfileCompleteness(profile) {
  const budgetReady = Number(profile.budgetMin) >= 0 && Number(profile.budgetMax) > 0 && Number(profile.budgetMin) <= Number(profile.budgetMax)
  const checks = [
    { id: 'budget', label: 'Budget range', complete: budgetReady },
    { id: 'preferredAreas', label: 'Preferred areas', complete: Array.isArray(profile.preferredAreas) ? profile.preferredAreas.length > 0 : Boolean(String(profile.preferredAreas || '').trim()) },
    { id: 'moveInDate', label: 'Move-in date', complete: Boolean(profile.moveInDate) },
    { id: 'householdSize', label: 'Household size', complete: Number(profile.householdSize) >= 1 },
    { id: 'employmentStatus', label: 'Employment details', complete: Boolean(profile.employmentStatus) },
    { id: 'referencesReady', label: 'References readiness', complete: Boolean(profile.referencesReady) },
    { id: 'incomeReady', label: 'Proof of income readiness', complete: Boolean(profile.incomeReady) },
    { id: 'idReady', label: 'ID readiness', complete: Boolean(profile.idReady) },
    { id: 'bio', label: 'Short introduction', complete: Boolean(String(profile.bio || '').trim()) },
  ]
  const completed = checks.filter((item) => item.complete).length
  return {
    percent: Math.round((completed / checks.length) * 100),
    missing: checks.filter((item) => !item.complete),
    completed,
    total: checks.length,
  }
}

// True once the tenant has provided the match-driving facts that first-run onboarding
// deliberately skips (budget, move-in date, household size). Used to show a restrained,
// dismissable-feeling nudge after they've already seen real matches — never to block anything.
export function hasCoreMatchFacts(profile = {}) {
  const budgetReady = Number(profile.budgetMin) >= 0 && Number(profile.budgetMax) > 0 && Number(profile.budgetMin) <= Number(profile.budgetMax)
  return budgetReady && Boolean(profile.moveInDate) && Number(profile.householdSize) >= 1
}
import { canListingReceiveEnquiry } from './listingLifecycle'
