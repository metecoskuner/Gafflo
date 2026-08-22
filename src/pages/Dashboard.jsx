import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import MatchBadge from '../components/MatchBadge'
import { filterConversationsByRole } from '../config/messageAdapter'
import { hasCoreMatchFacts } from '../config/rentalJourney'
import useAccountProfile from '../context/useAccountProfile'
import useAppState from '../context/useAppState'
import useApplications from '../context/useApplications'
import useMessaging from '../context/useMessaging'
import useViewings from '../context/useViewings'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate, formatViewingSlotDateTime, isFutureTimestamp } from '../utils/dateUtils'

export default function Dashboard() {
  const { activeRole: role } = useAccountProfile()
  return role === 'landlord' ? <LandlordDashboard /> : <TenantDashboard />
}

function TenantDashboard() {
  const navigate = useNavigate()
  const { activeProperties, properties, savedProperties, tenantProfile } = useAppState()
  const { tenantApplications } = useApplications()
  const { viewings } = useViewings()
  const topProperty = [...activeProperties].sort((a, b) => b.match.score - a.match.score)[0]

  // Only ever pending/confirmed (see config/viewingAdapter.js's "at most one open proposal per
  // application" invariant) — a declined/cancelled proposal's application has already reverted to
  // shortlisted, so there is nothing tenant-actionable left to surface for it here.
  const upcomingViewings = viewings
    .filter((viewing) => viewing.isTenant && (viewing.status === 'pending' || viewing.status === 'confirmed'))
    .map((viewing) => {
      const application = tenantApplications.find((item) => item.id === viewing.applicationId)
      const property = application ? properties.find((item) => item.id === application.propertyId) : null
      const whenIso = viewing.status === 'confirmed' ? viewing.acceptedSlot?.startsAt : viewing.slots[0]?.startsAt
      return { viewing, property, whenIso }
    })
    .filter((item) => item.property && item.whenIso)
    .sort((a, b) => new Date(a.whenIso).getTime() - new Date(b.whenIso).getTime())

  return (
    <div className="space-y-5">
      <section className="card-shadow overflow-hidden rounded-[34px] bg-[var(--gafflo-brand-ink)] px-5 py-6 text-white md:px-8 md:py-10">
        <BrandLogo size="sm" theme="dark" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Tenant dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">Find a place that fits the tenancy.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Compare listings by budget, location, move-in timing, rules and application readiness.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => navigate('/discover')}>Discover properties</Button>
          <Button variant="secondary" className="border-white/16 bg-white/8 text-white hover:bg-white/14" onClick={() => navigate('/profile')}>
            Update profile
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
        <Metric label="Active" value={String(activeProperties.length)} />
        <Metric label="Saved" value={String(savedProperties.length)} onClick={() => navigate('/saved')} />
        <Metric label="Applications" value={String(tenantApplications.length)} onClick={() => navigate('/applications')} />
      </section>

      {upcomingViewings.length ? (
        <section className="card-surface card-shadow rounded-[26px] p-5">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Upcoming viewings</h2>
          <div className="mt-3 grid gap-2">
            {upcomingViewings.map(({ viewing, property, whenIso }) => (
              <button
                key={viewing.id}
                type="button"
                onClick={() => navigate(`/properties/${property.id}`)}
                className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{property.title}</span>
                  <span className="block text-xs text-slate-500">
                    {viewing.status === 'confirmed' ? 'Confirmed · ' : 'Choose a time · '}
                    {formatViewingSlotDateTime(whenIso)}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-slate-400">→</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

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

      {!hasCoreMatchFacts(tenantProfile) ? (
        <section className="card-surface card-shadow rounded-[22px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-950">Make your matches more accurate</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Add your budget, move-in date and household size to sharpen your Rental Fit scores.
              </p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={() => navigate('/profile')}>
              Complete profile
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function LandlordDashboard() {
  const navigate = useNavigate()
  const { landlordProperties } = useAppState()
  const { landlordApplications } = useApplications()
  const { conversations } = useMessaging()
  const { viewings } = useViewings()
  const newInterest = landlordApplications.filter((application) => application.status === 'sent').length
  // Dual-role accounts have tenant-side conversations too (see the Stage E audit's inbox-scoping
  // fix in Messages.jsx) — landlord-side is scoped the same way here so a tenant-side unread
  // thread never inflates the landlord dashboard's count.
  const unreadMessages = filterConversationsByRole(conversations, 'landlord').filter((conversation) => conversation.unread).length
  const upcomingConfirmedViewings = viewings.filter(
    (viewing) => !viewing.isTenant && viewing.status === 'confirmed' && isFutureTimestamp(viewing.acceptedSlot?.startsAt),
  ).length

  return (
    <div className="space-y-5">
      <section className="card-shadow overflow-hidden rounded-[30px] bg-[var(--gafflo-brand-ink)] px-5 py-6 text-white md:px-8 md:py-9">
        <BrandLogo size="sm" theme="dark" />
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

      {!landlordProperties.length ? (
        <section className="card-surface card-shadow rounded-[22px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-950">Create your first listing</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Add a property to start receiving enquiries from renters.
              </p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={() => navigate('/listings/new')}>
              Create listing
            </Button>
          </div>
        </section>
      ) : null}

      <AttentionSummary
        newInterest={newInterest}
        unreadMessages={unreadMessages}
        upcomingConfirmedViewings={upcomingConfirmedViewings}
        onReviewApplicants={() => navigate('/applicants')}
        onOpenMessages={() => navigate('/messages')}
      />
    </div>
  )
}

// Applicants and unread messages are real (Stage D/E); upcoming confirmed viewings is real as of
// Stage F (context/ViewingsProvider) — see the Stage D pre-merge audit report for why mock
// versions of these were removed first, and the Stage E/F final reports for why real backend data
// makes each honest to restore.
function AttentionSummary({ newInterest, unreadMessages, upcomingConfirmedViewings, onReviewApplicants, onOpenMessages }) {
  const items = [
    newInterest > 0
      ? { key: 'applicants', label: `${newInterest} new applicant${newInterest === 1 ? '' : 's'}`, onClick: onReviewApplicants }
      : null,
    unreadMessages > 0
      ? { key: 'messages', label: `${unreadMessages} unread conversation${unreadMessages === 1 ? '' : 's'}`, onClick: onOpenMessages }
      : null,
    upcomingConfirmedViewings > 0
      ? { key: 'viewings', label: `${upcomingConfirmedViewings} upcoming viewing${upcomingConfirmedViewings === 1 ? '' : 's'}`, onClick: onReviewApplicants }
      : null,
  ].filter(Boolean)

  return (
    <section className="card-surface card-shadow rounded-[26px] p-5">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">What needs your attention</h2>
      {items.length ? (
        <div className="mt-3 grid gap-2">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
            >
              <span className="text-sm font-semibold text-slate-900">{item.label}</span>
              <span aria-hidden="true" className="text-slate-400">→</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-600">You&rsquo;re all caught up — nothing needs your attention right now.</p>
      )}
    </section>
  )
}

function Metric({ label, value, onClick, className = '' }) {
  const content = (
    <>
      <div className="break-words text-sm font-medium leading-5 text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
    </>
  )

  if (!onClick) {
    return <div className={`card-surface card-shadow min-w-0 rounded-[22px] px-4 py-4 ${className}`}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`card-surface card-shadow min-w-0 rounded-[22px] px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 ${className}`}
    >
      {content}
    </button>
  )
}
