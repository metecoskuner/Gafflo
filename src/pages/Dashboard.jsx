import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import MatchBadge from '../components/MatchBadge'
import { getViewingRows } from '../config/rentalJourney'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

export default function Dashboard() {
  const { role } = useAppState()
  return role === 'landlord' ? <LandlordDashboard /> : <TenantDashboard />
}

function TenantDashboard() {
  const navigate = useNavigate()
  const { activeProperties, savedProperties, tenantEnquiries } = useAppState()
  const topProperty = [...activeProperties].sort((a, b) => b.match.score - a.match.score)[0]
  const viewings = getViewingRows(tenantEnquiries, 'tenant')

  return (
    <div className="space-y-5">
      <section className="card-shadow overflow-hidden rounded-[34px] bg-indigo-950 px-5 py-6 text-white md:px-8 md:py-10">
        <BrandLogo size="sm" textClassName="text-white" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Tenant dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">Find a home that fits the tenancy.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Compare Dublin listings by budget, location, move-in timing, rules and application readiness.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => navigate('/discover')}>Discover properties</Button>
          <Button variant="secondary" className="border-white/16 bg-white/8 text-white hover:bg-white/14" onClick={() => navigate('/profile')}>
            Update profile
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Metric label="Active" value={String(activeProperties.length)} />
        <Metric label="Saved" value={String(savedProperties.length)} />
        <Metric label="Enquiries" value={String(tenantEnquiries.length)} />
      </section>

      <UpcomingViewings rows={viewings} role="tenant" onOpenMessages={() => navigate('/messages')} />

      {topProperty ? (
        <section className="card-surface card-shadow overflow-hidden rounded-[30px]">
          <img src={topProperty.images[0]} alt={topProperty.title} className="h-64 w-full object-cover" />
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{topProperty.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {topProperty.area}, {topProperty.city} · {formatCurrency(topProperty.rent)}/mo · {formatDate(topProperty.availableFrom)}
                </p>
              </div>
              <MatchBadge score={topProperty.match.score} />
            </div>
            <p className="text-sm leading-7 text-slate-600">{topProperty.match.reasons[0]}</p>
            <Button onClick={() => navigate(`/properties/${topProperty.id}`)}>View top fit</Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function LandlordDashboard() {
  const navigate = useNavigate()
  const { conversations, landlordEnquiries, landlordProperties } = useAppState()
  const active = landlordProperties.filter((property) => ['published', 'active'].includes(property.listingStatus)).length
  const newInterest = landlordEnquiries.filter((enquiry) => enquiry.status === 'sent').length
  const shortlisted = landlordEnquiries.filter((enquiry) => enquiry.status === 'shortlisted').length
  const unreadMessages = conversations.filter((conversation) => conversation.unreadFor === 'landlord').length
  const viewings = landlordEnquiries.filter((enquiry) => ['viewing proposed', 'viewing confirmed'].includes(enquiry.viewing?.status)).length
  const viewingRows = getViewingRows(landlordEnquiries, 'landlord')

  return (
    <div className="space-y-5">
      <section className="card-shadow overflow-hidden rounded-[30px] bg-indigo-950 px-5 py-6 text-white md:px-8 md:py-9">
        <BrandLogo size="sm" textClassName="text-white" />
        <p className="mt-6 text-sm font-semibold text-emerald-200">Landlord home</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Your properties at a glance.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          See new interest, messages and viewings without digging through menus.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => navigate('/properties')}>Manage properties</Button>
          <Button variant="secondary" className="border-white/16 bg-white/8 text-white hover:bg-white/14" onClick={() => navigate('/applicants')}>
            Review applicants
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Metric label="Active properties" value={String(active)} />
        <Metric label="New interested tenants" value={String(newInterest)} />
        <Metric label="Shortlisted tenants" value={String(shortlisted)} />
        <Metric label="Unread messages" value={String(unreadMessages)} />
        <Metric label="Upcoming viewings" value={String(viewings)} className="col-span-2" />
      </section>

      <UpcomingViewings rows={viewingRows} role="landlord" onOpenMessages={() => navigate('/messages')} />

      <section className="card-surface card-shadow rounded-[26px] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">{newInterest} new interested tenants</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Start with the highest fit applicants and decide who to message or invite to a viewing.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            Ranked
          </span>
        </div>
        <Button className="mt-4 w-full" onClick={() => navigate('/applicants')}>Review applicants</Button>
      </section>
    </div>
  )
}

function Metric({ label, value, className = '' }) {
  return (
    <div className={`card-surface card-shadow rounded-[22px] px-4 py-4 ${className}`}>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
    </div>
  )
}

function UpcomingViewings({ rows, role, onOpenMessages }) {
  if (!rows.length) {
    return (
      <section className="card-surface card-shadow rounded-[24px] p-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Upcoming viewings</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Confirmed and proposed viewing times will appear here.</p>
      </section>
    )
  }

  return (
    <section className="card-surface card-shadow rounded-[24px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Upcoming viewings</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {role === 'tenant' ? 'Your proposed and confirmed viewing times.' : 'Viewing activity across your properties.'}
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">{rows.length}</span>
      </div>
      <div className="mt-4 grid gap-3">
        {rows.slice(0, 3).map((row) => (
          <article key={row.id} className="rounded-[20px] border border-slate-100 bg-slate-50/78 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-950">{row.property.title}</h3>
                <p className="mt-1 truncate text-sm text-slate-600">
                  {role === 'landlord' ? `${row.tenant.name || 'Tenant'} · ` : ''}
                  {row.property.area}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{row.slot}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
                {row.status}
              </span>
            </div>
          </article>
        ))}
      </div>
      <Button variant="secondary" className="mt-4 w-full" onClick={onOpenMessages}>Open messages</Button>
    </section>
  )
}
