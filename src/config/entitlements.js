import { LANDLORD_PLAN, TENANT_PLAN, getLandlordPlanConfig, getTenantPlanConfig, pricingPlans } from './pricingPlans'
import { isClosedStatus, isLandlordEngagedStatus } from './rentalJourney'
import { hasLandlordMessage } from '../utils/messagingRules'
import { canBoostListing } from './promotion'

// Canonical plan/role separation: `role` ('tenant' | 'landlord') decides what someone *is*.
// `plan` ('free' | 'gafflo_plus' | 'landlord_plus') decides what they're *entitled to*.
// Never combine them into one value (e.g. role = 'premium_landlord') — every helper below
// takes a plan explicitly so entitlement checks stay independent of identity/role checks.

export function isTenantPlus(plan) {
  return plan === TENANT_PLAN.GAFFLO_PLUS
}

export function isLandlordPlus(plan) {
  return plan === LANDLORD_PLAN.LANDLORD_PLUS
}

// ---- Tenant entitlements ----

export function getSmartMatchAllowance(plan) {
  return getTenantPlanConfig(plan).smartMatchCardsPerDay
}

export function getInterestAllowance(plan) {
  return getTenantPlanConfig(plan).interestsPerDay
}

export function canUseAdvancedFilters(plan) {
  return isTenantPlus(plan)
}

export function canRewind(plan) {
  return isTenantPlus(plan)
}

export function canUseFullHistory(plan) {
  return isTenantPlus(plan)
}

export function canUseListingCompare(plan) {
  return isTenantPlus(plan)
}

// Free tenants still see their full *active* history — only aged-out closed enquiries are
// trimmed. Nothing safety-critical (an active application, a message thread) is ever hidden.
export function filterVisibleEnquiryHistory(enquiries, plan, { now = new Date(), freeHistoryDays = 30 } = {}) {
  if (canUseFullHistory(plan)) return enquiries
  const cutoff = new Date(now).getTime() - freeHistoryDays * 24 * 60 * 60 * 1000
  return enquiries.filter((enquiry) => {
    if (!isClosedStatus(enquiry.status)) return true
    const updatedAt = new Date(enquiry.updatedAt || enquiry.createdAt).getTime()
    return Number.isFinite(updatedAt) && updatedAt >= cutoff
  })
}

// ---- Landlord entitlements ----

export function getActiveListingAllowance(plan) {
  return getLandlordPlanConfig(plan).activeListingAllowance
}

export function canUseAdvancedApplicantTools(plan) {
  return isLandlordPlus(plan)
}

export { canBoostListing }

// ---- Launch access ----
// Launch access is a temporary promotion, not a paid entitlement. It can make paid-plan-like
// usage available to everyone for a while, but it never changes what plan someone is on —
// once launch access ends, entitlements fall back to each account's actual plan.
export function getEffectiveSmartMatchAllowance(plan, { launchAccessEnabled = false } = {}) {
  return launchAccessEnabled ? Infinity : getSmartMatchAllowance(plan)
}

export function getEffectiveInterestAllowance(plan, { launchAccessEnabled = false } = {}) {
  return launchAccessEnabled ? Infinity : getInterestAllowance(plan)
}

// ---- Premium follow-up ----
// A tenant may send exactly one follow-up message per enquiry, and only after the landlord
// has had a full waiting period to respond. This never weakens the existing anti-spam guard
// in messagingRules — canTenantSendMessage still gates every send. This is an *additional*,
// stricter allowance layered on top for Gafflo+ tenants only.
export function canSendPremiumFollowUp({ enquiry, conversation, plan, now = new Date() }) {
  if (!isTenantPlus(plan)) return false
  if (!enquiry) return false
  if (isClosedStatus(enquiry.status)) return false
  if (isLandlordEngagedStatus(enquiry.status)) return false
  if (conversation?.blockedBy) return false
  if (hasLandlordMessage(conversation)) return false
  if (enquiry.premiumFollowUpUsedAt) return false

  const sentAt = new Date(enquiry.createdAt).getTime()
  const nowTime = new Date(now).getTime()
  if (!Number.isFinite(sentAt) || !Number.isFinite(nowTime)) return false

  const waitingPeriodMs = pricingPlans.followUp.waitingPeriodHours * 60 * 60 * 1000
  return nowTime - sentAt >= waitingPeriodMs
}
