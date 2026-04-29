import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import useAppState from '../context/useAppState'
import { formatDate } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatCurrency'
import Button from './Button'
import MatchBadge from './MatchBadge'

export default function RoomDetailsModal({ standalone = false }) {
  const { roomId } = useParams()
  const { rooms, savedRoomIds, saveRoom, removeSavedRoom } = useAppState()
  const navigate = useNavigate()
  const room = useMemo(() => rooms.find((item) => item.id === roomId), [roomId, rooms])
  const close = useCallback(() => navigate(-1), [navigate])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close])

  if (!room) {
    return <Navigate to="/rooms" replace />
  }

  const isSaved = savedRoomIds.includes(room.id)
  const warnings = room.match.warnings || []

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto ${standalone ? 'bg-[#fff7ed]' : 'bg-slate-950/55 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-sm md:px-4 md:py-6'}`}
    >
      <div className={`mx-auto ${standalone ? 'max-w-4xl py-0 md:py-6' : 'max-w-2xl'}`}>
        <div className="card-surface card-shadow min-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[28px] bg-white md:min-h-0 md:rounded-[32px]">
          <RoomImageGallery room={room} onClose={close} />

          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto overscroll-contain space-y-5 p-5 md:max-h-none md:p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailTile label="Deposit" value={formatCurrency(room.deposit)} />
              <DetailTile label="Available" value={formatDate(room.availableFrom)} />
              <DetailTile label="Room type" value={room.roomType} />
              <DetailTile label="Housemates" value={`${room.housematesCount}`} />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailTile label="Lifestyle" value={room.lifestyle} />
              <DetailTile label="Cleanliness" value={room.cleanliness} />
              <DetailTile label="Smoking" value={room.smokingAllowed} />
              <DetailTile label="Pets" value={room.petsAllowed} />
            </div>

            <div className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Why this room matches you</p>
              <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                {room.match.reasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Things to consider</p>
              {warnings.length ? (
                <ul className="mt-3 space-y-2 text-sm text-amber-950">
                  {warnings.map((warning) => (
                    <li key={warning} className="flex items-start gap-2">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-500" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-amber-950">
                  Looks like a strong fit based on your profile.
                </p>
              )}
            </div>

            <section>
              <h3 className="text-lg font-semibold text-slate-900">About the room</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{room.description}</p>
            </section>

            <section className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Features</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {room.features.map((feature) => (
                    <span key={feature} className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-orange-100">
                      {feature}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900">House rules</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {room.houseRules.map((rule) => (
                    <li key={rule} className="flex items-start gap-2">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-slate-300" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="surface-line rounded-[24px] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Listing contact</div>
              <div className="mt-2 text-base font-semibold text-slate-900">{room.landlordName}</div>
              <p className="mt-2 text-sm text-slate-600">
                Bills {room.billsIncluded ? 'included' : 'not included'} · Minimum stay {room.minStayMonths} months
              </p>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={close}>
                Back
              </Button>
              <Button onClick={() => (isSaved ? removeSavedRoom(room.id) : saveRoom(room.id))}>
                {isSaved ? 'Remove saved' : 'Save room'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoomImageGallery({ room, onClose }) {
  const images = room.images?.length ? room.images : ['']
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [failedImageIndexes, setFailedImageIndexes] = useState([])
  const activeImage = images[selectedImageIndex] || images[0]
  const activeImageFailed = failedImageIndexes.includes(selectedImageIndex)

  return (
    <>
      <div className="relative h-72">
        {activeImageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-200 text-sm font-medium text-slate-500">
            Gafflo room preview
          </div>
        ) : (
          <img
            src={activeImage}
            alt={`${room.title} image ${selectedImageIndex + 1}`}
            className="h-full w-full object-cover"
            onError={() =>
              setFailedImageIndexes((current) =>
                current.includes(selectedImageIndex) ? current : [...current, selectedImageIndex],
              )
            }
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/92 text-xl text-slate-700 shadow-soft transition hover:bg-white"
          aria-label="Close room details"
        >
          ×
        </button>
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <MatchBadge score={room.match.score} />
          <h2 className="text-balance mt-3 text-3xl font-semibold tracking-tight">{room.title}</h2>
          <p className="mt-2 text-sm text-slate-200">
            {room.area}, {room.city} · {formatCurrency(room.rent)}/mo
          </p>
        </div>
      </div>

      {images.length > 1 ? (
        <div className="card-surface border-t border-slate-100 px-5 py-4 md:px-6">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {images.map((image, index) => {
              const thumbFailed = failedImageIndexes.includes(index)
              const isActive = selectedImageIndex === index

              return (
                <button
                  key={`${room.id}-thumb-${index}`}
                  type="button"
                  onClick={() => setSelectedImageIndex(index)}
                  aria-label={`Show image ${index + 1} for ${room.title}`}
                  className={`relative h-18 w-20 shrink-0 overflow-hidden rounded-[18px] border transition ${
                    isActive ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
                  }`}
                >
                  {thumbFailed ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-200 text-[11px] font-medium text-slate-500">
                      Image
                    </div>
                  ) : (
                    <img
                      src={image}
                      alt={`${room.title} thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                      onError={() =>
                        setFailedImageIndexes((current) => (current.includes(index) ? current : [...current, index]))
                      }
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </>
  )
}

function DetailTile({ label, value }) {
  return (
    <div className="surface-line rounded-[20px] bg-slate-50/78 px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{value}</div>
    </div>
  )
}
