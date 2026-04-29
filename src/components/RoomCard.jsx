import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'
import MatchBadge from './MatchBadge'

export default function RoomCard({ room, compact = false, children, className = '' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const location = useLocation()

  return (
    <article className={`card-surface card-shadow overflow-hidden rounded-[30px] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_28px_68px_-30px_rgba(15,23,42,0.22)] ${className}`}>
      <div className={compact ? 'flex gap-4 p-4' : ''}>
        <div className={`relative overflow-hidden ${compact ? 'h-30 w-24 shrink-0 rounded-[20px]' : 'h-84'}`}>
          {imageFailed ? (
            <div className="flex h-full w-full items-center justify-center bg-slate-200 px-4 text-center text-sm font-medium text-slate-500">
              Gafflo room preview
            </div>
          ) : (
            <img
              src={room.images[0]}
              alt={room.title}
              className="h-full w-full object-cover transition duration-500 hover:scale-[1.03]"
              onError={() => setImageFailed(true)}
            />
          )}
          {!compact ? (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/18 to-transparent" />
              <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                <MatchBadge score={room.match.score} />
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-950/50 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    1 / {room.images.length}
                  </span>
                  <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
                    {room.billsIncluded ? 'Bills included' : 'Bills separate'}
                  </span>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                <h3 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-tight">{room.title}</h3>
                <p className="mt-1 text-sm text-slate-200">
                  {room.area}, {room.city}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className={compact ? 'min-w-0 flex-1' : 'space-y-4 p-5'}>
          {compact ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2">
                    <MatchBadge score={room.match.score} />
                  </div>
                  <h3 className="truncate text-lg font-semibold tracking-tight text-slate-900">{room.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {room.area}, {room.city}
                  </p>
                </div>
                <Link
                  to={`/rooms/${room.id}`}
                  state={{ backgroundLocation: location }}
                  className="surface-line rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Details
                </Link>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">{formatCurrency(room.rent)}/mo</div>
                <div className="text-xs text-slate-500">{room.roomType}</div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                <InfoStat label="Rent" value={`${formatCurrency(room.rent)}/mo`} />
                <InfoStat label="Available" value={formatDate(room.availableFrom)} />
                <InfoStat label="Deposit" value={formatCurrency(room.deposit)} />
                <InfoStat label="House vibe" value={room.lifestyle} />
              </div>

              <p className="text-sm leading-7 text-slate-600">{room.description}</p>

              <div className="flex flex-wrap gap-2">
                {room.features.slice(0, 4).map((feature) => (
                  <span key={feature} className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-orange-100">
                    {feature}
                  </span>
                ))}
              </div>

              <div className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Why this room matches</p>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-emerald-900">
                  {room.match.reasons.slice(0, 3).map((reason) => (
                    <li key={reason} className="flex items-start gap-2">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {children ? <div className={compact ? 'mt-4' : ''}>{children}</div> : null}
        </div>
      </div>
    </article>
  )
}

function InfoStat({ label, value }) {
  return (
    <div className="surface-line rounded-[20px] bg-slate-50/78 px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{value}</div>
    </div>
  )
}
