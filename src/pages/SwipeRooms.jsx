import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import RoomCard from '../components/RoomCard'
import SwipeActions from '../components/SwipeActions'
import useAppState from '../context/useAppState'

export default function SwipeRooms() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    availableRooms,
    passRoom,
    saveRoom,
    savedRoomIds,
    startOver,
    tenantProfile,
    toast,
    dismissToast,
    reviewedRoomIds,
  } = useAppState()
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const dragStartXRef = useRef(0)
  const lastDragXRef = useRef(0)
  const currentRoom = availableRooms[0]
  const totalRooms = reviewedRoomIds.length + availableRooms.length
  const currentPosition = currentRoom ? reviewedRoomIds.length + 1 : totalRooms
  const progressWidth = totalRooms > 0 ? (currentPosition / totalRooms) * 100 : 0
  const swipeThreshold =
    typeof window !== 'undefined'
      ? Math.min(132, Math.max(92, window.innerWidth * 0.22))
      : 100
  const swipeDirection = dragX > 0 ? 'save' : dragX < 0 ? 'pass' : null
  const overlayOpacity = Math.min(1, Math.abs(dragX) / swipeThreshold)

  useEffect(() => {
    if (!toast) return undefined

    const timeoutId = window.setTimeout(() => {
      dismissToast()
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [toast, dismissToast])

  const triggerSwipeAction = (direction) => {
    if (!currentRoom || isAnimatingOut) return

    const offscreenX =
      direction === 'save'
        ? typeof window !== 'undefined'
          ? window.innerWidth * 0.9
          : 420
        : typeof window !== 'undefined'
          ? -window.innerWidth * 0.9
          : -420

    setIsAnimatingOut(true)
    setDragX(offscreenX)

    window.setTimeout(() => {
      if (direction === 'save') {
        saveRoom(currentRoom.id)
      } else {
        passRoom(currentRoom.id)
      }

      setDragX(0)
      setIsAnimatingOut(false)
      setIsDragging(false)
      lastDragXRef.current = 0
    }, 180)
  }

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target.closest('button, a')) return
    if (isAnimatingOut) return

    dragStartXRef.current = event.clientX
    lastDragXRef.current = 0
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event) => {
    if (!isDragging || isAnimatingOut) return

    const nextX = event.clientX - dragStartXRef.current
    lastDragXRef.current = nextX
    setDragX(nextX)
  }

  const handlePointerEnd = (event) => {
    if (!isDragging || isAnimatingOut) return

    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const finalX = lastDragXRef.current
    setIsDragging(false)

    if (Math.abs(finalX) >= swipeThreshold) {
      triggerSwipeAction(finalX > 0 ? 'save' : 'pass')
      return
    }

    setDragX(0)
    lastDragXRef.current = 0
  }

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
        <div className="toast-enter card-shadow rounded-[22px] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 text-sm font-medium text-emerald-900">
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" onClick={dismissToast} className="text-emerald-700 hover:text-emerald-800">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <section className="card-surface card-shadow rounded-[28px] px-4 py-4 md:px-5">
        <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
          <div className="space-y-1">
            <div className="font-medium text-slate-600">
              <span className="font-semibold text-slate-900">Room {currentPosition}</span> of {totalRooms}
            </div>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                style={{ width: `${Math.min(100, progressWidth)}%` }}
              />
            </div>
          </div>
          <div className="surface-line rounded-full bg-slate-50 px-3 py-1.5 font-medium text-slate-600">
            {availableRooms.length} room{availableRooms.length === 1 ? '' : 's'} left
          </div>
        </div>
        {!tenantProfile ? (
          <div className="mt-4 rounded-[22px] border border-amber-100 bg-amber-50/80 p-4">
            <p className="text-sm font-medium text-slate-900">Create your profile to get better matches.</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              You can still browse demo rooms now, but match scores are using the default preview logic.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => navigate('/profile')} className="sm:flex-1">
                Create profile
              </Button>
              <Button variant="ghost" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="bg-white/60 sm:flex-1">
                Browse demo rooms
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="relative min-h-[680px] sm:min-h-[700px] md:min-h-[720px]">
        {availableRooms.slice(1, 3).reverse().map((room, index) => (
          <div
            key={room.id}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-3 opacity-100 transition-transform duration-200"
            style={{
              transform: `translateY(${(index + 1) * 14}px) scale(${1 - (index + 1) * 0.035})`,
              zIndex: index + 1,
            }}
          >
            <div className="card-surface card-shadow overflow-hidden rounded-[28px] opacity-75">
              <div className="flex items-center justify-between px-4 py-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{room.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {room.area}, {room.city}
                  </div>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Up next
                </div>
              </div>
            </div>
          </div>
        ))}

        <div
          key={currentRoom.id}
          className={`card-enter no-select relative z-10 touch-pan-y ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX * 0.035}deg)`,
            transition: isDragging ? 'none' : 'transform 180ms ease-out',
          }}
        >
          <div className="pointer-events-none absolute inset-x-4 top-6 z-20 flex items-center justify-between">
            <div
              className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold tracking-[0.18em] text-emerald-700"
              style={{
                opacity: swipeDirection === 'save' ? overlayOpacity : 0,
                transform: `scale(${0.92 + overlayOpacity * 0.08})`,
              }}
            >
              SAVE
            </div>
            <div
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold tracking-[0.18em] text-rose-600"
              style={{
                opacity: swipeDirection === 'pass' ? overlayOpacity : 0,
                transform: `scale(${0.92 + overlayOpacity * 0.08})`,
              }}
            >
              PASS
            </div>
          </div>

          <RoomCard room={currentRoom}>
            <SwipeActions
              isSaved={savedRoomIds.includes(currentRoom.id)}
              onPass={() => triggerSwipeAction('pass')}
              onSave={() => triggerSwipeAction('save')}
              onDetails={() => navigate(`/rooms/${currentRoom.id}`, { state: { backgroundLocation: location } })}
            />
          </RoomCard>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {availableRooms.slice(1, 4).map((room) => (
          <RoomCard key={room.id} room={room} compact />
        ))}
      </section>
    </div>
  )
}
