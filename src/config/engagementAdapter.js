// Stage G — translates real saved_listings/smart_match_decisions/usage rows into the shapes
// components consume. Indexed by Set/Map on purpose (see EngagementProvider) rather than arrays
// components would otherwise re-scan per listing card — see the Stage G report's query-
// efficiency section.
import { TENANT_PLAN } from './pricingPlans'
import { getInterestAllowance, getSmartMatchAllowance } from './entitlements'

export function mapSavedListingRowsToIdSet(rows) {
  return new Set(rows.map((row) => row.listing_id))
}

export function mapDecisionRowsToMap(rows) {
  const map = new Map()
  rows.forEach((row) => {
    map.set(row.listing_id, { decision: row.decision, decidedAt: row.decided_at })
  })
  return map
}

// The server enforces the real limit unconditionally (see record_smart_match_decision() in the
// Stage G migration) — this denominator is display-only and deliberately always the real FREE
// tier's numbers, never a locally-stored/spoofable plan flag, since no paid-entitlement backend
// exists yet to make a higher number honest (see the Stage G report's Launch Access retirement
// section). cardsUsed/interestsUsed come from the server's own get_smart_match_usage() response.
// Real Smart Match candidate exclusion (Stage G): a listing already decisioned (real, permanent
// Pass or Interested) or owned by the caller never appears as a candidate again — no separate
// local "dismissed"/swipe-history concept, and no resurfacing (see the Stage G report).
export function filterAvailableSmartMatchCandidates(properties, decisions, ownListingIds) {
  return properties.filter((property) => !decisions.has(property.id) && !ownListingIds.has(property.id))
}

export function mapUsageRowToSmartMatchUsage(usageRow) {
  const cardAllowance = getSmartMatchAllowance(TENANT_PLAN.FREE)
  const interestAllowance = getInterestAllowance(TENANT_PLAN.FREE)
  const cardsUsed = usageRow.smart_match_count || 0
  const interestsUsed = usageRow.interested_count || 0
  return {
    date: usageRow.usage_date,
    cardsUsed,
    interestsUsed,
    cardAllowance,
    interestAllowance,
    cardsRemaining: Math.max(0, cardAllowance - cardsUsed),
    interestsRemaining: Math.max(0, interestAllowance - interestsUsed),
  }
}
