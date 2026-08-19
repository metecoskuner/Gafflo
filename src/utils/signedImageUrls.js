// Stage C — small module-level cache so Discover/LandlordProperties/PropertyDetailsModal don't
// each request a fresh signed URL for the same storage_path on every render/re-fetch. The
// listing-photos bucket is private (see the Stage C backend contract) — signed URLs are the
// only way to display an image, and the DB only ever stores storage_path, never a URL, so this
// cache exists purely to avoid redundant network round-trips, not to persist anything.
import { createSignedImageUrls } from '../services/listingsService'

// 1 hour: long enough that a normal browsing/editing session never sees an image blank out
// mid-use, short enough that a photo removed/replaced doesn't stay reachable for long after.
const EXPIRY_SECONDS = 3600
const REFRESH_MARGIN_MS = 5 * 60 * 1000

const cache = new Map() // storage_path -> { url, expiresAt }

export async function resolveSignedUrls(paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  const now = Date.now()
  const stale = uniquePaths.filter((path) => {
    const entry = cache.get(path)
    return !entry || entry.expiresAt - now < REFRESH_MARGIN_MS
  })

  if (stale.length) {
    const fresh = await createSignedImageUrls(stale, EXPIRY_SECONDS)
    const expiresAt = Date.now() + EXPIRY_SECONDS * 1000
    Object.entries(fresh).forEach(([path, url]) => cache.set(path, { url, expiresAt }))
  }

  const result = {}
  uniquePaths.forEach((path) => {
    const entry = cache.get(path)
    if (entry) result[path] = entry.url
  })
  return result
}

// Test-only escape hatch and post-delete hygiene — a deleted image's path must never resolve to
// a stale cached URL for the remainder of the session.
export function forgetSignedUrl(path) {
  cache.delete(path)
}

export function clearSignedUrlCache() {
  cache.clear()
}
