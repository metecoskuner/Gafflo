const KEYS = {
  propertyReports: 'gafflo.property-reports',
  tenantPlan: 'gafflo.tenant-plan',
  landlordPlan: 'gafflo.landlord-plan',
}

function getJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function setJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

// Stage C: local-only safety annotations (see MarketplaceState.jsx's reportListing) keyed by
// listing id — never the listing data itself, which now lives in real Supabase (see
// ListingsProvider). Deliberately never reads the retired gafflo.properties/gaffly.created-
// listings keys as a fallback: a stale local report dict must not resurrect old mock listing
// records that no longer exist anywhere real.
export function getPropertyReports() {
  return getJson(KEYS.propertyReports, {})
}

export function setPropertyReports(reports) {
  setJson(KEYS.propertyReports, reports)
}

// Local-only plan state for this prototype. No purchase flow sets these yet — they exist so
// the entitlement architecture is real and testable now, and swappable for backend-issued
// entitlements later without touching any call site.
export function getTenantPlan() {
  return getJson(KEYS.tenantPlan, 'free')
}

export function setTenantPlan(plan) {
  setJson(KEYS.tenantPlan, plan)
}

export function getLandlordPlan() {
  return getJson(KEYS.landlordPlan, 'free')
}

export function setLandlordPlan(plan) {
  setJson(KEYS.landlordPlan, plan)
}
