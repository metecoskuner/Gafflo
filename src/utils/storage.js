const KEYS = {
  profile: 'gaffly.tenant-profile',
  saved: 'gaffly.saved-rooms',
  reviewed: 'gaffly.reviewed-rooms',
  onboarding: 'gaffly.onboarding',
  conversations: 'gaffly.conversations',
  createdListings: 'gaffly.created-listings',
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

export function getTenantProfile() {
  return getJson(KEYS.profile, null)
}

export function setTenantProfile(profile) {
  setJson(KEYS.profile, profile)
}

export function getSavedRoomIds() {
  return getJson(KEYS.saved, [])
}

export function setSavedRoomIds(ids) {
  setJson(KEYS.saved, ids)
}

export function getReviewedRoomIds() {
  return getJson(KEYS.reviewed, [])
}

export function setReviewedRoomIds(ids) {
  setJson(KEYS.reviewed, ids)
}

export function getOnboarding() {
  return getJson(KEYS.onboarding, null)
}

export function setOnboarding(onboarding) {
  setJson(KEYS.onboarding, onboarding)
}

export function getConversations() {
  return getJson(KEYS.conversations, [])
}

export function setConversations(conversations) {
  setJson(KEYS.conversations, conversations)
}

export function getCreatedListings() {
  return getJson(KEYS.createdListings, [])
}

export function setCreatedListings(listings) {
  setJson(KEYS.createdListings, listings)
}
