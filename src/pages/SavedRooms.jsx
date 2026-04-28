import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import RoomCard from '../components/RoomCard'
import useAppState from '../context/useAppState'

export default function SavedRooms() {
  const navigate = useNavigate()
  const { savedRooms, removeSavedRoom } = useAppState()

  if (!savedRooms.length) {
    return (
      <EmptyState
        eyebrow="Saved rooms"
        title="No rooms saved yet."
        description="Swipe through room matches and save the ones that feel promising. They will show up here."
        actions={<Button onClick={() => navigate('/rooms')}>Start swiping</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <section className="card-surface card-shadow rounded-[28px] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">Saved shortlist</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Your strongest room options.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Revisit rooms you liked, compare match reasons and trim the shortlist as you go.
        </p>
      </section>

      {savedRooms.map((room) => (
        <RoomCard key={room.id} room={room} compact>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => removeSavedRoom(room.id)}>
              Remove
            </Button>
            <Button className="flex-1" onClick={() => navigate(`/rooms/${room.id}`)}>
              Open details
            </Button>
          </div>
        </RoomCard>
      ))}
    </div>
  )
}
