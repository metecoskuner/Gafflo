// Stage I — translates aggregate-only landlord analytics RPC rows into component shapes.
// This module never handles raw listing_views rows; viewer identities do not leave the backend.

export function emptyListingAnalytics(listingId) {
  return {
    listingId,
    uniqueViews: 0,
    saves: 0,
    applications: 0,
    enquiries: 0,
    confirmedViewings: 0,
  }
}

export function mapListingAnalyticsRowToAnalytics(row) {
  return {
    listingId: row.listing_id,
    uniqueViews: row.unique_views || 0,
    saves: row.saves || 0,
    applications: row.applications || 0,
    enquiries: row.enquiries || 0,
    confirmedViewings: row.confirmed_viewings || 0,
  }
}

export function mapListingAnalyticsRowsToMap(rows) {
  const map = new Map()
  rows.forEach((row) => {
    const analytics = mapListingAnalyticsRowToAnalytics(row)
    map.set(analytics.listingId, analytics)
  })
  return map
}
