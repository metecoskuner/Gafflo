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

  const savedRooms = useMemo(
    () => roomsWithMatch.filter((room) => savedRoomIds.includes(room.id)),
    [roomsWithMatch, savedRoomIds],
  )

  const availableRooms = useMemo(
    () => roomsWithMatch.filter((room) => !reviewedRoomIds.includes(room.id)),
    [reviewedRoomIds, roomsWithMatch],
  )

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  const value = {
    rooms: roomsWithMatch,
    availableRooms,
    savedRooms,
    tenantProfile,
    savedRoomIds,
    reviewedRoomIds,
    toast,
    dismissToast,
    saveTenantProfile(profile) {
      setTenantProfile(profile)
      setTenantProfileState(profile)
      setToast({ type: 'success', message: 'Profile saved. Your room matches are ready.' })
    },
    saveRoom(roomId) {
      const next = savedRoomIds.includes(roomId) ? savedRoomIds : [...savedRoomIds, roomId]
      setSavedRoomIds(next)
      setSavedRoomIdsState(next)
      const reviewed = reviewedRoomIds.includes(roomId) ? reviewedRoomIds : [...reviewedRoomIds, roomId]
      setReviewedRoomIds(reviewed)
      setReviewedRoomIdsState(reviewed)
      setToast({ type: 'success', message: 'Saved to your rooms.' })
    },
    passRoom(roomId) {
      const next = reviewedRoomIds.includes(roomId) ? reviewedRoomIds : [...reviewedRoomIds, roomId]
      setReviewedRoomIds(next)
      setReviewedRoomIdsState(next)
      setToast({ type: 'info', message: 'Passed.' })
    },
    removeSavedRoom(roomId) {
      const next = savedRoomIds.filter((id) => id !== roomId)
      setSavedRoomIds(next)
      setSavedRoomIdsState(next)
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
