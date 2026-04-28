import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import MatchBadge from '../components/MatchBadge'
import RoomCard from '../components/RoomCard'
import useAppState from '../context/useAppState'

const highlights = [
  {
    title: 'Create your renter profile',
    body: 'Set your city, budget, preferred areas, move-in date and house style once.',
  },
  {
    title: 'Swipe through compatible rooms',
    body: 'Review room cards ranked by fit instead of scanning endless generic listings.',
  },
  {
    title: 'Save your favourites',
    body: 'Keep the strongest options together and revisit why each one fits.',
  },
]

const reasons = [
  'Compatibility-first room discovery',
  'Built for Ireland’s rental market',
  'Mobile-first and simple to use',
]

export default function Home() {
  const navigate = useNavigate()
  const { availableRooms, savedRooms, tenantProfile } = useAppState()
  const featuredRooms = [...availableRooms].sort((a, b) => b.match.score - a.match.score).slice(0, 3)

  return (
    <div className="space-y-5 md:space-y-8">
      <section className="card-shadow overflow-hidden rounded-[34px] bg-slate-900 text-white">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.38),transparent_26%)] px-5 py-6 md:px-8 md:py-9">
          <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Gafflo
          </div>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Swipe rooms. Match smarter. Move better.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300 md:text-base">
            Gafflo helps renters in Ireland discover rooms that fit their budget, lifestyle and move-in date.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => navigate('/profile')}>Create your profile</Button>
            <Button variant="secondary" className="border-white/16 bg-white/8 text-white hover:bg-white/14" onClick={() => navigate('/rooms')}>
              Browse rooms
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Metric label="Active rooms" value={String(availableRooms.length)} />
            <Metric label="Saved" value={String(savedRooms.length)} />
            <Metric label="Profile" value={tenantProfile ? 'Ready' : 'Needed'} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="card-surface card-shadow rounded-[28px] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">How it works</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">A renter-first flow</h2>
            </div>
            <div className="hidden md:block">
              <MatchBadge score={tenantProfile ? 89 : 72} />
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {highlights.map((item, index) => (
              <div key={item.title} className="rounded-[24px] border border-orange-100 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-semibold text-emerald-700">
                    0{index + 1}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="card-surface card-shadow rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Why Gafflo</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Made for the Irish rental search</h2>
          <div className="mt-5 space-y-3">
            {reasons.map((reason) => (
              <div key={reason} className="rounded-[22px] bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                {reason}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-[24px] border border-emerald-100 bg-emerald-50/80 p-4">
            <p className="text-sm leading-6 text-emerald-950">
              This is a portfolio demo using mock data. No real rental listings or personal tenant documents are collected.
            </p>
          </div>
        </aside>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Preview rooms</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Top early matches</h2>
          </div>
          <Link to="/rooms" className="text-sm font-semibold text-emerald-600">
            See room stack
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {featuredRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
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
