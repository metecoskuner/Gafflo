import { useCallback, useMemo, useState } from 'react'
import rooms from '../data/rooms'
import { calculateRoomMatch } from '../utils/calculateRoomMatch'
import AppStateContext from './AppStateContext'
import {
  getSavedRoomIds,
  getTenantProfile,
  getReviewedRoomIds,
  setSavedRoomIds,
  setTenantProfile,
  setReviewedRoomIds,
} from '../utils/storage'

export function AppStateProvider({ children }) {
  const [tenantProfile, setTenantProfileState] = useState(() => getTenantProfile())
  const [savedRoomIds, setSavedRoomIdsState] = useState(() => getSavedRoomIds())
  const [reviewedRoomIds, setReviewedRoomIdsState] = useState(() => getReviewedRoomIds())
  const [toast, setToast] = useState(null)
  const [lastAction, setLastAction] = useState(null)
  const [priorityRoomId, setPriorityRoomId] = useState(null)

  const roomsWithMatch = useMemo(
    () =>
      rooms.map((room) => ({
        ...room,
        match: calculateRoomMatch(tenantProfile, room),
      })),
    [tenantProfile],
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

  const availableRooms = useMemo(
    () => {
      const filtered = roomsWithMatch.filter(
        (room) =>
          !normalizedSavedRoomIds.includes(room.id) && !normalizedReviewedRoomIds.includes(room.id),
      )

      if (!priorityRoomId) return filtered

      const priorityIndex = filtered.findIndex((room) => room.id === priorityRoomId)
      if (priorityIndex <= 0) return filtered

      const priorityRoom = filtered[priorityIndex]
      return [priorityRoom, ...filtered.slice(0, priorityIndex), ...filtered.slice(priorityIndex + 1)]
    },
    [normalizedReviewedRoomIds, normalizedSavedRoomIds, priorityRoomId, roomsWithMatch],
  )

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  const value = {
    rooms: roomsWithMatch,
    availableRooms,
    savedRooms,
    tenantProfile,
    savedRoomIds: normalizedSavedRoomIds,
    reviewedRoomIds: normalizedReviewedRoomIds,
    canUndo: Boolean(lastAction),
    toast,
    dismissToast,
    saveTenantProfile(profile) {
      setTenantProfile(profile)
      setTenantProfileState(profile)
      setToast({ type: 'success', message: 'Profile saved. Your room matches are ready.' })
    },
    saveRoom(roomId) {
      setPriorityRoomId(null)
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
