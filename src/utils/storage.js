const KEYS = {
  profile: 'gafflo.tenant-profile',
  saved: 'gafflo.saved-rooms',
  reviewed: 'gafflo.reviewed-rooms',
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
