import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import useAppState from '../context/useAppState'
import { formatDate } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatCurrency'
import Button from './Button'
import MatchBadge from './MatchBadge'

export default function RoomDetailsModal({ standalone = false }) {
  const { roomId } = useParams()
  const { getOrCreateConversationForRoom, rooms, savedRoomIds, saveRoom, removeSavedRoom } = useAppState()
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
  const handleMessage = () => {
    const conversationId = getOrCreateConversationForRoom(room.id)
    navigate(`/messages/${conversationId}`)
  }

  return (
    <div className="fixed inset-0 z-50">
      {!standalone ? (
        <button
          type="button"
          aria-label="Close room details"
          className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
          onClick={close}
        />
      ) : null}

      <div
        className={`relative flex h-[100dvh] items-stretch justify-center ${standalone ? 'bg-[#fff7ed]' : 'p-0 md:p-6'}`}
      >
        <div
          className={`card-surface card-shadow relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white ${standalone ? 'max-w-4xl' : 'md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[32px]'}`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <RoomImageGallery room={room} isSaved={isSaved} onClose={close} />

            <div className="space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] pt-4 md:px-6">
              <section className="card-surface card-shadow rounded-[28px] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Monthly rent
                    </p>
                    <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
                      {formatCurrency(room.rent)}
                    </div>
                  </div>
                  <MatchBadge score={room.match.score} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <DetailTile label="Deposit" value={formatCurrency(room.deposit)} />
                  <DetailTile label="Bills" value={room.billsIncluded ? 'Included' : 'Separate'} />
                  <DetailTile label="Move-in" value={formatDate(room.availableFrom)} />
                </div>

                <div className="surface-line mt-3 flex items-center justify-between gap-3 rounded-[20px] bg-slate-50/78 px-3 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Location
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-800">
                      {room.area}, {room.city}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-soft">
                    {room.roomType}
                  </span>
                </div>
              </section>

              <DetailSection title="About the room">
                <p className="text-sm leading-7 text-slate-600">{room.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {room.features.map((feature) => (
                    <span
                      key={feature}
                      className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-orange-100"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </DetailSection>

              <DetailSection title="About the flatmates">
                <div className="grid grid-cols-2 gap-3">
                  <DetailTile label="Housemates" value={`${room.housematesCount}`} />
                  <DetailTile label="Minimum stay" value={`${room.minStayMonths} mo`} />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {room.flatmateSummary ||
                    `Shared with ${room.housematesCount} ${
                      room.housematesCount === 1 ? 'flatmate' : 'flatmates'
                    } in a ${room.lifestyle.toLowerCase()} household. Contact is handled by ${room.landlordName}.`}
                </p>
              </DetailSection>

              <DetailSection title="Lifestyle">
                <div className="grid grid-cols-2 gap-3">
                  <DetailTile label="House vibe" value={room.lifestyle} />
                  <DetailTile label="Cleanliness" value={room.cleanliness} />
                  <DetailTile label="Smoking" value={room.smokingAllowed} />
                  <DetailTile label="Pets" value={room.petsAllowed} />
                </div>
              </DetailSection>

              <DetailSection title="House rules">
                <ul className="space-y-2 text-sm text-slate-600">
                  {room.houseRules.map((rule) => (
                    <li key={rule} className="flex items-start gap-3 rounded-[18px] bg-slate-50/78 px-3 py-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </DetailSection>

              <section className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
                  Why this room matches you
                </p>
                <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                  {room.match.reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {warnings.length ? (
                <section className="rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                    Things to consider
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-amber-950">
                    {warnings.map((warning) => (
                      <li key={warning} className="flex items-start gap-2">
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-500" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white/94 px-4 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3 backdrop-blur-xl md:px-6">
            <div className="grid grid-cols-[0.95fr_1.05fr] gap-3">
              <Button
                variant={isSaved ? 'secondary' : 'primary'}
                onClick={() => (isSaved ? removeSavedRoom(room.id) : saveRoom(room.id))}
              >
                {isSaved ? 'Remove saved' : 'Save room'}
              </Button>
              <Button variant="dark" onClick={handleMessage}>
                Message
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoomImageGallery({ room, isSaved, onClose }) {
  const images = room.images?.length ? room.images : ['']
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [failedImageIndexes, setFailedImageIndexes] = useState([])
  const activeImage = images[selectedImageIndex] || images[0]
  const activeImageFailed = failedImageIndexes.includes(selectedImageIndex)

  return (
    <>
      <div className="relative h-[24rem] overflow-hidden bg-slate-200 md:h-[30rem]">
        {activeImageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-200 text-sm font-medium text-slate-500">
            Gaffly room preview
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
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/88 via-slate-950/18 to-slate-950/18" />

        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.85rem)] md:px-5 md:pt-5">
          <div className="rounded-full bg-white/16 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md">
            {isSaved ? 'Saved room' : 'Room details'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 text-xl text-slate-800 shadow-soft backdrop-blur transition hover:bg-white"
            aria-label="Close room details"
          >
            ×
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 text-white md:p-5">
          <h2 className="text-balance text-[2rem] font-semibold leading-tight tracking-tight md:text-4xl">{room.title}</h2>
          <p className="mt-2 text-sm font-medium text-slate-200">
            {room.area}, {room.city}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {isSaved ? (
              <span className="rounded-full border border-emerald-200/40 bg-emerald-400/22 px-3 py-1.5 text-xs font-semibold text-emerald-50 backdrop-blur-sm">
                Saved
              </span>
            ) : null}
            <span className="rounded-full border border-white/15 bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              {formatCurrency(room.rent)}/mo
            </span>
            <span className="rounded-full border border-white/15 bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              {room.billsIncluded ? 'Bills included' : 'Bills separate'}
            </span>
            <span className="rounded-full border border-white/15 bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              {formatDate(room.availableFrom)}
            </span>
          </div>
        </div>
      </div>

      {images.length > 1 ? (
        <div className="border-b border-slate-100 bg-white px-4 py-4 md:px-6">
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
                        setFailedImageIndexes((current) =>
                          current.includes(index) ? current : [...current, index],
                        )
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

function DetailSection({ title, children }) {
  return (
    <section className="card-surface card-shadow rounded-[26px] p-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function DetailTile({ label, value }) {
  return (
    <div className="surface-line min-w-0 rounded-[20px] bg-slate-50/78 px-3 py-3">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
