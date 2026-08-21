// Stage K — pure mapping/label helpers for the moderator workspace. Reuses
// listingReportsAdapter's reason labels (Stage J1) rather than duplicating that enum mapping.

export const LISTING_REPORT_STATUSES = [
  { value: 'reviewed', label: 'Mark reviewed' },
  { value: 'dismissed', label: 'Dismiss' },
  { value: 'actioned', label: 'Mark actioned' },
]

export function mapReportRowToReport(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    reason: row.reason,
    description: row.description || '',
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    // Deliberately no reporterId field here — reporter_id exists on the raw row but this
    // adapter never carries it forward into anything the UI renders.
  }
}

export function mapListingRowToPendingListing(row) {
  return {
    id: row.id,
    title: row.title || 'Untitled listing',
    city: row.city || '',
    area: row.area || '',
    rent: row.rent,
    listingCategory: row.listing_category,
    createdAt: row.created_at,
  }
}

export function listingSummaryLabel(listing) {
  if (!listing) return 'Listing'
  const place = [listing.area, listing.city].filter(Boolean).join(', ')
  return place ? `${listing.title} — ${place}` : listing.title
}
