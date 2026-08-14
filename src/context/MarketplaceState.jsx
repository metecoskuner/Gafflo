import { useCallback, useMemo, useRef, useState } from 'react'
import { canTransitionApplication, nextViewingStatusForApplication } from '../config/applicationTransitions'
import {
  ANY_VALUE,
  normalizeFurnished,
  normalizeLeaseMonths,
  normalizeParking,
  normalizePet,
  normalizePetPolicy,
  normalizeSmoking,
} from '../config/domainOptions'
import { cityOptions, normalizePreferredAreas } from '../config/locationOptions'
import { propertyMatchesFilters } from '../config/discoveryFilters'
import { getVisibleMvpMockProperties } from '../config/fixtureFilters'
import { LISTING_CATEGORIES, normalizeListingDraftForStorage, normalizeListingForStorage } from '../config/listingCategories'
import { getDurableListingImages, getDurablePhotoMetadata } from '../config/photoMetadata'
import { canListingReceiveEnquiry, canTransitionListing } from '../config/listingLifecycle'
import { getApplicationStatus, isClosedStatus, isLandlordEngagedStatus } from '../config/rentalJourney'
import { smartMatchAccess } from '../config/smartMatch'
import { normalizeViewingSlots, validateViewingChoice, validateViewingProposal } from '../config/viewingSlots'
import { mockConversations, mockEnquiries, mockProperties, mockTenants } from '../data/marketplace'
import { calculatePropertyMatch } from '../utils/calculatePropertyMatch'
import { getFutureViewingSlots } from '../utils/dateUtils'
import { getLocalDateKey } from '../utils/localDate'
import { hasDuplicateEnquiry, hasDuplicateRecentMessage, sanitizeMessageBody } from '../utils/messagingRules'
import AppStateContext from './AppStateContext'
import {
  getAccount,
  getConversations,
  getDismissedPropertyIds,
  getEnquiries,
  getLandlordProfile,
  getLocalProperties,
  getSavedPropertyIds,
  getSmartMatchActivity,
  getTenantProfile,
  setAccount,
  setConversations,
  setDismissedPropertyIds,
  setEnquiries,
  setLandlordProfile,
  setLocalProperties,
  setSavedPropertyIds,
  setSmartMatchActivity,
  setTenantProfile,
} from '../utils/storage'

const currentTenantId = 'tenant-local'
const currentOwnerId = 'owner-private-1'

const defaultTenantProfile = {
  id: currentTenantId,
  name: '',
  targetCity: 'Dublin',
  preferredAreas: [],
  budgetMin: 1200,
  budgetMax: 2200,
  moveInDate: '',
  leaseLength: '12 months',
  householdSize: 1,
  employmentStatus: 'Full-time',
  studentStatus: 'No',
  pets: 'No pets',
  smoking: 'No',
  furnishedPreference: 'Any',
  parkingNeeded: 'No',
  referencesReady: false,
  incomeReady: false,
  idReady: false,
  bio: '',
  lookingFor: 'any',
  privateBathroomPreferred: false,
  billsIncludedPreferred: false,
  ownerOccupiedAcceptable: true,
  applyingAsCouple: false,
  coupleRequirement: false,
}

const defaultLandlordProfile = {
  id: currentOwnerId,
  displayName: 'Maeve Doyle',
  landlordType: 'private_landlord',
  companyName: '',
  phone: '+353 87 000 0000',
  email: 'maeve@example.test',
  preferredContactMethod: 'In-app message',
  verificationStatus: 'Landlord verification pending',
  trust: {
    emailVerified: true,
    phoneVerified: false,
    identityStatus: 'not_verified',
    landlordVerification: 'pending',
    internalDemoState: true,
  },
  bio: 'Private landlord managing a small number of rental places.',
}

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

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeStoredProperty(property) {
  const isLegacyCreatedListing = property.source === 'created' && !property.ownerId
  const listingStatus = property.listingStatus || (isLegacyCreatedListing ? 'pending_verification' : 'published')
  const normalizedListing = listingStatus === 'draft' ? normalizeListingDraftForStorage(property) : normalizeListingForStorage(property)
  const { propertyType } = normalizedListing
  const viewingSlots = normalizeViewingSlots(property.viewingSlots)

  return {
    ...normalizedListing,
    ownerId: property.ownerId || (isLegacyCreatedListing ? currentOwnerId : undefined),
    ownerName: property.ownerName || property.landlordName || defaultLandlordProfile.displayName,
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

function hasLandlordMessage(conversation) {
  return (conversation?.messages || []).some((message) => message.sender === 'landlord')
}

function canTenantSendMessage(conversation, enquiry) {
  if (!conversation || conversation.blockedBy) return false
  if (!enquiry) return true
  if (isClosedStatus(enquiry.status)) return false
  return hasLandlordMessage(conversation) || isLandlordEngagedStatus(enquiry.status)
}

export function AppStateProvider({ children }) {
  const [account, setAccountState] = useState(() => getAccount())
  const [tenantProfile, setTenantProfileState] = useState(() => normalizeTenantProfile({ ...defaultTenantProfile, ...getTenantProfile(), id: currentTenantId }))
  const [landlordProfile, setLandlordProfileState] = useState(() => ({ ...defaultLandlordProfile, ...getLandlordProfile(), id: currentOwnerId }))
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

  const tenants = useMemo(() => [tenantProfile, ...mockTenants], [tenantProfile])
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
        .map((conversation) => ({
          ...conversation,
          property: properties.find((property) => property.id === conversation.propertyId) || null,
          enquiry: enrichedEnquiries.find((enquiry) => enquiry.id === conversation.enquiryId) || null,
          tenant: tenants.find((tenant) => tenant.id === conversation.tenantId) || null,
        }))
        .filter((conversation) => conversation.property),
    [conversations, enrichedEnquiries, properties, tenants],
  )
  const landlordProperties = useMemo(() => properties.filter((property) => property.ownerId === currentOwnerId), [properties])
  const landlordEnquiries = useMemo(() => enrichedEnquiries.filter((enquiry) => enquiry.ownerId === currentOwnerId), [enrichedEnquiries])
  const tenantEnquiries = useMemo(() => enrichedEnquiries.filter((enquiry) => enquiry.tenantId === currentTenantId), [enrichedEnquiries])
  const todayKey = getLocalDateKey()
  const todaysSmartMatchActivity = smartMatchActivity[todayKey] || { cards: 0, interests: 0 }
  const smartMatchUsage = {
    date: todayKey,
    cardsUsed: todaysSmartMatchActivity.cards || 0,
    interestsUsed: todaysSmartMatchActivity.interests || 0,
    cardsRemaining: Math.max(0, smartMatchAccess.dailyCardAllowance - (todaysSmartMatchActivity.cards || 0)),
    interestsRemaining: Math.max(0, smartMatchAccess.dailyInterestAllowance - (todaysSmartMatchActivity.interests || 0)),
    access: smartMatchAccess,
    isLaunchFree: smartMatchAccess.launchMode,
  }

  const persistAccount = useCallback((nextAccount) => {
    setAccount(nextAccount)
    setAccountState(nextAccount)
  }, [])
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
        unreadFor: account?.role === 'tenant' ? 'landlord' : 'tenant',
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
    [account?.role, conversations, persistConversations, properties],
  )

  const value = {
    account,
    currentTenantId,
    currentOwnerId,
    role: account?.role || null,
    landlordType: account?.landlordType || null,
    hasSelectedRole: Boolean(account?.role),
    tenants,
    tenantProfile,
    landlordProfile,
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
    selectRole(role, landlordType = null) {
      persistAccount({ role, landlordType, completed: true })
      setToast({ type: 'success', message: role === 'tenant' ? 'Tenant mode selected.' : 'Landlord mode selected.' })
    },
    switchRole(role, landlordType = null) {
      persistAccount({ role, landlordType, completed: true })
      setToast({ type: 'info', message: `Switched to ${role === 'tenant' ? 'tenant' : 'landlord'} mode.` })
    },
    saveTenantProfile(profile) {
      const next = {
        ...defaultTenantProfile,
        ...profile,
        id: currentTenantId,
        leaseLength: normalizeLeaseMonths(profile.leaseLength, 12),
        furnishedPreference: [ANY_VALUE, 'Any'].includes(profile.furnishedPreference) ? ANY_VALUE : normalizeFurnished(profile.furnishedPreference),
        pets: normalizePet(profile.pets),
        smoking: normalizeSmoking(profile.smoking),
        parkingNeeded: normalize(profile.parkingNeeded) === 'yes' ? 'yes' : 'no',
        targetCity: cityOptions.includes(profile.targetCity) ? profile.targetCity : defaultTenantProfile.targetCity,
        preferredAreas: normalizePreferredAreas(profile.preferredAreas, profile.targetCity),
        lookingFor: ['any', LISTING_CATEGORIES.ENTIRE_PROPERTY, 'room'].includes(profile.lookingFor) ? profile.lookingFor : 'any',
        privateBathroomPreferred: Boolean(profile.privateBathroomPreferred),
        billsIncludedPreferred: Boolean(profile.billsIncludedPreferred),
        ownerOccupiedAcceptable: profile.ownerOccupiedAcceptable !== false,
        applyingAsCouple: isApplyingAsCouple(profile) && Number(profile.householdSize) >= 2,
        coupleRequirement: isApplyingAsCouple(profile) && Number(profile.householdSize) >= 2,
        notifications: undefined,
      }
      setTenantProfile(next)
      setTenantProfileState(next)
      setToast({ type: 'success', message: 'Tenant profile saved.' })
    },
    saveLandlordProfile(profile) {
      const next = { ...defaultLandlordProfile, ...profile, id: currentOwnerId, propertyCount: undefined }
      setLandlordProfile(next)
      setLandlordProfileState(next)
      setToast({ type: 'success', message: 'Landlord profile saved.' })
    },
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
      if (!smartMatchAccess.launchMode && todaysSmartMatchActivity.cards >= smartMatchAccess.dailyCardAllowance) {
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
      if (account?.role === 'landlord') {
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
      if (account?.role === 'landlord') {
        setToast({ type: 'info', message: 'Switch to tenant mode to send interest.' })
        return null
      }
      const existing = hasDuplicateEnquiry(enquiries, propertyId, currentTenantId)
        ? enquiries.find((enquiry) => enquiry.propertyId === propertyId && enquiry.tenantId === currentTenantId)
        : null
      let conversationId = existing ? getOrCreateConversationForEnquiry(existing) : null
      if (!conversationId) {
        if (!smartMatchAccess.launchMode && todaysSmartMatchActivity.interests >= smartMatchAccess.dailyInterestAllowance) {
          setToast({ type: 'info', message: 'Daily interest limit reached. You can still browse and save listings.' })
          return null
        }
        if (!smartMatchAccess.launchMode && todaysSmartMatchActivity.cards >= smartMatchAccess.dailyCardAllowance) {
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
      return enquiry ? getOrCreateConversationForEnquiry(enquiry) : null
    },
    markConversationRead(conversationId) {
      const reader = account?.role === 'landlord' ? 'landlord' : 'tenant'
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || target.unreadFor !== reader) return
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, unreadFor: null } : conversation)))
    },
    updateEnquiryStatus(enquiryId, status) {
      if (account?.role !== 'landlord') return
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      if (!target || target.status === status || !canTransitionApplication(target.status, status)) return
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
      if (account?.role !== 'landlord' || !validation.valid) {
        if (!validation.valid) setToast({ type: 'info', message: validation.reason })
        return
      }
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      if (!target || !canTransitionApplication(target.status, 'viewing proposed')) return
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
      if (account?.role !== 'tenant') return
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      const validation = validateViewingChoice(target?.viewing, slot)
      if (!target || !canTransitionApplication(target.status, 'viewing confirmed') || !validation.valid) {
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
      const sender = account?.role === 'landlord' ? 'landlord' : 'tenant'
      const messageKey = `${conversationId}:${sender}:${trimmedBody}`
      if (pendingMessageKeys.current.has(messageKey)) return
      pendingMessageKeys.current.add(messageKey)
      window.setTimeout(() => pendingMessageKeys.current.delete(messageKey), 5000)
      persistConversations(
        conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation
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
          if (hasDuplicateRecentMessage(conversation, sender, trimmedBody, nowTime)) return conversation
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
      if (!target || target.archived) return
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, archived: true } : conversation)))
      setToast({ type: 'info', message: 'Conversation archived.', action: 'undo-archive', conversationId })
    },
    unarchiveConversation(conversationId) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || !target.archived) return
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, archived: false } : conversation)))
      setToast({ type: 'info', message: 'Conversation restored.' })
    },
    muteConversation(conversationId) {
      if (!conversations.some((conversation) => conversation.id === conversationId)) return
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, muted: !conversation.muted } : conversation)))
      setToast({ type: 'info', message: 'Conversation preference updated.' })
    },
    reportConversation(conversationId, reason) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || target.reported || !String(reason || '').trim()) return
      persistConversations(
        conversations.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, reported: true, reportReason: reason || 'Not specified' } : conversation,
        ),
      )
      setToast({ type: 'success', message: 'Report saved locally on this device.' })
    },
    blockConversation(conversationId) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || target.blockedBy) return
      const blockedBy = account?.role === 'landlord' ? 'landlord' : 'tenant'
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
      if (account?.role === 'landlord') return
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
      if (account?.role !== 'landlord') return null
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
      if (account?.role !== 'landlord') return null
      const currentProperty = properties.find((property) => property.id === propertyId && property.ownerId === currentOwnerId)
      if (!currentProperty) return null
      const localExists = localProperties.some((property) => property.id === propertyId)
      const fixture = mockProperties.find((property) => property.id === propertyId)
      const listingStatus = patch.listingStatus || currentProperty.listingStatus
      const normalizedListing = listingStatus === 'draft' ? normalizeListingDraftForStorage({ ...currentProperty, ...patch }) : normalizeListingForStorage({ ...currentProperty, ...patch })
      const normalizedPatch = {
        ...normalizedListing,
        furnished: patch.furnished ? normalizeFurnished(patch.furnished) : currentProperty.furnished,
        parking: patch.parking ? normalizeParking(patch.parking) : currentProperty.parking,
        smokingAllowed: patch.smokingAllowed ? normalizeSmoking(patch.smokingAllowed) : currentProperty.smokingAllowed,
        petsAllowed: patch.petsAllowed ? normalizePetPolicy(patch.petsAllowed) : currentProperty.petsAllowed,
        updatedAt: new Date().toISOString(),
        availabilityConfirmedAt: patch.availableFrom && patch.availableFrom === currentProperty.availableFrom ? new Date().toISOString() : currentProperty.availabilityConfirmedAt,
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
    updatePropertyStatus(propertyId, listingStatus) {
      if (account?.role !== 'landlord') return
      const allowedStatuses = ['published', 'pending_verification', 'draft', 'paused', 'rejected', 'rented']
      if (!allowedStatuses.includes(listingStatus)) return
      const currentProperty = properties.find((property) => property.id === propertyId && property.ownerId === currentOwnerId)
      if (!currentProperty || currentProperty.listingStatus === listingStatus) return
      if (!canTransitionListing(currentProperty.listingStatus, listingStatus)) return
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
    },
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

function isApplyingAsCouple(profile = {}) {
  return profile.applyingAsCouple === true || (profile.applyingAsCouple === undefined && profile.coupleRequirement === true)
}

function normalizeTenantProfile(profile = {}) {
  const applyingAsCouple = isApplyingAsCouple(profile) && Number(profile.householdSize || 1) >= 2
  return {
    ...profile,
    applyingAsCouple,
    coupleRequirement: applyingAsCouple,
  }
}
