import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import RoomCard from '../components/RoomCard'
import SwipeActions from '../components/SwipeActions'
import useAppState from '../context/useAppState'

const GESTURE_THRESHOLD = 10

export default function SwipeRooms() {
  const navigate = useNavigate()
  const {
    availableRooms,
    passRoom,
    rooms,
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
  const [exitingRoomId, setExitingRoomId] = useState(null)
  const [gestureMode, setGestureMode] = useState(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const lastDragXRef = useRef(0)
  const activePointerIdRef = useRef(null)

  const currentRoom = availableRooms[0]
  const renderedRoomId = exitingRoomId ?? currentRoom?.id ?? null
  const renderedRoom = useMemo(
    () => rooms.find((room) => room.id === renderedRoomId) ?? currentRoom ?? null,
    [currentRoom, renderedRoomId, rooms],
  )
  const unsavedRooms = useMemo(
    () => rooms.filter((room) => !savedRoomIds.includes(room.id)),
    [rooms, savedRoomIds],
  )
  const reviewedUnsavedCount = useMemo(
    () => reviewedRoomIds.filter((id) => !savedRoomIds.includes(id)).length,
    [reviewedRoomIds, savedRoomIds],
  )
  const totalRooms = unsavedRooms.length
  const currentPosition = renderedRoom ? reviewedUnsavedCount + 1 : totalRooms
  const progressWidth = totalRooms > 0 ? (currentPosition / totalRooms) * 100 : 0
  const swipeThreshold =
    typeof window !== 'undefined'
      ? Math.min(132, Math.max(96, window.innerWidth * 0.24))
      : 100
  const swipeDirection = dragX > 0 ? 'save' : dragX < 0 ? 'pass' : null
  const overlayOpacity = Math.min(1, Math.abs(dragX) / swipeThreshold)

  useEffect(() => {
    if (!toast) return undefined
    const timeoutId = window.setTimeout(() => dismissToast(), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [toast, dismissToast])

  const triggerSwipeAction = (direction) => {
    if (!renderedRoom || isAnimatingOut) return

    const outgoingRoomId = renderedRoom.id
    const offscreenX =
      direction === 'save'
        ? typeof window !== 'undefined'
          ? window.innerWidth * 1.2
          : 460
        : typeof window !== 'undefined'
          ? -window.innerWidth * 1.2
          : -460

    setIsAnimatingOut(true)
    setExitingRoomId(outgoingRoomId)
    setDragX(offscreenX)

    window.setTimeout(() => {
      if (direction === 'save') {
        saveRoom(outgoingRoomId)
      } else {
        passRoom(outgoingRoomId)
      }

      setExitingRoomId(null)
      setDragX(0)
      setIsAnimatingOut(false)
      setIsDragging(false)
      setGestureMode(null)
      lastDragXRef.current = 0
      activePointerIdRef.current = null
    }, 170)
  }

  const resetDrag = () => {
    setDragX(0)
    setIsDragging(false)
    setGestureMode(null)
    lastDragXRef.current = 0
    activePointerIdRef.current = null
  }

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target.closest('button, a')) return
    if (isAnimatingOut || !renderedRoom) return

    dragStartRef.current = { x: event.clientX, y: event.clientY }
    lastDragXRef.current = 0
    activePointerIdRef.current = event.pointerId
    setIsDragging(true)
    setGestureMode(null)
  }

  const handlePointerMove = (event) => {
    if (!isDragging || isAnimatingOut || activePointerIdRef.current !== event.pointerId) return

    const deltaX = event.clientX - dragStartRef.current.x
    const deltaY = event.clientY - dragStartRef.current.y

    if (!gestureMode) {
      if (Math.abs(deltaX) < GESTURE_THRESHOLD && Math.abs(deltaY) < GESTURE_THRESHOLD) return

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        setGestureMode('horizontal')
        if (event.currentTarget.setPointerCapture) {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      } else {
        setGestureMode('vertical')
        return
      }
    }

    if (gestureMode === 'vertical') return

    lastDragXRef.current = deltaX
    setDragX(deltaX)
  }

  const handlePointerEnd = (event) => {
    if (!isDragging || isAnimatingOut || activePointerIdRef.current !== event.pointerId) return

    if (gestureMode === 'horizontal' && event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const finalX = lastDragXRef.current

    if (gestureMode === 'horizontal' && Math.abs(finalX) >= swipeThreshold) {
      triggerSwipeAction(finalX > 0 ? 'save' : 'pass')
      return
    }

    resetDrag()
  }

  if (!renderedRoom) {
    const allRoomsSaved = rooms.length > 0 && savedRoomIds.length >= rooms.length

    return (
      <EmptyState
        eyebrow={allRoomsSaved ? 'Saved rooms complete' : 'Room stack complete'}
        title={allRoomsSaved ? 'You’ve saved all available rooms.' : 'You’ve reviewed all rooms for now.'}
        description={
          allRoomsSaved
            ? 'Your current room deck is empty because every available room is already in your saved list.'
            : 'Reset the room stack to swipe again, or jump into your saved shortlist.'
        }
        actions={
          <>
            <Button onClick={() => navigate('/saved')}>View saved rooms</Button>
            {!allRoomsSaved ? (
              <Button variant="secondary" onClick={startOver}>
                Start over
              </Button>
            ) : null}
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9.5rem-env(safe-area-inset-bottom))] w-full max-w-[480px] flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
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

      <section className="card-surface card-shadow rounded-[28px] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">Gafflo rooms</div>
            <div className="mt-1 text-sm font-medium text-slate-600">
              <span className="font-semibold text-slate-900">Room {currentPosition}</span> of {totalRooms}
            </div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
            {availableRooms.length} left
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
            style={{ width: `${Math.min(100, progressWidth)}%` }}
          />
        </div>
        {!tenantProfile ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Create your profile for sharper match scores. Demo browsing still works without it.
          </p>
        ) : null}
      </section>

      <section className="relative flex-1">
        {availableRooms.slice(1, 2).map((room) => (
          <div
            key={room.id}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-3 z-0 h-[calc(100dvh-14rem-env(safe-area-inset-bottom))] min-h-[36rem] scale-[0.98] rounded-[34px] bg-white/75 opacity-70 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.16)]"
          />
        ))}

        <div
          key={renderedRoom.id}
          className={`card-enter no-select relative z-10 ${gestureMode === 'horizontal' || isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX * 0.032}deg)`,
            transition: gestureMode === 'horizontal' ? 'none' : 'transform 170ms ease-out',
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

          <RoomCard room={renderedRoom} swipeMode />
        </div>
      </section>

      <SwipeActions
        isSaved={savedRoomIds.includes(renderedRoom.id)}
        onPass={() => triggerSwipeAction('pass')}
        onSave={() => triggerSwipeAction('save')}
      />
    </div>
  )
}
