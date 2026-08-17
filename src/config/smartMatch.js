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

const TEST_OVERRIDE_KEY = 'gafflo.test-launch-access-override'

// The committed launchAccessEnabled value above must never change just to make a limit state
// testable. This reads one narrowly-named, test-only localStorage key that nothing in the app
// ever writes — real users can never trigger it — so E2E can deterministically exercise the
// post-launch (non-launch) limit UX without touching production behaviour.
export function isLaunchAccessEnabled() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const override = window.localStorage.getItem(TEST_OVERRIDE_KEY)
    if (override === 'false') return false
    if (override === 'true') return true
  }
  return smartMatchAccess.launchAccessEnabled
}
