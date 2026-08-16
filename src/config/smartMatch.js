// Smart Match runtime behaviour only. Prices, feature lists and daily allowances live in
// pricingPlans.js — read them via entitlements.js (getSmartMatchAllowance/getInterestAllowance)
// so there is never a second, competing number for the same limit.
export const smartMatchAccess = {
  // Launch access is a temporary promotion: while true, daily limits are not enforced for
  // anyone, regardless of plan. It is not a paid entitlement — see entitlements.js.
  launchAccessEnabled: true,
  browseAlwaysAvailable: true,
  freePlanMessage: "Today's Smart Matches are finished. Continue browsing normally or start over to review the stack again.",
}
