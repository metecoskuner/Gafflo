import { useCallback, useMemo, useRef, useState } from 'react'
import { canTransitionApplication, nextViewingStatusForApplication } from '../config/applicationTransitions'
import {
  ANY_VALUE,
  normalizeFurnished,
  normalizeParking,
  normalizePetPolicy,
  normalizeSmoking,
} from '../config/domainOptions'
import { propertyMatchesFilters } from '../config/discoveryFilters'
import { getVisibleMvpMockProperties } from '../config/fixtureFilters'
import { normalizeListingDraftForStorage, normalizeListingForStorage } from '../config/listingCategories'
import { getDurableListingImages, getDurablePhotoMetadata } from '../config/photoMetadata'
import { canListingReceiveEnquiry, canTransitionListing } from '../config/listingLifecycle'
import { getApplicationStatus, isClosedStatus, isLandlordEngagedStatus } from '../config/rentalJourney'
import { isLaunchAccessEnabled, smartMatchAccess } from '../config/smartMatch'
import { getActiveListingAllowance, getEffectiveInterestAllowance, getEffectiveSmartMatchAllowance, getInterestAllowance, getSmartMatchAllowance } from '../config/entitlements'
import { normalizeViewingSlots, validateViewingChoice, validateViewingProposal } from '../config/viewingSlots'
import { mockConversations, mockEnquiries, mockProperties, mockTenants } from '../data/marketplace'
import { calculatePropertyMatch } from '../utils/calculatePropertyMatch'
import { getFutureViewingSlots } from '../utils/dateUtils'
import { getLocalDateKey } from '../utils/localDate'
import { hasDuplicateEnquiry, hasDuplicateRecentMessage, hasLandlordMessage, sanitizeMessageBody } from '../utils/messagingRules'
import { belongsToViewer } from '../utils/ownership'
import AppStateContext from './AppStateContext'
import useAccountProfile from './useAccountProfile'
import {
  getConversations,
  getDismissedPropertyIds,
  getEnquiries,
  getLandlordPlan,
  getLocalProperties,
  getSavedPropertyIds,
  getSmartMatchActivity,
  getTenantPlan,
  setConversations,
  setDismissedPropertyIds,
  setEnquiries,
  setLocalProperties,
  setSavedPropertyIds,
  setSmartMatchActivity,
} from '../utils/storage'

// ---- DEMO/MOCK compatibility fixture ids — NOT the real authenticated account ----------------
// These are stand-in ids for the still-frozen mock marketplace (properties, enquiries,
// conversations, saved-listing lists — all still localStorage-only, no listings/applications/
// messaging backend integration exists yet). Stage B (real profiles/tenant_profiles/
// landlord_profiles, see AccountProfileProvider) deliberately does NOT extend to this: the real
// authenticated identity is `useAuth().user.id` (realAccountId), and the real tenant_profiles/
// landlord_profiles rows for that identity now flow into this file's `tenantProfile`/
// `landlordProfile` below — but their `.id` field is intentionally forced back to these fixture
// constants (fixtureViewerId), never the real auth uuid. Every mock enquiry/conversation
// fixture (mockEnquiries, mockConversations, data/marketplace.js) is keyed to these exact
// fixture strings and has no relationship to real backend ids. Blending the two — e.g. making a
// real authenticated tenant "own" a fixture enquiry, or a real landlord "own" fixture listings
// by their real id — would misrepresent data that was never actually theirs.
// Remove these two constants, and every fixture id they touch, only once the domain that
// actually owns each identity's real data (listings in Stage C, applications/messaging/viewings
// in later stages) is backend-integrated and can supply a real id instead. Until then, no new
// code should add further dependencies on either constant.
const currentTenantId = 'tenant-local'
const currentOwnerId = 'owner-private-1'

// Fallback only for malformed/legacy fixture listing records with no ownerName of their own
// (see normalizeStoredProperty below) — never the real authenticated landlord's identity, which
// now comes from AccountProfileProvider's real landlord_profiles.display_name. Deliberately not
// a fabricated persona name (no more "Maeve Doyle" standing in for real account data).
const fixtureOwnerNameFallback = 'Private landlord'

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

const defaultPropertyImage =
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80'

function normalizeStoredProperty(property) {
  const isLegacyCreatedListing = property.source === 'created' && !property.ownerId
  const listingStatus = property.listingStatus || (isLegacyCreatedListing ? 'pending_verification' : 'published')
  const normalizedListing = listingStatus === 'draft' ? normalizeListingDraftForStorage(property) : normalizeListingForStorage(property)
  const { propertyType } = normalizedListing
  const viewingSlots = normalizeViewingSlots(property.viewingSlots)

  return {
    ...normalizedListing,
    ownerId: property.ownerId || (isLegacyCreatedListing ? currentOwnerId : undefined),
    ownerName: property.ownerName || property.landlordName || fixtureOwnerNameFallback,
    ownerType: property.ownerType || 'Private landlord',
    bedrooms: normalizedListing.bedrooms,
    bathrooms: normalizedListing.bathrooms,
    maxOccupants: normalizedListing.maxOccupants,
    furnished: normalizeFurnished(normalizedListing.furnished || 'Furnished'),
    parking: normalizeParking(normalizedListing.parking || 'No'),
    minStayMonths: listingStatus === 'draft' ? normalizedListing.minStayMonths : property.minStayMonths || 6,
    listingStatus,
    listingRules: property.listingRules || property.houseRules || [],
    features: property.features || property.amenities || [propertyType],
    images: getDurableListingImages(property.photoMetadata || property.images || [], defaultPropertyImage, normalizedListing.listingCategory),
    photoMetadata: getDurablePhotoMetadata(property.photoMetadata || property.images || [defaultPropertyImage], normalizedListing.listingCategory),
    viewingType: property.viewingType || 'In-person',
    updatedAt: property.updatedAt || property.createdAt || '',
    availabilityConfirmedAt: property.availabilityConfirmedAt || '',
    promotion: property.promotion || null,
    smokingAllowed: normalizeSmoking(normalizedListing.smokingAllowed || 'No'),
    petsAllowed: normalizePetPolicy(normalizedListing.petsAllowed || 'Not comfortable'),
    viewingSlots: viewingSlots.length ? viewingSlots : getFutureViewingSlots(),
    trust: property.trust || {
      emailVerified: false,
      phoneVerified: false,
      identityStatus: 'not_verified',
      landlordVerification: 'pending',
      propertyVerification: 'pending',
      internalDemoState: true,
    },
  }
}

function mergeLocalAndMockProperties(localProperties, mockProperties) {
  const localIds = new Set(localProperties.map((property) => property.id))
  return [...localProperties, ...getVisibleMvpMockProperties(mockProperties).filter((property) => !localIds.has(property.id))]
}

function normalizeStoredConversation(conversation) {
  return {
    ...conversation,
    propertyId: conversation.propertyId || conversation.roomId,
    archived: Boolean(conversation.archived),
    blockedBy: conversation.blockedBy || null,
    muted: Boolean(conversation.muted),
    reported: Boolean(conversation.reported),
    reportReason: conversation.reportReason || '',
    messages: (conversation.messages || []).map((message) => ({
      ...message,
      sender: message.sender === 'user' ? 'tenant' : message.sender === 'host' ? 'landlord' : message.sender,
    })),
  }
}

function normalizeStoredEnquiry(enquiry) {
  const viewing = enquiry.viewing || { status: 'none', proposedSlots: [], selectedSlot: '' }
  const proposedSlots = normalizeViewingSlots(viewing.proposedSlots)
  const selectedSlot = normalizeViewingSlots([viewing.selectedSlot])[0] || null
  const status = enquiry.status || 'sent'

  return {
    ...enquiry,
    status,
    viewing: {
      ...viewing,
      status: nextViewingStatusForApplication(status, viewing.status || 'none'),
      proposedSlots,
      selectedSlot,
    },
  }
}

function getStatusLabel(status) {
  return getApplicationStatus(status).label
}

function getListingStatusLabel(status) {
  const labels = {
    published: 'published',
    active: 'published',
    pending_verification: 'in review',
    draft: 'saved as draft',
    paused: 'paused',
    rejected: 'not approved',
    rented: 'marked as rented',
  }
  return labels[status] || 'updated'
}

function getPublicPropertyById(properties, propertyId) {
  return properties.find((item) => item.id === propertyId && canListingReceiveEnquiry(item))
}

function isBlockedThread(conversations, propertyId, tenantId) {
  return conversations.some((conversation) => conversation.propertyId === propertyId && conversation.tenantId === tenantId && conversation.blockedBy)
}

function canTenantSendMessage(conversation, enquiry) {
  if (!conversation || conversation.blockedBy) return false
  if (!enquiry) return true
  if (isClosedStatus(enquiry.status)) return false
  return hasLandlordMessage(conversation) || isLandlordEngagedStatus(enquiry.status)
}

export function AppStateProvider({ children }) {
  // The real account/role/profile layer (AccountProfileProvider, a parent of this provider in
  // App.jsx) is the only source of truth for WHO the user is and WHAT roles they've set up.
  // This provider consumes it only for two purposes that still legitimately belong to the mock
  // marketplace: (a) feeding the real tenant's real preferences into calculatePropertyMatch so
  // Rental Fit scoring against the still-mock listing set uses genuine data, not a fabricated
  // profile, and (b) knowing which mode ("tenant"/"landlord") the current viewer is in for the
  // mock enquiry/conversation filtering below. See the fixture-id comment above for why the
  // resulting tenantProfile/landlordProfile objects still carry a fixture `.id`.
  const { activeRole, tenantProfile: realTenantProfile, landlordProfile: realLandlordProfile } = useAccountProfile()
  const tenantProfile = useMemo(
    () => (realTenantProfile ? { ...realTenantProfile, id: currentTenantId } : null),
    [realTenantProfile],
  )
  const landlordProfile = useMemo(
    () => (realLandlordProfile ? { ...realLandlordProfile, id: currentOwnerId } : null),
    [realLandlordProfile],
  )
  const [tenantPlan] = useState(() => getTenantPlan())
  const [landlordPlan] = useState(() => getLandlordPlan())
  const [localProperties, setLocalPropertiesState] = useState(() => getLocalProperties())
  const [savedPropertyIds, setSavedPropertyIdsState] = useState(() => getSavedPropertyIds())
  const [dismissedPropertyIds, setDismissedPropertyIdsState] = useState(() => getDismissedPropertyIds())
  const [smartMatchActivity, setSmartMatchActivityState] = useState(() => getSmartMatchActivity())
  const [enquiries, setEnquiriesState] = useState(() => {
    const local = getEnquiries()
    return local.length ? local : mockEnquiries
  })
  const [conversations, setConversationsState] = useState(() => {
    const local = getConversations()
    return local.length ? local : mockConversations
  })
  const [propertyFilters, setPropertyFiltersState] = useState(defaultPropertyFilters)
  const [toast, setToast] = useState(null)
  const pendingMessageKeys = useRef(new Set())

  const tenants = useMemo(() => [tenantProfile, ...mockTenants].filter(Boolean), [tenantProfile])
  const baseProperties = useMemo(
    () => mergeLocalAndMockProperties(localProperties, mockProperties).map(normalizeStoredProperty),
    [localProperties],
  )
  const properties = useMemo(
    () => baseProperties.map((property) => ({ ...property, match: calculatePropertyMatch(tenantProfile, property) })),
    [baseProperties, tenantProfile],
  )

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
  const enrichedEnquiries = useMemo(
    () =>
      enquiries
        .map((storedEnquiry) => {
          const enquiry = normalizeStoredEnquiry(storedEnquiry)
          const property = properties.find((item) => item.id === enquiry.propertyId)
          const tenant = tenants.find((item) => item.id === enquiry.tenantId)
          return property && tenant
            ? { ...enquiry, property, tenant, statusLabel: getStatusLabel(enquiry.status), match: calculatePropertyMatch(tenant, property) }
            : null
        })
        .filter(Boolean),
    [enquiries, properties, tenants],
  )
  const enrichedConversations = useMemo(
    () =>
      conversations
        .map(normalizeStoredConversation)
        .filter((conversation) => !conversation.archived)
        .filter((conversation) => belongsToViewer(conversation, activeRole, currentTenantId, currentOwnerId))
        .map((conversation) => ({
          ...conversation,
          property: properties.find((property) => property.id === conversation.propertyId) || null,
          enquiry: enrichedEnquiries.find((enquiry) => enquiry.id === conversation.enquiryId) || null,
          tenant: tenants.find((tenant) => tenant.id === conversation.tenantId) || null,
        }))
        .filter((conversation) => conversation.property),
    [activeRole, conversations, enrichedEnquiries, properties, tenants],
  )
  const landlordProperties = useMemo(() => properties.filter((property) => property.ownerId === currentOwnerId), [properties])
  const landlordEnquiries = useMemo(() => enrichedEnquiries.filter((enquiry) => enquiry.ownerId === currentOwnerId), [enrichedEnquiries])
  const tenantEnquiries = useMemo(() => enrichedEnquiries.filter((enquiry) => enquiry.tenantId === currentTenantId), [enrichedEnquiries])
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

  const persistEnquiries = useCallback((next) => {
    setEnquiries(next)
    setEnquiriesState(next)
  }, [])
  const persistConversations = useCallback((next) => {
    setConversations(next)
    setConversationsState(next)
  }, [])
  const persistProperties = useCallback((next) => {
    setLocalProperties(next)
    setLocalPropertiesState(next)
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

  const getOrCreateConversationForEnquiry = useCallback(
    (enquiry) => {
      const existing = conversations.find((conversation) => conversation.enquiryId === enquiry.id)
      if (existing) {
        if (existing.archived) {
          persistConversations(conversations.map((conversation) => (conversation.id === existing.id ? { ...conversation, archived: false } : conversation)))
        }
        return existing.id
      }
      const property = properties.find((item) => item.id === enquiry.propertyId)
      const now = new Date().toISOString()
      const nextConversation = {
        id: `conversation-${enquiry.id}`,
        propertyId: enquiry.propertyId,
        enquiryId: enquiry.id,
        tenantId: enquiry.tenantId,
        ownerId: enquiry.ownerId,
        archived: false,
        unreadFor: activeRole === 'tenant' ? 'landlord' : 'tenant',
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: `message-${enquiry.id}-intro`,
            sender: 'tenant',
            body: enquiry.message || `I am interested in ${property?.title || 'this listing'}.`,
            createdAt: now,
          },
        ],
      }
      persistConversations([nextConversation, ...conversations])
      return nextConversation.id
    },
    [activeRole, conversations, persistConversations, properties],
  )

  const value = {
    currentTenantId,
    currentOwnerId,
    tenants,
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
    enquiries: enrichedEnquiries,
    tenantEnquiries,
    landlordEnquiries,
    conversations: enrichedConversations,
    allConversations: conversations.map(normalizeStoredConversation),
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
    createEnquiry(propertyId, message = '') {
      if (activeRole === 'landlord') {
        setToast({ type: 'info', message: 'Switch to tenant mode to send an enquiry.' })
        return null
      }
      const existing = enquiries.find((enquiry) => enquiry.propertyId === propertyId && enquiry.tenantId === currentTenantId)
      if (existing) return getOrCreateConversationForEnquiry(existing)
      if (isBlockedThread(conversations, propertyId, currentTenantId)) {
        setToast({ type: 'info', message: 'Messaging is blocked for this listing.' })
        return null
      }
      const property = getPublicPropertyById(properties, propertyId)
      if (!property) {
        setToast({ type: 'info', message: 'This listing is not accepting new enquiries.' })
        return null
      }
      const now = new Date().toISOString()
      const nextEnquiry = {
        id: `enquiry-${propertyId}-${Date.now()}`,
        propertyId,
        tenantId: currentTenantId,
        ownerId: property?.ownerId || currentOwnerId,
        status: 'sent',
        createdAt: now,
        updatedAt: now,
        message: sanitizeMessageBody(message) || `I am interested in ${property?.title || 'this property'}.`,
        viewing: { status: 'none', proposedSlots: [], selectedSlot: '' },
      }
      persistEnquiries([nextEnquiry, ...enquiries])
      setToast({ type: 'success', message: 'Enquiry sent.' })
      return getOrCreateConversationForEnquiry(nextEnquiry)
    },
    expressSmartMatchInterest(propertyId) {
      if (activeRole === 'landlord') {
        setToast({ type: 'info', message: 'Switch to tenant mode to send interest.' })
        return null
      }
      const existing = hasDuplicateEnquiry(enquiries, propertyId, currentTenantId)
        ? enquiries.find((enquiry) => enquiry.propertyId === propertyId && enquiry.tenantId === currentTenantId)
        : null
      let conversationId = existing ? getOrCreateConversationForEnquiry(existing) : null
      if (!conversationId) {
        if (todaysSmartMatchActivity.interests >= effectiveSmartMatchInterestAllowance) {
          setToast({ type: 'info', message: 'Daily interest limit reached. You can still browse and save listings.' })
          return null
        }
        if (todaysSmartMatchActivity.cards >= effectiveSmartMatchCardAllowance) {
          setToast({ type: 'info', message: 'Daily Smart Match card limit reached. Browse is still available.' })
          return null
        }
        if (isBlockedThread(conversations, propertyId, currentTenantId)) {
          setToast({ type: 'info', message: 'Messaging is blocked for this listing.' })
          return null
        }
        const property = getPublicPropertyById(properties, propertyId)
        if (!property) {
          setToast({ type: 'info', message: 'This listing is not accepting new enquiries.' })
          return null
        }
        const now = new Date().toISOString()
        const nextEnquiry = {
          id: `enquiry-${propertyId}-${Date.now()}`,
          propertyId,
          tenantId: currentTenantId,
          ownerId: property?.ownerId || currentOwnerId,
          status: 'sent',
          createdAt: now,
          updatedAt: now,
          message: `I am interested in ${property?.title || 'this property'}.`,
          viewing: { status: 'none', proposedSlots: [], selectedSlot: '' },
        }
        persistEnquiries([nextEnquiry, ...enquiries])
        conversationId = getOrCreateConversationForEnquiry(nextEnquiry)
      }
      if (dismissedPropertyIds.includes(propertyId)) return conversationId
      const next = dismissedPropertyIds.includes(propertyId) ? dismissedPropertyIds : [...dismissedPropertyIds, propertyId]
      setDismissedPropertyIds(next)
      setDismissedPropertyIdsState(next)
      markSmartMatchAction('interested')
      setToast({ type: 'success', message: 'Interest sent.' })
      return conversationId
    },
    openConversationForEnquiry(enquiryId) {
      const enquiry = enquiries.find((item) => item.id === enquiryId)
      if (!enquiry || !belongsToViewer(enquiry, activeRole, currentTenantId, currentOwnerId)) return null
      return getOrCreateConversationForEnquiry(enquiry)
    },
    markConversationRead(conversationId) {
      const reader = activeRole === 'landlord' ? 'landlord' : 'tenant'
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || target.unreadFor !== reader || !belongsToViewer(target, reader, currentTenantId, currentOwnerId)) return
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, unreadFor: null } : conversation)))
    },
    updateEnquiryStatus(enquiryId, status) {
      if (activeRole !== 'landlord') return
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      if (!target || !belongsToViewer(target, 'landlord', currentTenantId, currentOwnerId) || target.status === status || !canTransitionApplication(target.status, status)) return
      const now = new Date().toISOString()
      persistEnquiries(
        enquiries.map((enquiry) => {
          if (enquiry.id !== enquiryId || enquiry.status === status) return enquiry
          return {
            ...enquiry,
            status,
            updatedAt: now,
            viewing: {
              ...(enquiry.viewing || {}),
              status: nextViewingStatusForApplication(status, enquiry.viewing?.status),
              selectedSlot: status === 'viewing cancelled' ? null : enquiry.viewing?.selectedSlot,
            },
          }
        }),
      )
      setToast({ type: 'info', message: getStatusLabel(status) })
    },
    proposeViewing(enquiryId, slots) {
      const validation = validateViewingProposal(slots)
      if (activeRole !== 'landlord' || !validation.valid) {
        if (!validation.valid) setToast({ type: 'info', message: validation.reason })
        return
      }
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      if (!target || !belongsToViewer(target, 'landlord', currentTenantId, currentOwnerId) || !canTransitionApplication(target.status, 'viewing proposed')) return
      const currentSlots = normalizeViewingSlots(target.viewing?.proposedSlots)
      const sameSlots = currentSlots.length === validation.slots.length && currentSlots.every((slot, index) => slot.id === validation.slots[index].id)
      if (target.viewing?.status === 'viewing proposed' && sameSlots) return
      const now = new Date().toISOString()
      persistEnquiries(
        enquiries.map((enquiry) => {
          if (enquiry.id !== enquiryId) return enquiry
          const currentSlots = normalizeViewingSlots(enquiry.viewing?.proposedSlots)
          const sameSlots = currentSlots.length === validation.slots.length && currentSlots.every((slot, index) => slot.id === validation.slots[index].id)
          if (enquiry.viewing?.status === 'viewing proposed' && sameSlots) return enquiry
          return { ...enquiry, status: 'viewing proposed', updatedAt: now, viewing: { status: 'viewing proposed', proposedSlots: validation.slots, selectedSlot: null } }
        }),
      )
      setToast({ type: 'success', message: 'Viewing times proposed.' })
    },
    chooseViewing(enquiryId, slot) {
      if (activeRole !== 'tenant') return
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      const validation = validateViewingChoice(target?.viewing, slot)
      if (!target || !belongsToViewer(target, 'tenant', currentTenantId, currentOwnerId) || !canTransitionApplication(target.status, 'viewing confirmed') || !validation.valid) {
        if (!validation.valid) setToast({ type: 'info', message: validation.reason })
        return
      }
      const now = new Date().toISOString()
      persistEnquiries(
        enquiries.map((enquiry) => {
          if (enquiry.id !== enquiryId) return enquiry
          const choice = validateViewingChoice(enquiry.viewing, slot)
          if (!choice.valid) return enquiry
          return { ...enquiry, status: 'viewing confirmed', updatedAt: now, viewing: { ...enquiry.viewing, status: 'viewing confirmed', selectedSlot: choice.slot } }
        }),
      )
      setToast({ type: 'success', message: `Viewing confirmed for ${validation.slot.label}.` })
    },
    sendMessage(conversationId, body) {
      const trimmedBody = sanitizeMessageBody(body)
      if (!trimmedBody) return
      const now = new Date().toISOString()
      const nowTime = new Date(now).getTime()
      const sender = activeRole === 'landlord' ? 'landlord' : 'tenant'
      const messageKey = `${conversationId}:${sender}:${trimmedBody}`
      if (pendingMessageKeys.current.has(messageKey)) return
      pendingMessageKeys.current.add(messageKey)
      window.setTimeout(() => pendingMessageKeys.current.delete(messageKey), 5000)
      persistConversations(
        conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation
          if (!belongsToViewer(conversation, sender, currentTenantId, currentOwnerId)) return conversation
          const normalizedConversation = normalizeStoredConversation(conversation)
          const enquiry = enrichedEnquiries.find((item) => item.id === normalizedConversation.enquiryId)
          if (sender === 'tenant' && !canTenantSendMessage(normalizedConversation, enquiry)) {
            setToast({ type: 'info', message: 'Waiting for the landlord to reply.' })
            return conversation
          }
          if (normalizedConversation.blockedBy) {
            setToast({ type: 'info', message: 'Messaging is blocked for this conversation.' })
            return conversation
          }
          if (hasDuplicateRecentMessage(normalizedConversation, sender, trimmedBody, nowTime)) return conversation
          return {
            ...conversation,
            archived: false,
            updatedAt: now,
            unreadFor: sender === 'tenant' ? 'landlord' : 'tenant',
            messages: [...(conversation.messages || []), { id: `message-${nowTime}`, sender, body: trimmedBody, createdAt: now }],
          }
        }),
      )
    },
    archiveConversation(conversationId) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || target.archived || !belongsToViewer(target, activeRole, currentTenantId, currentOwnerId)) return
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, archived: true } : conversation)))
      setToast({ type: 'info', message: 'Conversation archived.', action: 'undo-archive', conversationId })
    },
    unarchiveConversation(conversationId) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || !target.archived || !belongsToViewer(target, activeRole, currentTenantId, currentOwnerId)) return
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, archived: false } : conversation)))
      setToast({ type: 'info', message: 'Conversation restored.' })
    },
    muteConversation(conversationId) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!belongsToViewer(target, activeRole, currentTenantId, currentOwnerId)) return
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, muted: !conversation.muted } : conversation)))
      setToast({ type: 'info', message: 'Conversation preference updated.' })
    },
    reportConversation(conversationId, reason) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || target.reported || !String(reason || '').trim() || !belongsToViewer(target, activeRole, currentTenantId, currentOwnerId)) return
      persistConversations(
        conversations.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, reported: true, reportReason: reason || 'Not specified' } : conversation,
        ),
      )
      setToast({ type: 'success', message: 'Report saved locally on this device.' })
    },
    blockConversation(conversationId) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || target.blockedBy || !belongsToViewer(target, activeRole, currentTenantId, currentOwnerId)) return
      const blockedBy = activeRole === 'landlord' ? 'landlord' : 'tenant'
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, blockedBy } : conversation)))
      setToast({ type: 'info', message: 'User blocked in this conversation.' })
    },
    reportListing(propertyId, reason) {
      const property = properties.find((item) => item.id === propertyId)
      if (!property || !String(reason || '').trim()) return
      const localExists = localProperties.some((item) => item.id === propertyId)
      const fixture = mockProperties.find((item) => item.id === propertyId)
      const reportedAt = new Date().toISOString()
      const update = (item) =>
        item.id === propertyId
          ? { ...item, localReport: { reason: String(reason).trim(), reportedAt } }
          : item
      const next = localExists
        ? localProperties.map(update)
        : fixture
          ? [{ ...fixture, localReport: { reason: String(reason).trim(), reportedAt } }, ...localProperties]
          : localProperties
      persistProperties(next)
      setToast({ type: 'success', message: 'Report saved locally on this device.' })
    },
    blockPropertyOwner(propertyId) {
      if (activeRole === 'landlord') return
      const property = properties.find((item) => item.id === propertyId)
      if (!property) return
      const now = new Date().toISOString()
      const existing = conversations.find((conversation) => conversation.propertyId === propertyId && conversation.tenantId === currentTenantId)
      if (existing) {
        persistConversations(conversations.map((conversation) => (conversation.id === existing.id ? { ...conversation, blockedBy: 'tenant' } : conversation)))
      } else {
        persistConversations([
          {
            id: `conversation-block-${propertyId}-${Date.now()}`,
            propertyId,
            enquiryId: null,
            tenantId: currentTenantId,
            ownerId: property.ownerId || currentOwnerId,
            archived: true,
            blockedBy: 'tenant',
            muted: false,
            reported: false,
            reportReason: '',
            unreadFor: null,
            createdAt: now,
            updatedAt: now,
            messages: [],
          },
          ...conversations,
        ])
      }
      setToast({ type: 'info', message: 'User blocked locally. Existing history is preserved.' })
    },
    addProperty(property) {
      if (activeRole !== 'landlord') return null
      const now = new Date().toISOString()
      const listingStatus = property.listingStatus || 'draft'
      const normalizedListing = listingStatus === 'draft' ? normalizeListingDraftForStorage(property) : normalizeListingForStorage(property)
      const nextProperty = {
        ...property,
        id: `property-local-${Date.now()}`,
        ownerId: currentOwnerId,
        ownerName: landlordProfile.displayName,
        ownerType: 'Private landlord',
        ...normalizedListing,
        rent: listingStatus === 'draft' ? property.rent : Number(property.rent),
        rentMonthly: listingStatus === 'draft' ? property.rent : Number(property.rent),
        deposit: listingStatus === 'draft' ? property.deposit : Number(property.deposit),
        createdAt: now,
        updatedAt: now,
        availabilityConfirmedAt: now,
        listingStatus,
        features: property.amenities?.slice(0, 4) || [],
        images: getDurableListingImages(property.photoMetadata || property.images || [], defaultPropertyImage, property.listingCategory),
        photoMetadata: getDurablePhotoMetadata(property.photoMetadata || property.images || [defaultPropertyImage], property.listingCategory),
        viewingSlots: normalizeViewingSlots(property.viewingSlots).length ? normalizeViewingSlots(property.viewingSlots) : getFutureViewingSlots(),
        trust: {
          emailVerified: Boolean(landlordProfile.trust?.emailVerified),
          phoneVerified: Boolean(landlordProfile.trust?.phoneVerified),
          identityStatus: landlordProfile.trust?.identityStatus || 'not_verified',
          landlordVerification: landlordProfile.trust?.landlordVerification || 'pending',
          propertyVerification: 'pending',
          internalDemoState: true,
        },
      }
      persistProperties([nextProperty, ...localProperties])
      setToast({ type: 'success', message: 'Property saved.' })
      return nextProperty.id
    },
    updateProperty(propertyId, patch) {
      if (activeRole !== 'landlord') return null
      const currentProperty = properties.find((property) => property.id === propertyId && property.ownerId === currentOwnerId)
      if (!currentProperty) return null
      const localExists = localProperties.some((property) => property.id === propertyId)
      const fixture = mockProperties.find((property) => property.id === propertyId)
      const requestedStatus = patch.listingStatus || currentProperty.listingStatus
      const listingStatus = canTransitionListing(currentProperty.listingStatus, requestedStatus) ? requestedStatus : currentProperty.listingStatus
      const normalizedListing = listingStatus === 'draft' ? normalizeListingDraftForStorage({ ...currentProperty, ...patch }) : normalizeListingForStorage({ ...currentProperty, ...patch })
      const normalizedPatch = {
        ...normalizedListing,
        listingStatus,
        furnished: patch.furnished ? normalizeFurnished(patch.furnished) : currentProperty.furnished,
        parking: patch.parking ? normalizeParking(patch.parking) : currentProperty.parking,
        smokingAllowed: patch.smokingAllowed ? normalizeSmoking(patch.smokingAllowed) : currentProperty.smokingAllowed,
        petsAllowed: patch.petsAllowed ? normalizePetPolicy(patch.petsAllowed) : currentProperty.petsAllowed,
        updatedAt: new Date().toISOString(),
        availabilityConfirmedAt: patch.availableFrom && patch.availableFrom !== currentProperty.availableFrom ? new Date().toISOString() : currentProperty.availabilityConfirmedAt,
      }
      const update = (property) => (property.id === propertyId ? { ...property, ...normalizedPatch } : property)
      const next = localExists
        ? localProperties.map(update)
        : fixture
          ? [{ ...fixture, ...normalizedPatch, ownerId: currentOwnerId }, ...localProperties]
          : localProperties
      persistProperties(next)
      setToast({ type: 'success', message: 'Listing updated.' })
      return propertyId
    },
    // Returns { ok: true } on success, or { ok: false, reason } when the operation could not be
    // completed — the caller must show that honestly (e.g. an upgrade explanation for
    // reason === 'allowance') rather than treating a blocked change as if it succeeded.
    updatePropertyStatus(propertyId, listingStatus) {
      if (activeRole !== 'landlord') return { ok: false, reason: 'not-landlord' }
      const allowedStatuses = ['published', 'pending_verification', 'draft', 'paused', 'rejected', 'rented']
      if (!allowedStatuses.includes(listingStatus)) return { ok: false, reason: 'invalid-status' }
      const currentProperty = properties.find((property) => property.id === propertyId && property.ownerId === currentOwnerId)
      if (!currentProperty || currentProperty.listingStatus === listingStatus) return { ok: false, reason: 'no-op' }
      if (!canTransitionListing(currentProperty.listingStatus, listingStatus)) return { ok: false, reason: 'invalid-transition' }

      // Frontend-only allowance check — this narrows what the UI offers, it is not a
      // server-enforced limit. A Free landlord already over the allowance from existing/demo
      // listings keeps those listings; only a *new* move into an active status is blocked.
      const activeStatuses = ['published', 'active']
      const enteringActive = activeStatuses.includes(listingStatus) && !activeStatuses.includes(currentProperty.listingStatus)
      if (enteringActive) {
        const allowance = getActiveListingAllowance(landlordPlan)
        const activeCount = landlordProperties.filter(
          (property) => property.id !== propertyId && activeStatuses.includes(property.listingStatus),
        ).length
        if (activeCount >= allowance) {
          return { ok: false, reason: 'allowance', allowance, activeCount }
        }
      }

      const localExists = localProperties.some((property) => property.id === propertyId)
      const fixture = mockProperties.find((property) => property.id === propertyId)
      const now = new Date().toISOString()
      const next = localExists
        ? localProperties.map((property) => (property.id === propertyId ? { ...property, listingStatus, updatedAt: now } : property))
        : fixture
          ? [{ ...fixture, listingStatus, updatedAt: now }, ...localProperties]
          : localProperties
      persistProperties(next)
      setToast({ type: 'info', message: `Listing ${getListingStatusLabel(listingStatus)}.` })
      return { ok: true }
    },
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
