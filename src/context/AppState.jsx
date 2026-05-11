import { useCallback, useMemo, useState } from 'react'
import rooms from '../data/rooms'
import { calculateRoomMatch } from '../utils/calculateRoomMatch'
import AppStateContext from './AppStateContext'
import {
  getConversations,
  getCreatedListings,
  getSavedRoomIds,
  getOnboarding,
  getTenantProfile,
  getReviewedRoomIds,
  setConversations,
  setCreatedListings,
  setOnboarding,
  setSavedRoomIds,
  setTenantProfile,
  setReviewedRoomIds,
} from '../utils/storage'

const defaultRoomFilters = {
  priceMin: '',
  priceMax: '',
  location: 'Any',
  moveInBy: '',
  genderPreference: 'Any',
  occupationType: 'Any',
  smokingPreference: 'Any',
  petFriendliness: 'Any',
  lifestylePreference: 'Any',
}

function filtersFromOnboarding(onboarding) {
  if (!onboarding) return defaultRoomFilters

  return {
    ...defaultRoomFilters,
    priceMin: onboarding.budgetMin || '',
    priceMax: onboarding.budgetMax || '',
    location: onboarding.preferredArea || 'Any',
    moveInBy: onboarding.moveInDate || '',
    lifestylePreference: onboarding.lifestylePreference || 'Any',
  }
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function isOnOrBefore(dateValue, targetValue) {
  if (!dateValue || !targetValue) return true
  return new Date(dateValue).getTime() <= new Date(targetValue).getTime()
}

function countActiveFilters(filters) {
  return Object.entries(filters).filter(([, value]) => value && value !== 'Any').length
}

function roomMatchesFilters(room, filters) {
  const min = Number(filters.priceMin)
  const max = Number(filters.priceMax)

  if (filters.priceMin && room.rent < min) return false
  if (filters.priceMax && room.rent > max) return false

  if (filters.location !== 'Any') {
    const target = normalize(filters.location)
    if (normalize(room.city) !== target && normalize(room.area) !== target) return false
  }

  if (filters.moveInBy && !isOnOrBefore(room.availableFrom, filters.moveInBy)) return false

  if (filters.genderPreference !== 'Any') {
    const preference = normalize(room.genderPreference)
    const target = normalize(filters.genderPreference)
    if (preference !== 'any' && preference !== target) return false
  }

  if (filters.occupationType !== 'Any') {
    const occupations = room.occupationTypes || []
    if (!occupations.some((occupation) => normalize(occupation) === normalize(filters.occupationType))) return false
  }

  if (filters.smokingPreference !== 'Any') {
    if (normalize(filters.smokingPreference) === 'no smoking' && normalize(room.smokingAllowed) !== 'no') return false
    if (normalize(filters.smokingPreference) === 'outside ok' && normalize(room.smokingAllowed) === 'yes') return false
    if (normalize(filters.smokingPreference) === 'smoking friendly' && normalize(room.smokingAllowed) === 'no') return false
  }

  if (filters.petFriendliness !== 'Any' && normalize(room.petsAllowed) !== normalize(filters.petFriendliness)) return false
  if (filters.lifestylePreference !== 'Any' && normalize(room.lifestyle) !== normalize(filters.lifestylePreference)) return false

  return true
}

export function AppStateProvider({ children }) {
  const [onboarding, setOnboardingState] = useState(() => getOnboarding())
  const [conversations, setConversationsState] = useState(() => getConversations())
  const [createdListings, setCreatedListingsState] = useState(() => getCreatedListings())
  const [tenantProfile, setTenantProfileState] = useState(() => getTenantProfile())
  const [savedRoomIds, setSavedRoomIdsState] = useState(() => getSavedRoomIds())
  const [reviewedRoomIds, setReviewedRoomIdsState] = useState(() => getReviewedRoomIds())
  const [roomFilters, setRoomFiltersState] = useState(() => filtersFromOnboarding(getOnboarding()))
  const [toast, setToast] = useState(null)
  const [lastAction, setLastAction] = useState(null)
  const [priorityRoomId, setPriorityRoomId] = useState(null)

  const roomsWithMatch = useMemo(
    () =>
      [...createdListings, ...rooms].map((room) => ({
        ...room,
        match: calculateRoomMatch(tenantProfile, room),
      })),
    [createdListings, tenantProfile],
  )

  const validRoomIds = useMemo(() => new Set(roomsWithMatch.map((room) => room.id)), [roomsWithMatch])
  const normalizedSavedRoomIds = useMemo(
    () => [...new Set(savedRoomIds)].filter((id) => validRoomIds.has(id)),
    [savedRoomIds, validRoomIds],
  )
  const normalizedReviewedRoomIds = useMemo(
    () => [...new Set(reviewedRoomIds)].filter((id) => validRoomIds.has(id)),
    [reviewedRoomIds, validRoomIds],
  )

  const savedRooms = useMemo(
    () => roomsWithMatch.filter((room) => normalizedSavedRoomIds.includes(room.id)),
    [roomsWithMatch, normalizedSavedRoomIds],
  )

  const enrichedConversations = useMemo(
    () =>
      conversations
        .map((conversation) => ({
          ...conversation,
          room: roomsWithMatch.find((room) => room.id === conversation.roomId) || null,
        }))
        .filter((conversation) => conversation.room),
    [conversations, roomsWithMatch],
  )

  const discoveryRooms = useMemo(
    () => roomsWithMatch.filter((room) => roomMatchesFilters(room, roomFilters)),
    [roomsWithMatch, roomFilters],
  )

  const availableRooms = useMemo(
    () => {
      const filtered = discoveryRooms.filter(
        (room) =>
          !normalizedSavedRoomIds.includes(room.id) && !normalizedReviewedRoomIds.includes(room.id),
      )

      if (!priorityRoomId) return filtered

      const priorityIndex = filtered.findIndex((room) => room.id === priorityRoomId)
      if (priorityIndex <= 0) return filtered

      const priorityRoom = filtered[priorityIndex]
      return [priorityRoom, ...filtered.slice(0, priorityIndex), ...filtered.slice(priorityIndex + 1)]
    },
    [discoveryRooms, normalizedReviewedRoomIds, normalizedSavedRoomIds, priorityRoomId],
  )

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  const value = {
    rooms: roomsWithMatch,
    conversations: enrichedConversations,
    createdListings,
    discoveryRooms,
    availableRooms,
    savedRooms,
    onboarding,
    hasCompletedOnboarding: Boolean(onboarding?.completed),
    tenantProfile,
    roomFilters,
    activeFilterCount: countActiveFilters(roomFilters),
    savedRoomIds: normalizedSavedRoomIds,
    reviewedRoomIds: normalizedReviewedRoomIds,
    canUndo: Boolean(lastAction),
    toast,
    dismissToast,
    getOrCreateConversationForRoom(roomId) {
      const existing = conversations.find((conversation) => conversation.roomId === roomId)
      if (existing) return existing.id

      const room = roomsWithMatch.find((item) => item.id === roomId)
      const now = new Date().toISOString()
      const nextConversation = {
        id: `conversation-${roomId}`,
        roomId,
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: `message-${roomId}-welcome`,
            sender: 'host',
            body: room
              ? `Hi, thanks for your interest in ${room.title}. Send a quick note and I’ll get back to you.`
              : 'Hi, thanks for your interest. Send a quick note and I’ll get back to you.',
            createdAt: now,
          },
        ],
      }
      const next = [nextConversation, ...conversations]
      setConversations(next)
      setConversationsState(next)
      return nextConversation.id
    },
    sendMessage(conversationId, body) {
      const trimmedBody = body.trim()
      if (!trimmedBody) return

      const now = new Date().toISOString()
      const next = conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation
        return {
          ...conversation,
          updatedAt: now,
          messages: [
            ...conversation.messages,
            {
              id: `message-${conversationId}-${Date.now()}`,
              sender: 'user',
              body: trimmedBody,
              createdAt: now,
            },
          ],
        }
      })
      setConversations(next)
      setConversationsState(next)
    },
    addCreatedListing(listing) {
      const nextListing = {
        ...listing,
        id: `created-${Date.now()}`,
        source: 'created',
        createdAt: new Date().toISOString(),
      }
      const next = [nextListing, ...createdListings]
      setCreatedListings(next)
      setCreatedListingsState(next)
      setPriorityRoomId(nextListing.id)
      setToast({ type: 'success', message: 'Listing created and added to discovery.' })
      return nextListing.id
    },
    setRoomFilters(nextFilters) {
      setPriorityRoomId(null)
      setRoomFiltersState((current) => ({ ...current, ...nextFilters }))
    },
    resetRoomFilters() {
      setPriorityRoomId(null)
      setRoomFiltersState(defaultRoomFilters)
    },
    completeOnboarding(payload) {
      const nextOnboarding = {
        ...payload,
        completed: true,
        completedAt: new Date().toISOString(),
      }
      setOnboarding(nextOnboarding)
      setOnboardingState(nextOnboarding)
      setPriorityRoomId(null)
      setRoomFiltersState(filtersFromOnboarding(nextOnboarding))
      setToast({ type: 'success', message: 'Discovery personalized.' })
    },
    skipOnboarding() {
      const nextOnboarding = {
        completed: true,
        skipped: true,
        completedAt: new Date().toISOString(),
      }
      setOnboarding(nextOnboarding)
      setOnboardingState(nextOnboarding)
    },
    saveTenantProfile(profile) {
      setTenantProfile(profile)
      setTenantProfileState(profile)
      setToast({ type: 'success', message: 'Profile saved. Your room matches are ready.' })
    },
    saveRoom(roomId) {
      setPriorityRoomId(null)
      if (normalizedSavedRoomIds.includes(roomId)) {
        setToast({ type: 'info', message: 'Already in your saved rooms.' })
        return
      }

      const next = normalizedSavedRoomIds.includes(roomId)
        ? normalizedSavedRoomIds
        : [...normalizedSavedRoomIds, roomId]
      setSavedRoomIds(next)
      setSavedRoomIdsState(next)
      const reviewed = normalizedReviewedRoomIds.includes(roomId)
        ? normalizedReviewedRoomIds
        : [...normalizedReviewedRoomIds, roomId]
      setReviewedRoomIds(reviewed)
      setReviewedRoomIdsState(reviewed)
      setLastAction({ roomId, action: 'save' })
      setToast({ type: 'success', message: 'Saved to your rooms.' })
    },
    passRoom(roomId) {
      setPriorityRoomId(null)
      const next = normalizedReviewedRoomIds.includes(roomId)
        ? normalizedReviewedRoomIds
        : [...normalizedReviewedRoomIds, roomId]
      setReviewedRoomIds(next)
      setReviewedRoomIdsState(next)
      setLastAction({ roomId, action: 'pass' })
      setToast({ type: 'info', message: 'Passed.' })
    },
    removeSavedRoom(roomId) {
      const next = normalizedSavedRoomIds.filter((id) => id !== roomId)
      setSavedRoomIds(next)
      setSavedRoomIdsState(next)
      const reviewedNext = normalizedReviewedRoomIds.filter((id) => id !== roomId)
      setReviewedRoomIds(reviewedNext)
      setReviewedRoomIdsState(reviewedNext)
      setPriorityRoomId(roomId)
      setToast({ type: 'info', message: 'Removed from saved rooms.' })
    },
    startOver() {
      setPriorityRoomId(null)
      setLastAction(null)
      setReviewedRoomIds([])
      setReviewedRoomIdsState([])
      setToast({ type: 'info', message: 'Room stack reset.' })
    },
    undoLastAction() {
      if (!lastAction) return false

      if (lastAction.action === 'save') {
        const nextSaved = normalizedSavedRoomIds.filter((id) => id !== lastAction.roomId)
        setSavedRoomIds(nextSaved)
        setSavedRoomIdsState(nextSaved)
      }

      const nextReviewed = normalizedReviewedRoomIds.filter((id) => id !== lastAction.roomId)
      setReviewedRoomIds(nextReviewed)
      setReviewedRoomIdsState(nextReviewed)
      setPriorityRoomId(lastAction.roomId)
      setLastAction(null)
      setToast({ type: 'info', message: 'Last action undone.' })
      return true
    },
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
