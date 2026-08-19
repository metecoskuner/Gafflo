// Stage D — translates real applications rows into the shape components consume. `propertyId`
// (not `listing_id`) and `tenant` (not `tenant_snapshot`) are deliberate presentation-layer
// naming choices, not fake concepts being preserved: the rest of this app has always called a
// listing a "property" (properties, PropertyDetailsModal, landlordProperties, savedProperties —
// see config/listingAdapter.js's own mapListingRowToProperty), so this keeps a real application
// a drop-in match for the existing property-lookup idiom (`properties.find(p => p.id ===
// application.propertyId)`) used throughout Applicants.jsx/PropertyDetailsModal/Dashboard/etc.
import { mapTenantProfileRowToFields } from './accountProfile'

export function mapApplicationRowToApplication(row) {
  if (!row) return null
  const breakdown = row.rental_fit_breakdown || {}
  return {
    id: row.id,
    propertyId: row.listing_id,
    tenantId: row.tenant_id,
    status: row.status,
    tenant: mapApplicationSnapshotToTenant(row.tenant_snapshot),
    match: {
      score: row.rental_fit_score,
      reasons: breakdown.reasons || [],
      warnings: breakdown.warnings || [],
      hardStops: breakdown.hard_stops || [],
    },
    rentalFitAlgorithmVersion: row.rental_fit_algorithm_version,
    firstViewedAt: row.first_viewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// tenant_snapshot uses exactly the same tenant_profiles column names as a live row (frozen at
// create_application() time — see the Stage D migration's v_snapshot), plus one extra field
// (display_name, from profiles) that table doesn't have. Reusing mapTenantProfileRowToFields
// verbatim avoids duplicating its ~20 field translations for a second, parallel "snapshot" shape
// — and guarantees the applicant card only ever shows exactly the snapshot keys the backend
// actually produced, never an invented value for a key that isn't there.
function mapApplicationSnapshotToTenant(snapshot) {
  if (!snapshot) return null
  return {
    ...mapTenantProfileRowToFields(snapshot),
    displayName: snapshot.display_name || '',
  }
}
