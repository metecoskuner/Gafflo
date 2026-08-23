// Old space-separated mock vocabulary — kept only because config/entitlements.js's dormant,
// unwired Gafflo+ follow-up helpers (canSendPremiumFollowUp/filterVisibleEnquiryHistory) still
// import these two. Not real product paths: see the Stage E and Stage F final reports for why
// that feature remains out of scope and unwired. Every real status check in the app uses
// config/applicationStatus.js's real application_status_t vocabulary instead.
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

// A budget side counts as genuinely "set" only when it's a real positive number — matching
// Profile.jsx's own budgetSelectValue(), where a literal 0 (a real value at least one existing
// tenant profile has) already displays as "No minimum," not as a distinct real value.
function isBudgetSideSet(value) {
  const numeric = Number(value)
  return value !== null && value !== undefined && value !== '' && Number.isFinite(numeric) && numeric > 0
}

// "No minimum" / "No maximum" (Stage V's budget selector) is a real, deliberate, complete answer
// — flexible, not unanswered — so it must never read as an incomplete profile. We have no way to
// tell "chose flexible on purpose" apart from "never touched this field" (same stored state
// either way), and Stage Y's product decision is to not invent that distinction: both count as
// complete. A one-sided preference (only min or only max genuinely set) is equally a real,
// deliberate answer. The one state that's still genuinely incomplete is a real contradiction —
// both sides set to actual numbers with min above max — which normal use can't reach (Profile.jsx
// blocks saving it) but stays checked here since the shape itself can still represent it.
function isBudgetComplete(profile) {
  const minSet = isBudgetSideSet(profile.budgetMin)
  const maxSet = isBudgetSideSet(profile.budgetMax)
  if (minSet && maxSet) return Number(profile.budgetMin) <= Number(profile.budgetMax)
  return true
}

export function getTenantProfileCompleteness(profile) {
  const checks = [
    // Onboarding's own two required questions (see TenantOnboarding.jsx) — a tenant who has
    // done nothing but onboarding already gave two real, meaningful answers, so this score
    // shouldn't read 0% until they come back and fill in everything else too.
    { id: 'targetCity', label: 'Target city', complete: Boolean(String(profile.targetCity || '').trim()) },
    { id: 'lookingFor', label: 'Looking for', complete: Boolean(profile.lookingFor) },
    { id: 'budget', label: 'Budget preference', complete: isBudgetComplete(profile) },
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
//
// Shares isBudgetComplete() with getTenantProfileCompleteness() above rather than re-deriving its
// own stricter version, specifically so this nudge can never contradict what the Profile page
// itself says (Stage Y2) — a flexible ("No minimum"/"No maximum") budget is a real, deliberate
// answer here too, not a gap to nudge about. Smart Match's actual ranking (calculatePropertyMatch)
// never calls this function — it has its own, already-correct, independent handling of an unknown
// or one-sided budget — so this change has no effect on scoring/ranking at all.
export function hasCoreMatchFacts(profile = {}) {
  return isBudgetComplete(profile) && Boolean(profile.moveInDate) && Number(profile.householdSize) >= 1
}
import { canListingReceiveEnquiry } from './listingLifecycle'
