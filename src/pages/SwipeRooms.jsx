import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import RoomCard from '../components/RoomCard'
import SwipeActions from '../components/SwipeActions'
import useAppState from '../context/useAppState'

export default function SwipeRooms() {
  const navigate = useNavigate()
  const location = useLocation()
  const { availableRooms, passRoom, saveRoom, savedRoomIds, startOver, tenantProfile, toast, dismissToast } = useAppState()
  const [viewedCount, setViewedCount] = useState(0)

  const currentRoom = availableRooms[0]

  if (!currentRoom) {
    return (
      <EmptyState
        eyebrow="Room stack complete"
        title="You’ve reviewed all rooms for now."
        description="Reset the room stack to swipe again, or jump into your saved shortlist."
        actions={
          <>
            <Button onClick={() => navigate('/saved')}>View saved rooms</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setViewedCount(0)
                startOver()
              }}
            >
              Start over
            </Button>
          </>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" onClick={dismissToast} className="text-emerald-700">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <section className="card-surface card-shadow rounded-[28px] px-4 py-4">
        <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
          <div>
            <span className="font-semibold text-slate-900">{viewedCount + 1}</span> in your current swipe session
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            {availableRooms.length} room{availableRooms.length === 1 ? '' : 's'} left
          </div>
        </div>
        {!tenantProfile ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Create a profile to make match scores more precise. You can still browse rooms now.
          </p>
        ) : null}
      </section>

      <RoomCard room={currentRoom}>
        <SwipeActions
          isSaved={savedRoomIds.includes(currentRoom.id)}
          onPass={() => {
            passRoom(currentRoom.id)
            setViewedCount((value) => value + 1)
          }}
          onSave={() => {
            saveRoom(currentRoom.id)
            setViewedCount((value) => value + 1)
          }}
          onDetails={() => navigate(`/rooms/${currentRoom.id}`, { state: { backgroundLocation: location } })}
        />
      </RoomCard>

      <section className="grid gap-3 md:grid-cols-3">
        {availableRooms.slice(1, 4).map((room) => (
          <RoomCard key={room.id} room={room} compact />
        ))}
      </section>
    </div>
  )
}
