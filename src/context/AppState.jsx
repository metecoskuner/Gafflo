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
    () =>
      roomsWithMatch.filter(
        (room) =>
          !normalizedSavedRoomIds.includes(room.id) && !normalizedReviewedRoomIds.includes(room.id),
      ),
    [normalizedReviewedRoomIds, normalizedSavedRoomIds, roomsWithMatch],
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
    toast,
    dismissToast,
    saveTenantProfile(profile) {
      setTenantProfile(profile)
      setTenantProfileState(profile)
      setToast({ type: 'success', message: 'Profile saved. Your room matches are ready.' })
    },
    saveRoom(roomId) {
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
      setToast({ type: 'success', message: 'Saved to your rooms.' })
    },
    passRoom(roomId) {
      const next = normalizedReviewedRoomIds.includes(roomId)
        ? normalizedReviewedRoomIds
        : [...normalizedReviewedRoomIds, roomId]
      setReviewedRoomIds(next)
      setReviewedRoomIdsState(next)
      setToast({ type: 'info', message: 'Passed.' })
    },
    removeSavedRoom(roomId) {
      const next = normalizedSavedRoomIds.filter((id) => id !== roomId)
      setSavedRoomIds(next)
      setSavedRoomIdsState(next)
      const reviewedNext = normalizedReviewedRoomIds.filter((id) => id !== roomId)
      setReviewedRoomIds(reviewedNext)
      setReviewedRoomIdsState(reviewedNext)
      setToast({ type: 'info', message: 'Removed from saved rooms.' })
    },
    startOver() {
      setReviewedRoomIds([])
      setReviewedRoomIdsState([])
      setToast({ type: 'info', message: 'Room stack reset.' })
    },
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
