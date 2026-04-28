import { useMemo, useState } from 'react'
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
  const [imageFailed, setImageFailed] = useState(false)

  if (!room) {
    return <Navigate to="/rooms" replace />
  }

  const isSaved = savedRoomIds.includes(room.id)
  const close = () => navigate(-1)

  return (
    <div className={`fixed inset-0 z-50 ${standalone ? 'bg-[#fff7ed]' : 'bg-slate-950/55 px-4 py-6 backdrop-blur-sm'}`}>
      <div className={`mx-auto ${standalone ? 'max-w-4xl py-6' : 'max-w-2xl'}`}>
        <div className="card-shadow overflow-hidden rounded-[32px] bg-white">
          <div className="relative h-72">
            {imageFailed ? (
              <div className="flex h-full w-full items-center justify-center bg-slate-200 text-sm font-medium text-slate-500">
                Gafflo room preview
              </div>
            ) : (
              <img
                src={room.images[0]}
                alt={room.title}
                className="h-full w-full object-cover"
                onError={() => setImageFailed(true)}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
            <button
              type="button"
              onClick={close}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/92 text-xl text-slate-700 shadow-soft"
              aria-label="Close room details"
            >
              ×
            </button>
            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <MatchBadge score={room.match.score} />
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{room.title}</h2>
              <p className="mt-2 text-sm text-slate-200">
                {room.area}, {room.city} · {formatCurrency(room.rent)}/mo
              </p>
            </div>
          </div>

          <div className="space-y-5 p-5 md:p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailTile label="Deposit" value={formatCurrency(room.deposit)} />
              <DetailTile label="Available" value={formatDate(room.availableFrom)} />
              <DetailTile label="Room type" value={room.roomType} />
              <DetailTile label="Housemates" value={`${room.housematesCount}`} />
            </div>

            <div className="rounded-[24px] bg-emerald-50 p-4">
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

            <section className="rounded-[24px] border border-slate-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Listing contact</div>
              <div className="mt-2 text-base font-semibold text-slate-900">{room.landlordName}</div>
              <p className="mt-2 text-sm text-slate-600">
                Bills {room.billsIncluded ? 'included' : 'not included'} · Smoking {room.smokingAllowed} · Pets {room.petsAllowed}
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

function DetailTile({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{value}</div>
    </div>
  )
}
