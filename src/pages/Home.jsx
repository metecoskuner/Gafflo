import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import MatchBadge from '../components/MatchBadge'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

const howItWorks = [
  {
    title: 'Create your renter profile',
    body: 'Set your city, budget, preferred areas, move-in date and house style once.',
  },
  {
    title: 'Swipe compatible rooms',
    body: 'Review room cards ranked by fit instead of scanning endless generic listings.',
  },
  {
    title: 'Save your favourites',
    body: 'Keep the strongest options together and revisit why each one fits.',
  },
]

const benefits = [
  {
    title: 'Compatibility-first discovery',
    body: 'See room options ranked around lifestyle, move-in timing, budget and area fit.',
  },
  {
    title: 'Built for Ireland’s rental market',
    body: 'The flow reflects how renters actually search in Dublin and across Ireland.',
  },
  {
    title: 'Mobile-first experience',
    body: 'Shortlist rooms quickly on your phone without losing context or fit signals.',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const { availableRooms, savedRooms, tenantProfile } = useAppState()
  const heroRoom = [...availableRooms].sort((a, b) => b.match.score - a.match.score)[0]

  return (
    <div className="space-y-6 md:space-y-8">
      <section className="card-shadow overflow-hidden rounded-[34px] bg-slate-900 text-white">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.38),transparent_26%)] px-5 py-6 md:px-8 md:py-10">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="max-w-xl">
              <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
                Room matching for renters in Ireland
              </div>
              <h1 className="text-balance mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                Swipe rooms. Match smarter. Move better.
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">
                Gaffly helps renters in Ireland discover rooms that fit their budget, lifestyle and move-in date.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => navigate('/profile')}>Create your profile</Button>
                <Button
                  variant="secondary"
                  className="border-white/16 bg-white/8 text-white hover:bg-white/14"
                  onClick={() => navigate('/rooms')}
                >
                  Browse rooms
                </Button>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <Metric label="Active rooms" value={String(availableRooms.length)} />
                <Metric label="Saved" value={String(savedRooms.length)} />
                <Metric label="Profile" value={tenantProfile ? 'Ready' : 'Needed'} />
              </div>
            </div>

            <div className="mx-auto w-full max-w-sm lg:max-w-none">
              {heroRoom ? <HeroPreviewCard room={heroRoom} onBrowse={() => navigate('/rooms')} /> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="card-surface card-shadow rounded-[28px] px-5 py-6 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">The problem</p>
        <h2 className="text-balance mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">
          Finding a room in Ireland is stressful.
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Gaffly makes discovery faster, simpler and more personal. Instead of browsing endless generic listings,
          renters start with fit: budget, preferred area, move-in timing and house vibe.
        </p>
      </section>

      <section className="card-surface card-shadow rounded-[28px] p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">How it works</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">A faster renter flow</h2>
          </div>
          <div className="hidden md:block">
            <MatchBadge score={tenantProfile ? 89 : 72} />
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {howItWorks.map((item, index) => (
            <div key={item.title} className="surface-line rounded-[24px] bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-emerald-50 text-sm font-semibold text-emerald-700">
                0{index + 1}
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Why Gaffly</p>
          <h2 className="text-balance mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">
            Designed around compatibility, not listing overload.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {benefits.map((benefit, index) => (
            <article key={benefit.title} className="card-surface card-shadow rounded-[26px] p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-slate-900 text-sm font-semibold text-white">
                {index + 1}
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{benefit.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[26px] border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white px-5 py-5 md:px-6">
        <p className="text-sm leading-6 text-emerald-950">
          This is a portfolio demo using mock data. No real rental listings or personal tenant documents are collected.
        </p>
      </section>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[22px] bg-white/8 px-4 py-3 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-300">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}

function HeroPreviewCard({ room, onBrowse }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className="relative rounded-[30px] border border-white/10 bg-white/8 p-3 pt-16 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.55)] backdrop-blur-md md:pt-14">
      <div className="absolute left-3 top-3 hidden rounded-full bg-emerald-400/16 px-3 py-2 text-xs font-semibold text-emerald-100 ring-1 ring-white/10 lg:block">
        Profile-aware matching
      </div>
      <div className="absolute right-3 top-3 hidden rounded-full bg-white/12 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 lg:block">
        Shortlist faster
      </div>

      <div className="overflow-hidden rounded-[28px] bg-white text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Gaffly</div>
            <div className="text-xs text-slate-500">Today’s top room match</div>
          </div>
          <MatchBadge score={room.match.score} />
        </div>

        <div className="relative h-64">
          {imageFailed ? (
            <div className="flex h-full w-full items-center justify-center bg-slate-200 px-4 text-center text-sm font-medium text-slate-500">
              Gaffly room preview
            </div>
          ) : (
            <img
              src={room.images[0]}
              alt={room.title}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/84 via-slate-950/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <h3 className="text-balance text-2xl font-semibold leading-tight">{room.title}</h3>
            <p className="mt-1 text-sm text-slate-200">
              {room.area}, {room.city} · {formatCurrency(room.rent)}/mo
            </p>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <InfoTile label="Available" value={formatDate(room.availableFrom)} />
            <InfoTile label="House vibe" value={room.lifestyle} />
          </div>

          <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Why it matches</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-emerald-950">
              {room.match.reasons.slice(0, 2).map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button onClick={onBrowse} className="w-full">
            Browse rooms
          </Button>
        </div>
      </div>
    </div>
  )
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-[18px] bg-slate-50 px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{value}</div>
    </div>
  )
}
