const KEYS = {
  account: 'gafflo.account',
  tenantProfile: 'gafflo.tenant-profile',
  landlordProfile: 'gafflo.landlord-profile',
  saved: 'gafflo.saved-properties',
  dismissed: 'gafflo.dismissed-properties',
  smartMatchActivity: 'gafflo.smart-match-activity',
  enquiries: 'gafflo.enquiries',
  conversations: 'gafflo.conversations',
  properties: 'gafflo.properties',
  tenantPlan: 'gafflo.tenant-plan',
  landlordPlan: 'gafflo.landlord-plan',
}

const LEGACY_KEYS = {
  account: 'gafflo.onboarding',
  tenantProfile: 'gaffly.tenant-profile',
  saved: 'gaffly.saved-rooms',
  dismissed: 'gaffly.reviewed-rooms',
  conversations: 'gaffly.conversations',
  properties: 'gaffly.created-listings',
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

export function getAccount() {
  const account = getJson(KEYS.account, null, LEGACY_KEYS.account)
  if (!account?.userType) return account
  return {
    role: account.userType === 'offering' ? 'landlord' : 'tenant',
    landlordType: account.userType === 'offering' ? 'private_landlord' : null,
    completed: true,
  }
}

export function setAccount(account) {
  setJson(KEYS.account, account)
}

export function getTenantProfile() {
  return getJson(KEYS.tenantProfile, null, LEGACY_KEYS.tenantProfile)
}

export function setTenantProfile(profile) {
  setJson(KEYS.tenantProfile, profile)
}

export function getLandlordProfile() {
  return getJson(KEYS.landlordProfile, null)
}

export function setLandlordProfile(profile) {
  setJson(KEYS.landlordProfile, profile)
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

export function getEnquiries() {
  return getJson(KEYS.enquiries, [])
}

export function setEnquiries(enquiries) {
  setJson(KEYS.enquiries, enquiries)
}

export function getConversations() {
  return getJson(KEYS.conversations, [], LEGACY_KEYS.conversations)
}

export function setConversations(conversations) {
  setJson(KEYS.conversations, conversations)
}

export function getLocalProperties() {
  return getJson(KEYS.properties, [], LEGACY_KEYS.properties)
}

export function setLocalProperties(properties) {
  setJson(KEYS.properties, properties)
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
