import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import SwipeActions from '../components/SwipeActions'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'
import MatchBadge from '../components/MatchBadge'

const GESTURE_LOCK_THRESHOLD = 18
const HORIZONTAL_INTENT_RATIO = 1.35
const VELOCITY_THRESHOLD = 0.9
const EXIT_ANIMATION_MS = 210
const VERTICAL_DRAG_LIMIT = 42

export default function SwipeRooms() {
  const navigate = useNavigate()
  const {
    availableRooms,
    activeFilterCount,
    discoveryRooms,
    passRoom,
    rooms,
    resetRoomFilters,
    roomFilters,
    saveRoom,
    savedRoomIds,
    startOver,
    tenantProfile,
    toast,
    dismissToast,
    reviewedRoomIds,
  } = useAppState()

  const [dragX, setDragX] = useState(0)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [exitingRoomId, setExitingRoomId] = useState(null)
  const [gestureMode, setGestureMode] = useState(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragStartTimeRef = useRef(0)
  const lastDragXRef = useRef(0)
  const lastDragYRef = useRef(0)
  const activePointerIdRef = useRef(null)

  const currentRoom = availableRooms[0]
  const nextRoom = availableRooms[1]
  const renderedRoomId = exitingRoomId ?? currentRoom?.id ?? null
  const renderedRoom = useMemo(
    () => rooms.find((room) => room.id === renderedRoomId) ?? currentRoom ?? null,
    [currentRoom, renderedRoomId, rooms],
  )
  const unsavedRooms = useMemo(
    () => discoveryRooms.filter((room) => !savedRoomIds.includes(room.id)),
    [discoveryRooms, savedRoomIds],
  )
  const reviewedUnsavedCount = useMemo(
    () => {
      const discoveryRoomIds = new Set(discoveryRooms.map((room) => room.id))
      return reviewedRoomIds.filter((id) => discoveryRoomIds.has(id) && !savedRoomIds.includes(id)).length
    },
    [discoveryRooms, reviewedRoomIds, savedRoomIds],
  )
  const totalRooms = unsavedRooms.length
  const currentPosition = renderedRoom ? reviewedUnsavedCount + 1 : totalRooms
  const selectedFilterLabels = useMemo(() => getFilterLabels(roomFilters), [roomFilters])
  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth < 768 : true
  const swipeThreshold =
    typeof window !== 'undefined'
      ? isMobileViewport
        ? Math.max(150, window.innerWidth * 0.42)
        : 120
      : 150
  const swipeDirection = dragX > 0 ? 'save' : dragX < 0 ? 'pass' : null
  const swipeProgress = Math.min(1, Math.abs(dragX) / swipeThreshold)
  const actionProgress = Math.min(1, Math.abs(dragX) / (swipeThreshold * 0.82))
  const overlayOpacity = Math.max(0, Math.min(1, (swipeProgress - 0.12) / 0.88))
  const nextCardOpacity = renderedRoom && nextRoom && !isAnimatingOut ? 0.58 + swipeProgress * 0.32 : 0
  const nextCardTransform = `translate3d(0, ${18 - swipeProgress * 10}px, 0) scale(${0.94 + swipeProgress * 0.035})`

  useEffect(() => {
    if (!toast) return undefined
    const timeoutId = window.setTimeout(() => dismissToast(), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [toast, dismissToast])

  const scrollPageTop = () => {
    const shell = document.getElementById('app-shell-scroll')
    if (shell) {
      shell.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

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
    setDragY((current) => Math.max(-VERTICAL_DRAG_LIMIT, Math.min(VERTICAL_DRAG_LIMIT, current * 1.25)))

    window.setTimeout(() => {
      if (direction === 'save') {
        saveRoom(outgoingRoomId)
      } else {
        passRoom(outgoingRoomId)
      }

      setExitingRoomId(null)
      setDragX(0)
      setDragY(0)
      setIsAnimatingOut(false)
      setIsDragging(false)
      setGestureMode(null)
      lastDragXRef.current = 0
      lastDragYRef.current = 0
      activePointerIdRef.current = null
      scrollPageTop()
    }, EXIT_ANIMATION_MS)
  }

  const resetDrag = () => {
    setDragX(0)
    setDragY(0)
    setIsDragging(false)
    setGestureMode(null)
    lastDragXRef.current = 0
    lastDragYRef.current = 0
    activePointerIdRef.current = null
  }

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target.closest('button, a')) return
    if (isAnimatingOut || !renderedRoom) return

    dragStartRef.current = { x: event.clientX, y: event.clientY }
    dragStartTimeRef.current = performance.now()
    lastDragXRef.current = 0
    lastDragYRef.current = 0
    activePointerIdRef.current = event.pointerId
    setIsDragging(true)
    setGestureMode(null)
  }

  const handlePointerMove = (event) => {
    if (!isDragging || isAnimatingOut || activePointerIdRef.current !== event.pointerId) return

    const deltaX = event.clientX - dragStartRef.current.x
    const deltaY = event.clientY - dragStartRef.current.y

    if (!gestureMode) {
      if (Math.abs(deltaX) < GESTURE_LOCK_THRESHOLD && Math.abs(deltaY) < GESTURE_LOCK_THRESHOLD) return

      if (
        Math.abs(deltaX) >= GESTURE_LOCK_THRESHOLD &&
        Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_INTENT_RATIO
      ) {
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

    const dampedY = Math.max(-VERTICAL_DRAG_LIMIT, Math.min(VERTICAL_DRAG_LIMIT, deltaY * 0.16))
    lastDragXRef.current = deltaX
    lastDragYRef.current = dampedY
    setDragX(deltaX)
    setDragY(dampedY)
  }

  const handlePointerEnd = (event) => {
    if (!isDragging || isAnimatingOut || activePointerIdRef.current !== event.pointerId) return

    if (gestureMode === 'horizontal' && event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const finalX = lastDragXRef.current
    const elapsedMs = Math.max(1, performance.now() - dragStartTimeRef.current)
    const dragVelocity = Math.abs(finalX) / elapsedMs
    const passedDistanceThreshold = Math.abs(finalX) >= swipeThreshold
    const passedVelocityThreshold =
      Math.abs(finalX) >= swipeThreshold * 0.55 &&
      dragVelocity >= VELOCITY_THRESHOLD &&
      gestureMode === 'horizontal'

    if (gestureMode === 'horizontal' && (passedDistanceThreshold || passedVelocityThreshold)) {
      triggerSwipeAction(finalX > 0 ? 'save' : 'pass')
      return
    }

    resetDrag()
  }

  if (!renderedRoom) {
    const allRoomsSaved = discoveryRooms.length > 0 && discoveryRooms.every((room) => savedRoomIds.includes(room.id))
    const noFilterResults = activeFilterCount > 0 && discoveryRooms.length === 0

    return (
      <div className="mx-auto w-full max-w-[480px] pb-[calc(10rem+env(safe-area-inset-bottom))]">
        <EmptyState
          eyebrow={noFilterResults ? 'No matching rooms' : allRoomsSaved ? 'Saved rooms complete' : 'Room stack complete'}
          title={
            noFilterResults
              ? 'No rooms match these filters.'
              : allRoomsSaved
                ? 'You’ve saved all available rooms.'
                : 'You’ve reviewed all rooms for now.'
          }
          description={
            noFilterResults
              ? 'Reset filters or loosen your search to bring rooms back into the deck.'
              : allRoomsSaved
              ? 'Your current room deck is empty because every available room is already in your saved list.'
              : 'Reset the room stack to swipe again, or jump into your saved shortlist.'
          }
          actions={
            <>
              {noFilterResults ? (
                <Button onClick={resetRoomFilters}>Reset filters</Button>
              ) : (
                <Button onClick={() => navigate('/saved')}>View saved rooms</Button>
              )}
              {!allRoomsSaved ? (
                <Button variant="secondary" onClick={startOver}>
                  Start over
                </Button>
              ) : null}
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[480px] pb-[calc(13.5rem+env(safe-area-inset-bottom))]">
      {toast ? (
        <div className="pointer-events-none sticky top-[calc(env(safe-area-inset-top)+4.9rem)] z-40 mb-3">
          <div className="toast-enter pointer-events-auto">
            <div className="card-shadow rounded-[22px] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 text-sm font-medium text-emerald-900">
            <div className="flex items-center justify-between gap-3">
              <span>{toast.message}</span>
              <button type="button" onClick={dismissToast} className="text-emerald-700 hover:text-emerald-800">
                Dismiss
              </button>
            </div>
          </div>
        </div>
        </div>
      ) : null}

      {selectedFilterLabels.length ? (
        <section className="mb-3 rounded-[24px] border border-emerald-100 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
                Filters active
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {selectedFilterLabels.map((label) => (
                  <span key={label} className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={resetRoomFilters}
              className="shrink-0 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
            >
              Reset
            </button>
          </div>
        </section>
      ) : null}

      <section className="relative min-h-[32rem]">
        {nextRoom ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-3 origin-top overflow-hidden rounded-[34px] bg-white shadow-[0_22px_54px_-32px_rgba(15,23,42,0.34)]"
            style={{
              opacity: nextCardOpacity,
              transform: nextCardTransform,
              transition: isDragging ? 'none' : 'opacity 220ms ease, transform 220ms ease',
            }}
          >
            <RoomHero
              room={nextRoom}
              currentPosition={Math.min(currentPosition + 1, totalRooms)}
              totalRooms={totalRooms}
              showDemoScore={false}
              swipeDirection={null}
              overlayOpacity={0}
              swipeProgress={0}
              isPreview
            />
          </div>
        ) : null}

        <div
          key={renderedRoom.id}
          className={`card-enter no-select relative z-10 touch-pan-y rounded-[34px] will-change-transform ${
            gestureMode === 'horizontal' || isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{
            transform: `translate3d(${dragX}px, ${dragY}px, 0) rotate(${dragX * 0.026}deg) scale(${
              isDragging ? 1.012 : 1
            })`,
            transition: isAnimatingOut
              ? `transform ${EXIT_ANIMATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`
              : gestureMode === 'horizontal'
                ? 'none'
                : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <RoomHero
            room={renderedRoom}
            currentPosition={currentPosition}
            totalRooms={totalRooms}
            showDemoScore={!tenantProfile}
            swipeDirection={swipeDirection}
            overlayOpacity={overlayOpacity}
            swipeProgress={swipeProgress}
            actionProgress={actionProgress}
          />
        </div>
      </section>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:px-6">
        <SwipeActions
          className="pointer-events-auto"
          isSaved={savedRoomIds.includes(renderedRoom.id)}
          onPass={() => triggerSwipeAction('pass')}
          onSave={() => triggerSwipeAction('save')}
          swipeDirection={swipeDirection}
          swipeProgress={actionProgress}
          disabled={isAnimatingOut}
        />
      </div>

      <div className="mt-4 space-y-4">
        <section className="card-surface card-shadow rounded-[28px] p-5">
          <h2 className="text-base font-semibold text-slate-900">Overview</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">{renderedRoom.description}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <InfoTile label="Rent" value={`${formatCurrency(renderedRoom.rent)}/mo`} />
            <InfoTile label="Deposit" value={formatCurrency(renderedRoom.deposit)} />
            <InfoTile label="Available" value={formatDate(renderedRoom.availableFrom)} />
            <InfoTile label="Bills" value={renderedRoom.billsIncluded ? 'Included' : 'Separate'} />
            <InfoTile label="Room type" value={renderedRoom.roomType} />
            <InfoTile label="Housemates" value={`${renderedRoom.housematesCount}`} />
            <InfoTile label="Lifestyle" value={renderedRoom.lifestyle} />
            <InfoTile label="Cleanliness" value={renderedRoom.cleanliness} />
          </div>
        </section>

        <section className="card-surface card-shadow rounded-[28px] p-5">
          <h2 className="text-base font-semibold text-slate-900">Features</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {renderedRoom.features.map((feature) => (
              <span
                key={feature}
                className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-orange-100"
              >
                {feature}
              </span>
            ))}
          </div>
        </section>

        <section className="card-surface card-shadow rounded-[28px] p-5">
          <h2 className="text-base font-semibold text-slate-900">House rules</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {renderedRoom.houseRules.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-slate-300" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5">
          <h2 className="text-base font-semibold text-emerald-950">Why this room matches you</h2>
          <ul className="mt-3 space-y-2 text-sm text-emerald-950">
            {renderedRoom.match.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[28px] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5">
          <h2 className="text-base font-semibold text-amber-950">Things to consider</h2>
          {renderedRoom.match.warnings?.length ? (
            <ul className="mt-3 space-y-2 text-sm text-amber-950">
              {renderedRoom.match.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-500" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-amber-950">Looks like a strong fit based on your profile.</p>
          )}
        </section>

        <section className="card-surface card-shadow rounded-[28px] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Listing contact</div>
          <div className="mt-2 text-base font-semibold text-slate-900">{renderedRoom.landlordName}</div>
          <p className="mt-2 text-sm text-slate-600">
            Minimum stay {renderedRoom.minStayMonths} months · Smoking {renderedRoom.smokingAllowed} · Pets {renderedRoom.petsAllowed}
          </p>
        </section>
      </div>
    </div>
  )
}

function RoomHero({
  room,
  currentPosition,
  totalRooms,
  showDemoScore,
  swipeDirection,
  overlayOpacity,
  swipeProgress,
  actionProgress = swipeProgress,
  isPreview = false,
}) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [failedImages, setFailedImages] = useState([])
  const images = room.images?.length ? room.images : ['']
  const activeImage = images[selectedImageIndex] || images[0]
  const activeImageFailed = failedImages.includes(selectedImageIndex)

  const moveImage = (direction) => {
    if (images.length <= 1) return
    setSelectedImageIndex((current) => {
      const next = current + direction
      if (next < 0) return images.length - 1
      if (next >= images.length) return 0
      return next
    })
  }

  const markImageFailed = (index) => {
    setFailedImages((current) => (current.includes(index) ? current : [...current, index]))
  }

  return (
    <div key={room.id} className={`card-surface card-shadow overflow-hidden rounded-[34px] ${isPreview ? 'brightness-[0.98]' : ''}`}>
      <div className="relative h-[80dvh] min-h-[32rem] max-h-[46rem] md:h-[42rem]">
        {activeImageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-200 px-4 text-center text-sm font-medium text-slate-500">
            Gaffly room preview
          </div>
        ) : (
          <img
            src={activeImage}
            alt={`${room.title} image ${selectedImageIndex + 1}`}
            className="h-full w-full object-cover"
            onError={() => markImageFailed(selectedImageIndex)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/18 to-transparent" />
        <div
          className={`pointer-events-none absolute inset-0 transition duration-150 ${
            swipeDirection === 'save'
              ? 'bg-emerald-500/18'
              : swipeDirection === 'pass'
                ? 'bg-rose-500/18'
                : 'bg-transparent'
          }`}
          style={{
            opacity: overlayOpacity,
            backdropFilter: swipeProgress > 0.45 ? `blur(${2 + swipeProgress * 3}px)` : 'blur(0px)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-full border text-5xl shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)] transition duration-150 ${
              swipeDirection === 'save'
                ? 'border-emerald-200 bg-white/88 text-emerald-600'
                : 'border-rose-200 bg-white/88 text-rose-600'
            }`}
            style={{
              opacity: swipeDirection ? overlayOpacity : 0,
              transform: `scale(${0.82 + overlayOpacity * 0.24})`,
            }}
          >
            <span aria-hidden="true">{swipeDirection === 'save' ? '♥' : '✕'}</span>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex items-start justify-between px-5">
          <SwipeStamp
            label="Pass"
            tone="pass"
            active={swipeDirection === 'pass'}
            progress={actionProgress}
          />
          <SwipeStamp
            label="Save"
            tone="save"
            active={swipeDirection === 'save'}
            progress={actionProgress}
          />
        </div>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous room photo"
              className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/36 text-lg text-white backdrop-blur-sm"
              onClick={() => moveImage(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next room photo"
              className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/36 text-lg text-white backdrop-blur-sm"
              onClick={() => moveImage(1)}
            >
              ›
            </button>
          </>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <div className="max-w-[90%]">
            <h1 className="text-balance text-[2rem] font-semibold leading-tight tracking-tight">{room.title}</h1>
            <p className="mt-1 text-sm text-slate-200">
              {room.area}, {room.city}
            </p>
            <div className="mt-2 flex items-center gap-3 text-sm font-medium text-slate-100">
              <span>{formatCurrency(room.rent)}/mo</span>
              <span className="h-1 w-1 rounded-full bg-white/70" />
              <span>{formatDate(room.availableFrom)}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {room.features.slice(0, 3).map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-white/15 bg-white/14 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-soft">
              {currentPosition} / {totalRooms}
            </span>
            {showDemoScore ? (
              <span className="rounded-full bg-slate-950/52 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                Demo scores
              </span>
            ) : null}
          </div>
          <MatchBadge score={room.match.score} />
        </div>

        <div className="absolute inset-x-0 top-14 flex justify-end px-4">
          {images.length > 1 ? (
            <span className="rounded-full bg-slate-950/52 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {selectedImageIndex + 1} / {images.length}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SwipeStamp({ label, tone, active, progress }) {
  const colorClass =
    tone === 'save'
      ? 'border-emerald-300 bg-emerald-50/92 text-emerald-700'
      : 'border-rose-300 bg-rose-50/92 text-rose-700'

  return (
    <div
      className={`rounded-[18px] border-2 px-4 py-2 text-sm font-black uppercase tracking-[0.22em] shadow-[0_18px_42px_-24px_rgba(15,23,42,0.42)] backdrop-blur-md ${colorClass}`}
      style={{
        opacity: active ? Math.min(1, 0.22 + progress * 0.78) : 0,
        transform: `rotate(${tone === 'save' ? 10 : -10}deg) scale(${0.86 + progress * 0.16})`,
      }}
    >
      {label}
    </div>
  )
}

function InfoTile({ label, value }) {
  return (
    <div className="surface-line rounded-[20px] bg-slate-50/78 px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{value}</div>
    </div>
  )
}

function getFilterLabels(filters) {
  return [
    filters.priceMin ? `From €${filters.priceMin}` : null,
    filters.priceMax ? `Up to €${filters.priceMax}` : null,
    filters.location !== 'Any' ? filters.location : null,
    filters.moveInBy ? `By ${filters.moveInBy}` : null,
    filters.genderPreference !== 'Any' ? filters.genderPreference : null,
    filters.occupationType !== 'Any' ? filters.occupationType : null,
    filters.smokingPreference !== 'Any' ? filters.smokingPreference : null,
    filters.petFriendliness !== 'Any' ? filters.petFriendliness : null,
    filters.lifestylePreference !== 'Any' ? filters.lifestylePreference : null,
  ].filter(Boolean)
}
