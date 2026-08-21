const KEYS = {
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
