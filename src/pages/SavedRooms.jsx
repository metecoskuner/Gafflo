import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import MatchBadge from '../components/MatchBadge'
import useAppState from '../context/useAppState'
import { formatDate } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatCurrency'

export default function SavedRooms() {
  const navigate = useNavigate()
  const location = useLocation()
  const { savedRooms, removeSavedRoom, toast, dismissToast } = useAppState()
  const [imageFailures, setImageFailures] = useState({})

  const sortedSavedRooms = useMemo(
    () => [...savedRooms].sort((a, b) => b.match.score - a.match.score),
    [savedRooms],
  )

  useEffect(() => {
    if (!toast) return undefined

    const timeoutId = window.setTimeout(() => {
      dismissToast()
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [toast, dismissToast])

  if (!sortedSavedRooms.length) {
    return (
      <EmptyState
        eyebrow="Saved rooms"
        title="No saved rooms yet"
        description="Start swiping and save rooms that feel like a good fit."
        actions={<Button onClick={() => navigate('/rooms')}>Browse rooms</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="card-shadow rounded-[22px] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 text-sm font-medium text-emerald-900">
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" onClick={dismissToast} className="text-emerald-700 hover:text-emerald-800">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <section className="card-surface card-shadow rounded-[28px] p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">Saved rooms</p>
        <h1 className="text-balance mt-2 text-3xl font-semibold tracking-tight text-slate-900">Saved rooms</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Rooms you’re interested in reviewing later.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {sortedSavedRooms.map((room) => {
          const imageFailed = Boolean(imageFailures[room.id])

          return (
            <article key={room.id} className="card-surface card-shadow overflow-hidden rounded-[30px]">
              <div className="relative h-60">
                {imageFailed ? (
                  <div className="flex h-full w-full items-center justify-center bg-slate-200 px-4 text-center text-sm font-medium text-slate-500">
                    Gaffly room preview
                  </div>
                ) : (
                  <img
                    src={room.images[0]}
                    alt={room.title}
                    className="h-full w-full object-cover"
                    onError={() => setImageFailures((current) => ({ ...current, [room.id]: true }))}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/18 to-transparent" />
                <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                  <MatchBadge score={room.match.score} />
                  <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
                    {room.billsIncluded ? 'Bills included' : 'Bills separate'}
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight">{room.title}</h2>
                  <p className="mt-1 text-sm text-slate-200">
                    {room.area}, {room.city}
                  </p>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <InfoTile label="Rent" value={`${formatCurrency(room.rent)}/mo`} />
                  <InfoTile label="Available" value={formatDate(room.availableFrom)} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {room.features.slice(0, 3).map((feature) => (
                    <span key={feature} className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-orange-100">
                      {feature}
                    </span>
                  ))}
                </div>

                <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Top match reason</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-950">
                    {room.match.reasons[0] || 'Looks like a strong fit based on your profile.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/rooms/${room.id}`, { state: { backgroundLocation: location } })}
                  >
                    Details
                  </Button>
                  <Button variant="ghost" className="bg-slate-100" onClick={() => removeSavedRoom(room.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </section>
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
