import { useCallback, useMemo, useRef, useState } from 'react'
import { canTransitionApplication, nextViewingStatusForApplication } from '../config/applicationTransitions'
import { ANY_VALUE } from '../config/domainOptions'
import { propertyMatchesFilters } from '../config/discoveryFilters'
import { canListingReceiveEnquiry } from '../config/listingLifecycle'
import { getApplicationStatus, isClosedStatus, isLandlordEngagedStatus } from '../config/rentalJourney'
import { isLaunchAccessEnabled, smartMatchAccess } from '../config/smartMatch'
import { getEffectiveInterestAllowance, getEffectiveSmartMatchAllowance, getInterestAllowance, getSmartMatchAllowance } from '../config/entitlements'
import { normalizeViewingSlots, validateViewingChoice, validateViewingProposal } from '../config/viewingSlots'
import { mockConversations, mockEnquiries, mockTenants } from '../data/marketplace'
import { calculatePropertyMatch } from '../utils/calculatePropertyMatch'
import { getLocalDateKey } from '../utils/localDate'
import { hasDuplicateEnquiry, hasDuplicateRecentMessage, hasLandlordMessage, sanitizeMessageBody } from '../utils/messagingRules'
import { belongsToViewer } from '../utils/ownership'
import AppStateContext from './AppStateContext'
import useAccountProfile from './useAccountProfile'
import useListings from './useListings'
import {
  getConversations,
  getDismissedPropertyIds,
  getEnquiries,
  getLandlordPlan,
  getPropertyReports,
  getSavedPropertyIds,
  getSmartMatchActivity,
  getTenantPlan,
  setConversations,
  setDismissedPropertyIds,
  setEnquiries,
  setPropertyReports,
  setSavedPropertyIds,
  setSmartMatchActivity,
} from '../utils/storage'

// ---- DEMO/MOCK compatibility fixture ids — NOT the real authenticated account ----------------
// Stage C retired gafflo.properties and every mock-listing fallback: real listing ownership is
// now always the real owner_id/auth.uid() (see ListingsProvider, config/listingAdapter.js), and
// landlordProperties/properties below never fall back to currentOwnerId. These two constants
// survive only for the domains Stage C explicitly does not integrate — enquiries, conversations,
// messaging — which are still localStorage-only mock fixtures (mockEnquiries, mockConversations,
// data/marketplace.js) keyed to these exact strings, with no relationship to real backend ids.
// Remove them once Applications/Messaging (a later stage) makes enquiry/conversation ownership a
// real backend fact the way listing ownership now is.
const currentTenantId = 'tenant-local'
const currentOwnerId = 'owner-private-1'

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
  // Real Supabase source of truth for listings/photos (Stage C) — see ListingsProvider. This
  // provider only reads from it and composes it with the still-mock enquiry/conversation
  // domains below; every listing write (create/edit/lifecycle/photos) goes through
  // useListings() directly from CreateListing.jsx/LandlordProperties.jsx, never through here.
  const { myListings, publicListings } = useListings()
  const [propertyReports, setPropertyReportsState] = useState(() => getPropertyReports())
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
  // Always the real authenticated user's own listings (get_my_listings(), RLS-scoped server-side
  // to auth.uid()) — never the fixture currentOwnerId. See the Stage C final report's mock-id
  // audit for exactly which ids still use the fixture (only enquiries/conversations, below).
  const landlordProperties = useMemo(
    () => myListings.map((property) => ({ ...property, localReport: propertyReports[property.id] || null, match: calculatePropertyMatch(tenantProfile, property) })),
    [myListings, propertyReports, tenantProfile],
  )
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
    // Listing create/edit/lifecycle/photo writes go directly through useListings() from
    // CreateListing.jsx and LandlordProperties.jsx now (Stage C) — this context stays a
    // read-composition layer for listings, matching ListingsProvider's own "centralize listing
    // data access" role instead of duplicating a second write surface here.
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
