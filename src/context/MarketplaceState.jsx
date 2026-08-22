import { useMemo, useState } from 'react'
import { ANY_VALUE } from '../config/domainOptions'
import { propertyMatchesFilters } from '../config/discoveryFilters'
import { filterAvailableSmartMatchCandidates } from '../config/engagementAdapter'
import { calculatePropertyMatch } from '../utils/calculatePropertyMatch'
import { getLandlordPlan, getTenantPlan } from '../utils/storage'
import AppStateContext from './AppStateContext'
import useAccountProfile from './useAccountProfile'
import useEngagement from './useEngagement'
import useListings from './useListings'

const defaultPropertyFilters = {
  priceMin: '',
  priceMax: '',
  location: 'Any',
  moveInBy: '',
  listingCategory: 'Any',
  propertyType: 'Any',
  roomType: 'Any',
  privateBathroom: 'Any',
  billsIncluded: 'Any',
  ownerOccupied: 'Any',
  couplesAccepted: 'Any',
  furnishedPreference: 'Any',
  bedrooms: 'Any',
  pets: 'Any',
  parking: 'Any',
  leaseLength: 'Any',
}

// Stage E retired the mock enquiries/conversations domain this provider used to own; Stage G
// retires the mock saved/Smart Match domain the same way (see the Stage G report's local-storage
// retirement section); Stage J1 retires the local-only property-report annotations the same way
// again — see services/listingReportsService.js and the report_listing() RPC. Real saved
// listings and Smart Match decisions/usage (context/EngagementProvider) are now the authoritative
// source, backed by real Supabase. This component stays a read-composition layer: real listings
// (context/ListingsProvider) + real engagement (context/EngagementProvider) + local filters,
// producing the candidate lists and action wrappers the UI consumes. The only genuinely
// local-only concern left here is property filters (a view preference, not saved data).
export function AppStateProvider({ children }) {
  // The real account/role/profile layer (AccountProfileProvider, a parent of this provider in
  // App.jsx) is the only source of truth for WHO the user is and WHAT roles they've set up.
  const { activeRole, tenantProfile, landlordProfile } = useAccountProfile()
  const [tenantPlan] = useState(() => getTenantPlan())
  const [landlordPlan] = useState(() => getLandlordPlan())
  // Real Supabase source of truth for listings/photos (Stage C) — see ListingsProvider. This
  // provider only reads from it; every listing write (create/edit/lifecycle/photos) goes through
  // useListings() directly from CreateListing.jsx/LandlordProperties.jsx, never through here.
  const { myListings, publicListings, loading: listingsLoading } = useListings()
  // Real Supabase source of truth for saved listings / Smart Match decisions / daily usage
  // (Stage G) — see EngagementProvider. Every save/unsave/Pass/Interested write goes through it.
  const { savedIds, decisions, usage, setSaved, recordDecision } = useEngagement()
  const [propertyFilters, setPropertyFiltersState] = useState(defaultPropertyFilters)
  const [toast, setToast] = useState(null)

  // publicListings only ever contains status='published' rows (any owner); myListings only ever
  // contains the real authenticated user's own rows, in any status (draft/pending/paused/
  // rejected/rented included) — a landlord must see their own non-published listings, but never
  // another owner's. De-duplicated by id, own-listing data (fuller: exact_address/eircode/
  // rejection_reason) taking precedence over the narrower public projection of the same row.
  const ownListingIds = useMemo(() => new Set(myListings.map((property) => property.id)), [myListings])
  const properties = useMemo(() => {
    const merged = [...myListings, ...publicListings.filter((property) => !ownListingIds.has(property.id))]
    return merged.map((property) => ({
      ...property,
      match: calculatePropertyMatch(tenantProfile, property),
    }))
  }, [myListings, publicListings, ownListingIds, tenantProfile])

  const activeProperties = useMemo(() => properties.filter((property) => ['published', 'active'].includes(property.listingStatus)), [properties])
  const discoveryProperties = useMemo(
    () => activeProperties.filter((property) => propertyMatchesFilters(property, propertyFilters)),
    [activeProperties, propertyFilters],
  )
  // Real Smart Match candidate exclusion: a listing this tenant already has a real, permanent
  // decision on (Pass or Interested — see EngagementProvider) never resurfaces, and neither does
  // a dual-role tenant's own listing (server also enforces this — see
  // record_smart_match_decision() in the Stage G migration — this is defense-in-depth, not the
  // real guard). Deliberately no separate local "dismissed" concept anymore: a real decision IS
  // the exclusion, and Stage G builds no resurfacing/reset (see the Stage G report).
  const availableProperties = useMemo(
    () => filterAvailableSmartMatchCandidates(discoveryProperties, decisions, ownListingIds),
    [decisions, discoveryProperties, ownListingIds],
  )
  const savedProperties = useMemo(
    () => properties.filter((property) => savedIds.has(property.id)),
    [properties, savedIds],
  )
  // Always the real authenticated user's own listings (get_my_listings(), RLS-scoped server-side
  // to auth.uid()).
  const landlordProperties = useMemo(
    () => myListings.map((property) => ({ ...property, match: calculatePropertyMatch(tenantProfile, property) })),
    [myListings, tenantProfile],
  )

  const value = {
    tenantProfile,
    landlordProfile,
    tenantPlan,
    landlordPlan,
    listingsLoading,
    properties,
    activeProperties,
    discoveryProperties,
    availableProperties,
    savedProperties,
    landlordProperties,
    propertyFilters,
    savedPropertyIds: Array.from(savedIds),
    smartMatchUsage: usage,
    toast,
    activeFilterCount: Object.entries(propertyFilters).filter(([, value]) => value && !['Any', ANY_VALUE].includes(value)).length,
    dismissToast: () => setToast(null),
    showToast: (nextToast) => setToast(nextToast),
    setPropertyFilters(nextFilters) {
      setPropertyFiltersState((current) => ({ ...current, ...nextFilters }))
    },
    resetPropertyFilters() {
      setPropertyFiltersState(defaultPropertyFilters)
    },
    async saveProperty(propertyId) {
      const { error } = await setSaved(propertyId, true)
      setToast(error ? { type: 'info', message: error } : { type: 'success', message: 'Saved privately.' })
    },
    async removeSavedProperty(propertyId) {
      const { error } = await setSaved(propertyId, false)
      setToast(error ? { type: 'info', message: error } : { type: 'info', message: 'Removed from saved properties.' })
    },
    async passSmartMatchProperty(propertyId) {
      const { error } = await recordDecision(propertyId, 'pass')
      if (error) setToast({ type: 'info', message: error })
    },
    // Decoupled from Applications as of Stage G: this only ever records a real, private Smart
    // Match "interested" decision — it never applies on the tenant's behalf. Applying remains a
    // separate, explicit action on the listing's own details page (see the Stage G report's
    // Application-relationship section). Returns whether the decision was recorded, purely so
    // callers can react to failure — never an implicit "and also applied" signal.
    async recordSmartMatchInterest(propertyId) {
      if (activeRole === 'landlord') {
        setToast({ type: 'info', message: 'Switch to tenant mode to use Smart Match.' })
        return false
      }
      const { error } = await recordDecision(propertyId, 'interested')
      if (error) {
        setToast({ type: 'info', message: error })
        return false
      }
      return true
    },
    // Listing create/edit/lifecycle/photo writes go directly through useListings() from
    // CreateListing.jsx and LandlordProperties.jsx (Stage C); application writes go through
    // useApplications() (Stage D); real conversation/message/block writes go through
    // useMessaging() (Stage E); real viewing writes go through useViewings() (Stage F); real
    // saved/Smart Match writes go through useEngagement() (Stage G); real listing reports go
    // through services/listingReportsService.js directly from PropertyDetailsModal (Stage J1) —
    // this context stays a read-composition layer.
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
