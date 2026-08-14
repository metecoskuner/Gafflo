import { useCallback, useMemo, useRef, useState } from 'react'
import { canListingReceiveEnquiry, getApplicationStatus, isClosedStatus, isLandlordEngagedStatus } from '../config/rentalJourney'
import { smartMatchAccess } from '../config/smartMatch'
import { mockConversations, mockEnquiries, mockProperties, mockTenants } from '../data/marketplace'
import { calculatePropertyMatch } from '../utils/calculatePropertyMatch'
import { getFutureViewingSlots } from '../utils/dateUtils'
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
  notifications: 'Email and app',
}

const defaultLandlordProfile = {
  id: currentOwnerId,
  displayName: 'Maeve Doyle',
  landlordType: 'private_landlord',
  companyName: '',
  phone: '+353 87 000 0000',
  email: 'maeve@example.test',
  preferredContactMethod: 'In-app message',
  propertyCount: '2',
  verificationStatus: 'Landlord verification pending',
  trust: {
    emailVerified: true,
    phoneVerified: false,
    identityStatus: 'not_verified',
    landlordVerification: 'pending',
    internalDemoState: true,
  },
  bio: 'Private landlord managing a small number of Dublin homes.',
}

const defaultPropertyFilters = {
  priceMin: '',
  priceMax: '',
  location: 'Any',
  moveInBy: '',
  propertyType: 'Any',
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
  const propertyType = property.propertyType || property.roomType || 'Apartment'
  const viewingSlots = property.viewingSlots?.length && property.viewingSlots.every((slot) => String(slot).includes(','))
    ? property.viewingSlots
    : getFutureViewingSlots()

  return {
    ...property,
    ownerId: property.ownerId || (isLegacyCreatedListing ? currentOwnerId : undefined),
    ownerName: property.ownerName || property.landlordName || defaultLandlordProfile.displayName,
    ownerType: property.ownerType || 'Private landlord',
    propertyType,
    bedrooms: property.bedrooms ?? (property.roomType ? 1 : 0),
    bathrooms: property.bathrooms ?? 1,
    maxOccupants: property.maxOccupants ?? 1,
    furnished: property.furnished || 'Furnished',
    parking: property.parking || 'No',
    minStayMonths: property.minStayMonths || 6,
    listingStatus: property.listingStatus || (isLegacyCreatedListing ? 'pending_verification' : 'published'),
    listingRules: property.listingRules || property.houseRules || [],
    features: property.features || property.amenities || [propertyType],
    images: property.images?.length ? property.images : [defaultPropertyImage],
    viewingType: property.viewingType || 'In-person',
    viewingSlots,
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
  const hasAmbiguousSlots = (viewing.proposedSlots || []).some((slot) => !String(slot).includes(','))
  const proposedSlots = viewing.status === 'viewing proposed' && hasAmbiguousSlots
    ? getFutureViewingSlots()
    : viewing.proposedSlots || []
  const selectedSlot = viewing.selectedSlot && !String(viewing.selectedSlot).includes(',')
    ? proposedSlots[0] || viewing.selectedSlot
    : viewing.selectedSlot || ''

  return {
    ...enquiry,
    viewing: {
      ...viewing,
      proposedSlots,
      selectedSlot,
    },
  }
}

function propertyMatchesFilters(property, filters) {
  if (!['published', 'active'].includes(property.listingStatus)) return false
  if (filters.priceMin && property.rent < Number(filters.priceMin)) return false
  if (filters.priceMax && property.rent > Number(filters.priceMax)) return false
  if (filters.location !== 'Any') {
    const target = normalize(filters.location)
    if (normalize(property.city) !== target && normalize(property.area) !== target) return false
  }
  if (filters.moveInBy && new Date(property.availableFrom).getTime() > new Date(filters.moveInBy).getTime()) return false
  if (filters.propertyType !== 'Any' && normalize(property.propertyType) !== normalize(filters.propertyType)) return false
  if (filters.furnishedPreference !== 'Any' && normalize(property.furnished) !== normalize(filters.furnishedPreference)) return false
  if (filters.bedrooms !== 'Any' && property.bedrooms < Number(filters.bedrooms)) return false
  if (filters.pets === 'Required' && normalize(property.petsAllowed) !== 'comfortable') return false
  if (filters.parking === 'Required' && normalize(property.parking) === 'no') return false
  if (filters.leaseLength !== 'Any' && Number.parseInt(filters.leaseLength, 10) < Number(property.minStayMonths || 0)) return false
  return true
}

function getStatusLabel(status) {
  return getApplicationStatus(status).label
}

function getListingStatusLabel(status) {
  const labels = {
    published: 'published',
    active: 'published',
    pending_verification: 'sent for review',
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

function hasLandlordMessage(conversation) {
  return (conversation?.messages || []).some((message) => message.sender === 'landlord')
}

function canTenantSendMessage(conversation, enquiry) {
  if (!conversation || conversation.blockedBy) return false
  if (!enquiry) return true
  if (isClosedStatus(enquiry.status)) return false
  return hasLandlordMessage(conversation) || isLandlordEngagedStatus(enquiry.status)
}

function sanitizeMessageBody(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 1200)
}

function hasDuplicateRecentMessage(conversation, sender, body, now) {
  const lastMessage = (conversation.messages || [])[conversation.messages?.length - 1]
  if (!lastMessage || lastMessage.sender !== sender || lastMessage.body !== body) return false
  const lastSentAt = new Date(lastMessage.createdAt).getTime()
  if (Number.isNaN(lastSentAt)) return false
  return now - lastSentAt < 5000
}

function hasValidViewingSlots(slots) {
  return Array.isArray(slots) && slots.length > 0 && slots.length <= 3 && slots.every((slot) => String(slot || '').includes(','))
}

export function AppStateProvider({ children }) {
  const [account, setAccountState] = useState(() => getAccount())
  const [tenantProfile, setTenantProfileState] = useState(() => ({ ...defaultTenantProfile, ...getTenantProfile(), id: currentTenantId }))
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
    () => [...localProperties, ...mockProperties].map(normalizeStoredProperty),
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
  const savedProperties = useMemo(
    () => properties.filter((property) => savedPropertyIds.includes(property.id)),
    [properties, savedPropertyIds],
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
  const todayKey = new Date().toISOString().slice(0, 10)
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
    savedPropertyIds,
    dismissedPropertyIds,
    smartMatchUsage,
    toast,
    activeFilterCount: Object.entries(propertyFilters).filter(([, value]) => value && value !== 'Any').length,
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
      const next = { ...defaultTenantProfile, ...profile, id: currentTenantId }
      setTenantProfile(next)
      setTenantProfileState(next)
      setToast({ type: 'success', message: 'Tenant profile saved.' })
    },
    saveLandlordProfile(profile) {
      const next = { ...defaultLandlordProfile, ...profile, id: currentOwnerId }
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
      setToast({ type: 'info', message: 'Discovery reset.' })
    },
    createEnquiry(propertyId, message = '') {
      if (account?.role === 'landlord') {
        setToast({ type: 'info', message: 'Switch to tenant mode to send an enquiry.' })
        return null
      }
      const existing = enquiries.find((enquiry) => enquiry.propertyId === propertyId && enquiry.tenantId === currentTenantId)
      if (existing) return getOrCreateConversationForEnquiry(existing)
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
      const existing = enquiries.find((enquiry) => enquiry.propertyId === propertyId && enquiry.tenantId === currentTenantId)
      let conversationId = existing ? getOrCreateConversationForEnquiry(existing) : null
      if (!conversationId) {
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
    updateEnquiryStatus(enquiryId, status) {
      if (account?.role !== 'landlord') return
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      if (!target || target.status === status || isClosedStatus(target.status)) return
      const now = new Date().toISOString()
      persistEnquiries(
        enquiries.map((enquiry) => {
          if (enquiry.id !== enquiryId || enquiry.status === status) return enquiry
          return { ...enquiry, status, updatedAt: now }
        }),
      )
      setToast({ type: 'info', message: getStatusLabel(status) })
    },
    proposeViewing(enquiryId, slots) {
      if (account?.role !== 'landlord' || !hasValidViewingSlots(slots)) return
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      if (!target || isClosedStatus(target.status) || target.viewing?.status === 'viewing confirmed') return
      const currentSlots = target.viewing?.proposedSlots || []
      const sameSlots = currentSlots.length === slots.length && currentSlots.every((slot, index) => slot === slots[index])
      if (target.viewing?.status === 'viewing proposed' && sameSlots) return
      const now = new Date().toISOString()
      persistEnquiries(
        enquiries.map((enquiry) => {
          if (enquiry.id !== enquiryId) return enquiry
          const currentSlots = enquiry.viewing?.proposedSlots || []
          const sameSlots = currentSlots.length === slots.length && currentSlots.every((slot, index) => slot === slots[index])
          if (enquiry.viewing?.status === 'viewing proposed' && sameSlots) return enquiry
          return { ...enquiry, status: 'viewing proposed', updatedAt: now, viewing: { status: 'viewing proposed', proposedSlots: slots, selectedSlot: '' } }
        }),
      )
      setToast({ type: 'success', message: 'Viewing times proposed.' })
    },
    chooseViewing(enquiryId, slot) {
      if (account?.role !== 'tenant') return
      const target = enquiries.find((enquiry) => enquiry.id === enquiryId)
      const proposedSlots = target?.viewing?.proposedSlots || []
      if (!target || isClosedStatus(target.status) || target.viewing?.status === 'viewing confirmed' || !proposedSlots.includes(slot)) return
      const now = new Date().toISOString()
      persistEnquiries(
        enquiries.map((enquiry) => {
          if (enquiry.id !== enquiryId) return enquiry
          const proposedSlots = enquiry.viewing?.proposedSlots || []
          if (enquiry.viewing?.status === 'viewing confirmed') return enquiry
          if (!proposedSlots.includes(slot)) return enquiry
          return { ...enquiry, status: 'viewing confirmed', updatedAt: now, viewing: { ...enquiry.viewing, status: 'viewing confirmed', selectedSlot: slot } }
        }),
      )
      setToast({ type: 'success', message: `Viewing confirmed for ${slot}.` })
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
      setToast({ type: 'success', message: 'Report noted for review.' })
    },
    blockConversation(conversationId) {
      const target = conversations.find((conversation) => conversation.id === conversationId)
      if (!target || target.blockedBy) return
      const blockedBy = account?.role === 'landlord' ? 'landlord' : 'tenant'
      persistConversations(conversations.map((conversation) => (conversation.id === conversationId ? { ...conversation, blockedBy } : conversation)))
      setToast({ type: 'info', message: 'User blocked in this conversation.' })
    },
    addProperty(property) {
      if (account?.role !== 'landlord') return null
      const now = new Date().toISOString()
      const nextProperty = {
        ...property,
        id: `property-local-${Date.now()}`,
        ownerId: currentOwnerId,
        ownerName: landlordProfile.displayName,
        ownerType: landlordProfile.landlordType === 'agent' ? 'Letting agent' : 'Private landlord',
        rent: Number(property.rent),
        rentMonthly: Number(property.rent),
        deposit: Number(property.deposit),
        bedrooms: Number(property.bedrooms),
        bathrooms: Number(property.bathrooms),
        maxOccupants: Number(property.maxOccupants),
        createdAt: now,
        listingStatus: property.listingStatus || 'draft',
        features: property.amenities?.slice(0, 4) || [],
        images: property.images?.length ? property.images : ['https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80'],
        viewingSlots: property.viewingSlots?.length ? property.viewingSlots : getFutureViewingSlots(),
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
    updatePropertyStatus(propertyId, listingStatus) {
      if (account?.role !== 'landlord') return
      const allowedStatuses = ['published', 'pending_verification', 'draft', 'paused', 'rejected', 'rented']
      if (!allowedStatuses.includes(listingStatus)) return
      const currentProperty = properties.find((property) => property.id === propertyId && property.ownerId === currentOwnerId)
      if (!currentProperty || currentProperty.listingStatus === listingStatus) return
      const localExists = localProperties.some((property) => property.id === propertyId)
      const fixture = mockProperties.find((property) => property.id === propertyId)
      const next = localExists
        ? localProperties.map((property) => (property.id === propertyId ? { ...property, listingStatus } : property))
        : fixture
          ? [{ ...fixture, listingStatus }, ...localProperties]
          : localProperties
      persistProperties(next)
      setToast({ type: 'info', message: `Listing ${getListingStatusLabel(listingStatus)}.` })
    },
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
