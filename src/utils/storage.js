const KEYS = {
  saved: 'gafflo.saved-properties',
  dismissed: 'gafflo.dismissed-properties',
  smartMatchActivity: 'gafflo.smart-match-activity',
  propertyReports: 'gafflo.property-reports',
  conversationReports: 'gafflo.conversation-reports',
  tenantPlan: 'gafflo.tenant-plan',
  landlordPlan: 'gafflo.landlord-plan',
}

const LEGACY_KEYS = {
  saved: 'gaffly.saved-rooms',
  dismissed: 'gaffly.reviewed-rooms',
}

function getJson(key, fallback, legacyKey) {
  try {
    const raw = window.localStorage.getItem(key) || (legacyKey ? window.localStorage.getItem(legacyKey) : null)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function setJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function getSavedPropertyIds() {
  return getJson(KEYS.saved, [], LEGACY_KEYS.saved)
}

export function setSavedPropertyIds(ids) {
  setJson(KEYS.saved, ids)
}

export function getDismissedPropertyIds() {
  return getJson(KEYS.dismissed, [], LEGACY_KEYS.dismissed)
}

export function setDismissedPropertyIds(ids) {
  setJson(KEYS.dismissed, ids)
}

export function getSmartMatchActivity() {
  return getJson(KEYS.smartMatchActivity, {})
}

export function setSmartMatchActivity(activity) {
  setJson(KEYS.smartMatchActivity, activity)
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

// Stage E: same pattern as property reports above, but for conversations — a local-only safety
// annotation keyed by real conversation id, never conversation/message data itself (which is
// 100% Supabase-backed — see MessagingProvider). Report is not part of the real messaging
// backend contract; this stays honestly device-local, matching the existing "Report saved
// locally on this device" copy already established for property reports.
export function getConversationReports() {
  return getJson(KEYS.conversationReports, {})
}

export function setConversationReports(reports) {
  setJson(KEYS.conversationReports, reports)
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
