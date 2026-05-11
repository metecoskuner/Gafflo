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
  const bestMatch = sortedSavedRooms[0]
  const averageRent = sortedSavedRooms.length
    ? Math.round(sortedSavedRooms.reduce((total, room) => total + room.rent, 0) / sortedSavedRooms.length)
    : 0

  useEffect(() => {
    if (!toast) return undefined

    const timeoutId = window.setTimeout(() => {
      dismissToast()
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [toast, dismissToast])

  if (!sortedSavedRooms.length) {
    return (
      <div className="mx-auto w-full max-w-[480px]">
        <EmptyState
          eyebrow="Saved rooms"
          title="Build your shortlist"
          description="Save rooms from discovery and they’ll stay here on this device for quick review later."
          actions={
            <>
              <Button onClick={() => navigate('/rooms')}>Browse rooms</Button>
              <Button variant="secondary" onClick={() => navigate('/profile')}>
                Update profile
              </Button>
            </>
          }
        />
      </div>
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

      <section className="card-surface card-shadow overflow-hidden rounded-[30px]">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Saved rooms</p>
          <h1 className="text-balance mt-2 text-3xl font-semibold tracking-tight">Your shortlist</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Compare saved rooms, revisit match reasons and remove anything that no longer fits.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          <SummaryTile label="Saved" value={String(sortedSavedRooms.length)} />
          <SummaryTile label="Avg rent" value={`${formatCurrency(averageRent)}`} />
          <SummaryTile label="Best match" value={bestMatch ? `${bestMatch.match.score}%` : '-'} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {sortedSavedRooms.map((room) => {
          const imageFailed = Boolean(imageFailures[room.id])

          return (
            <article key={room.id} className="card-surface card-shadow overflow-hidden rounded-[30px]">
              <button
                type="button"
                onClick={() => navigate(`/rooms/${room.id}`, { state: { backgroundLocation: location } })}
                className="block w-full text-left"
              >
              <div className="relative h-62">
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
                  <div className="flex flex-col items-end gap-2">
                    <span className="rounded-full bg-emerald-50/95 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-soft">
                      Saved
                    </span>
                    <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
                      {room.billsIncluded ? 'Bills included' : 'Bills separate'}
                    </span>
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight">{room.title}</h2>
                  <p className="mt-1 text-sm text-slate-200">
                    {room.area}, {room.city}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <span>{formatCurrency(room.rent)}/mo</span>
                    <span className="h-1 w-1 rounded-full bg-white/70" />
                    <span>{formatDate(room.availableFrom)}</span>
                  </div>
                </div>
              </div>
              </button>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-3 gap-2 text-sm text-slate-600">
                  <InfoTile label="Deposit" value={formatCurrency(room.deposit)} />
                  <InfoTile label="Bills" value={room.billsIncluded ? 'Included' : 'Separate'} />
                  <InfoTile label="Vibe" value={room.lifestyle} />
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

                <div className="grid grid-cols-[1.05fr_0.95fr] gap-3">
                  <Button
                    variant="dark"
                    onClick={() => navigate(`/rooms/${room.id}`, { state: { backgroundLocation: location } })}
                  >
                    Details
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-rose-600 hover:border-rose-100 hover:bg-rose-50"
                    onClick={() => removeSavedRoom(room.id)}
                  >
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
    <div className="surface-line min-w-0 rounded-[20px] bg-slate-50/78 px-3 py-3">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-700">{value}</div>
    </div>
  )
}

function SummaryTile({ label, value }) {
  return (
    <div className="rounded-[22px] bg-slate-50 px-3 py-3 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  )
}
