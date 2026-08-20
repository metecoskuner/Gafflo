import { useCallback, useMemo, useState } from 'react'
import { ANY_VALUE } from '../config/domainOptions'
import { propertyMatchesFilters } from '../config/discoveryFilters'
import { canListingReceiveEnquiry } from '../config/listingLifecycle'
import { isLaunchAccessEnabled, smartMatchAccess } from '../config/smartMatch'
import { getEffectiveInterestAllowance, getEffectiveSmartMatchAllowance, getInterestAllowance, getSmartMatchAllowance } from '../config/entitlements'
import { calculatePropertyMatch } from '../utils/calculatePropertyMatch'
import { getLocalDateKey } from '../utils/localDate'
import AppStateContext from './AppStateContext'
import useAccountProfile from './useAccountProfile'
import useListings from './useListings'
import {
  getDismissedPropertyIds,
  getLandlordPlan,
  getPropertyReports,
  getSavedPropertyIds,
  getSmartMatchActivity,
  getTenantPlan,
  setDismissedPropertyIds,
  setPropertyReports,
  setSavedPropertyIds,
  setSmartMatchActivity,
} from '../utils/storage'

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

function getPublicPropertyById(properties, propertyId) {
  return properties.find((item) => item.id === propertyId && canListingReceiveEnquiry(item))
}

// Stage E retired the mock enquiries/conversations domain this provider used to own (see the
// Stage E report's local-storage/mock-identity retirement sections) — real applications
// (context/ApplicationsProvider) and real messaging (context/MessagingProvider) are now the
// authoritative source for those, each with its own real Supabase-backed provider. This
// component stays a read-composition layer for real listings (browse/Smart Match filtering,
// Rental Fit) plus the still-genuinely-local, no-backend-yet concerns: saved listings, Smart
// Match daily usage, and local property-report annotations.
export function AppStateProvider({ children }) {
  // The real account/role/profile layer (AccountProfileProvider, a parent of this provider in
  // App.jsx) is the only source of truth for WHO the user is and WHAT roles they've set up.
  const { activeRole, tenantProfile, landlordProfile } = useAccountProfile()
  const [tenantPlan] = useState(() => getTenantPlan())
  const [landlordPlan] = useState(() => getLandlordPlan())
  // Real Supabase source of truth for listings/photos (Stage C) — see ListingsProvider. This
  // provider only reads from it; every listing write (create/edit/lifecycle/photos) goes through
  // useListings() directly from CreateListing.jsx/LandlordProperties.jsx, never through here.
  const { myListings, publicListings } = useListings()
  const [propertyReports, setPropertyReportsState] = useState(() => getPropertyReports())
  const [savedPropertyIds, setSavedPropertyIdsState] = useState(() => getSavedPropertyIds())
  const [dismissedPropertyIds, setDismissedPropertyIdsState] = useState(() => getDismissedPropertyIds())
  const [smartMatchActivity, setSmartMatchActivityState] = useState(() => getSmartMatchActivity())
  const [propertyFilters, setPropertyFiltersState] = useState(defaultPropertyFilters)
  const [toast, setToast] = useState(null)

  // publicListings only ever contains status='published' rows (any owner); myListings only ever
  // contains the real authenticated user's own rows, in any status (draft/pending/paused/
  // rejected/rented included) — a landlord must see their own non-published listings, but never
  // another owner's. De-duplicated by id, own-listing data (fuller: exact_address/eircode/
  // rejection_reason) taking precedence over the narrower public projection of the same row.
  const properties = useMemo(() => {
    const ownIds = new Set(myListings.map((property) => property.id))
    const merged = [...myListings, ...publicListings.filter((property) => !ownIds.has(property.id))]
    return merged.map((property) => ({
      ...property,
      localReport: propertyReports[property.id] || null,
      match: calculatePropertyMatch(tenantProfile, property),
    }))
  }, [myListings, publicListings, propertyReports, tenantProfile])

  const activeProperties = useMemo(() => properties.filter((property) => ['published', 'active'].includes(property.listingStatus)), [properties])
  const discoveryProperties = useMemo(
    () => activeProperties.filter((property) => propertyMatchesFilters(property, propertyFilters)),
    [activeProperties, propertyFilters],
  )
  const availableProperties = useMemo(
    () => discoveryProperties.filter((property) => !dismissedPropertyIds.includes(property.id)),
    [dismissedPropertyIds, discoveryProperties],
  )
  const effectiveSavedPropertyIds = useMemo(
    () => savedPropertyIds.filter((id) => properties.some((property) => property.id === id)),
    [properties, savedPropertyIds],
  )
  const savedProperties = useMemo(
    () => properties.filter((property) => effectiveSavedPropertyIds.includes(property.id)),
    [effectiveSavedPropertyIds, properties],
  )
  // Always the real authenticated user's own listings (get_my_listings(), RLS-scoped server-side
  // to auth.uid()).
  const landlordProperties = useMemo(
    () => myListings.map((property) => ({ ...property, localReport: propertyReports[property.id] || null, match: calculatePropertyMatch(tenantProfile, property) })),
    [myListings, propertyReports, tenantProfile],
  )
  const todayKey = getLocalDateKey()
  const todaysSmartMatchActivity = smartMatchActivity[todayKey] || { cards: 0, interests: 0 }
  const smartMatchCardAllowance = getSmartMatchAllowance(tenantPlan)
  const smartMatchInterestAllowance = getInterestAllowance(tenantPlan)
  const launchAccessEnabled = isLaunchAccessEnabled()
  const effectiveSmartMatchCardAllowance = getEffectiveSmartMatchAllowance(tenantPlan, { launchAccessEnabled })
  const effectiveSmartMatchInterestAllowance = getEffectiveInterestAllowance(tenantPlan, { launchAccessEnabled })
  const smartMatchUsage = {
    date: todayKey,
    cardsUsed: todaysSmartMatchActivity.cards || 0,
    interestsUsed: todaysSmartMatchActivity.interests || 0,
    cardsRemaining: Math.max(0, smartMatchCardAllowance - (todaysSmartMatchActivity.cards || 0)),
    interestsRemaining: Math.max(0, smartMatchInterestAllowance - (todaysSmartMatchActivity.interests || 0)),
    cardAllowance: smartMatchCardAllowance,
    interestAllowance: smartMatchInterestAllowance,
    plan: tenantPlan,
    access: smartMatchAccess,
    isLaunchFree: launchAccessEnabled,
  }

  const persistPropertyReports = useCallback((next) => {
    setPropertyReports(next)
    setPropertyReportsState(next)
  }, [])
  const persistSmartMatchActivity = useCallback((next) => {
    setSmartMatchActivity(next)
    setSmartMatchActivityState(next)
  }, [])

  const markSmartMatchAction = useCallback(
    (type) => {
      const current = smartMatchActivity[todayKey] || { cards: 0, interests: 0 }
      const next = {
        ...smartMatchActivity,
        [todayKey]: {
          cards: current.cards + 1,
          interests: current.interests + (type === 'interested' ? 1 : 0),
        },
      }
      persistSmartMatchActivity(next)
    },
    [persistSmartMatchActivity, smartMatchActivity, todayKey],
  )

  const value = {
    tenantProfile,
    landlordProfile,
    tenantPlan,
    landlordPlan,
    properties,
    activeProperties,
    discoveryProperties,
    availableProperties,
    savedProperties,
    landlordProperties,
    propertyFilters,
    savedPropertyIds: effectiveSavedPropertyIds,
    dismissedPropertyIds,
    smartMatchUsage,
    toast,
    activeFilterCount: Object.entries(propertyFilters).filter(([, value]) => value && !['Any', ANY_VALUE].includes(value)).length,
    dismissToast: () => setToast(null),
    setPropertyFilters(nextFilters) {
      setPropertyFiltersState((current) => ({ ...current, ...nextFilters }))
    },
    resetPropertyFilters() {
      setPropertyFiltersState(defaultPropertyFilters)
    },
    saveProperty(propertyId) {
      if (!getPublicPropertyById(properties, propertyId)) {
        setToast({ type: 'info', message: 'This listing is not available to save.' })
        return
      }
      if (savedPropertyIds.includes(propertyId)) return
      const next = savedPropertyIds.includes(propertyId) ? savedPropertyIds : [...savedPropertyIds, propertyId]
      setSavedPropertyIds(next)
      setSavedPropertyIdsState(next)
      setToast({ type: 'success', message: 'Saved privately.' })
    },
    removeSavedProperty(propertyId) {
      if (!savedPropertyIds.includes(propertyId)) return
      const next = savedPropertyIds.filter((id) => id !== propertyId)
      setSavedPropertyIds(next)
      setSavedPropertyIdsState(next)
      setToast({ type: 'info', message: 'Removed from saved properties.' })
    },
    dismissProperty(propertyId) {
      if (!getPublicPropertyById(properties, propertyId) || dismissedPropertyIds.includes(propertyId)) return
      const next = dismissedPropertyIds.includes(propertyId) ? dismissedPropertyIds : [...dismissedPropertyIds, propertyId]
      setDismissedPropertyIds(next)
      setDismissedPropertyIdsState(next)
      setToast({ type: 'info', message: 'Property dismissed.' })
    },
    passSmartMatchProperty(propertyId) {
      if (todaysSmartMatchActivity.cards >= effectiveSmartMatchCardAllowance) {
        setToast({ type: 'info', message: 'Daily Smart Match card limit reached. Browse is still available.' })
        return
      }
      if (!getPublicPropertyById(properties, propertyId) || dismissedPropertyIds.includes(propertyId)) return
      const next = dismissedPropertyIds.includes(propertyId) ? dismissedPropertyIds : [...dismissedPropertyIds, propertyId]
      setDismissedPropertyIds(next)
      setDismissedPropertyIdsState(next)
      markSmartMatchAction('pass')
      setToast({ type: 'info', message: 'Passed.' })
    },
    startOver() {
      setDismissedPropertyIds([])
      setDismissedPropertyIdsState([])
      setToast({ type: 'info', message: 'Discovery reset. Daily usage is unchanged.' })
    },
    // Stage D: the actual apply-to-listing write is real (see useApplications().applyToListing,
    // called by MarketplaceDiscover before this runs) — this stays local-only bookkeeping for the
    // Smart Match deck's own daily card/interest allowance and dismissal, never enquiry/conversation
    // creation. Returns whether the local gating allowed the interest to be recorded at all, so the
    // caller knows whether to bother calling the real apply action.
    recordSmartMatchInterest(propertyId) {
      if (activeRole === 'landlord') {
        setToast({ type: 'info', message: 'Switch to tenant mode to apply.' })
        return false
      }
      if (todaysSmartMatchActivity.interests >= effectiveSmartMatchInterestAllowance) {
        setToast({ type: 'info', message: 'Daily interest limit reached. You can still browse and save listings.' })
        return false
      }
      if (todaysSmartMatchActivity.cards >= effectiveSmartMatchCardAllowance) {
        setToast({ type: 'info', message: 'Daily Smart Match card limit reached. Browse is still available.' })
        return false
      }
      if (!getPublicPropertyById(properties, propertyId)) {
        setToast({ type: 'info', message: 'This listing is not accepting new applications.' })
        return false
      }
      const next = dismissedPropertyIds.includes(propertyId) ? dismissedPropertyIds : [...dismissedPropertyIds, propertyId]
      setDismissedPropertyIds(next)
      setDismissedPropertyIdsState(next)
      markSmartMatchAction('interested')
      setToast({ type: 'success', message: 'Application sent.' })
      return true
    },
    // Local-only safety annotation, deliberately decoupled from the real listings array: it
    // never touches listings/listing_images (no backend moderation-report table exists yet),
    // and it must survive regardless of whether propertyId belongs to a real or (still-mocked)
    // fixture property.
    reportListing(propertyId, reason) {
      const property = properties.find((item) => item.id === propertyId)
      if (!property || !String(reason || '').trim()) return
      const next = { ...propertyReports, [propertyId]: { reason: String(reason).trim(), reportedAt: new Date().toISOString() } }
      persistPropertyReports(next)
      setToast({ type: 'success', message: 'Report saved locally on this device.' })
    },
    // Listing create/edit/lifecycle/photo writes go directly through useListings() from
    // CreateListing.jsx and LandlordProperties.jsx (Stage C); application writes go through
    // useApplications() (Stage D); real conversation/message/block writes go through
    // useMessaging() (Stage E) — this context stays a read-composition layer for listings.
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
