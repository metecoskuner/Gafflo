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
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

export default function Dashboard() {
  const { activeRole: role } = useAccountProfile()
  return role === 'landlord' ? <LandlordDashboard /> : <TenantDashboard />
}

function TenantDashboard() {
  const navigate = useNavigate()
  const { activeProperties, savedProperties, tenantProfile } = useAppState()
  const { tenantApplications } = useApplications()
  const topProperty = [...activeProperties].sort((a, b) => b.match.score - a.match.score)[0]

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
        <Metric label="Saved" value={String(savedProperties.length)} />
        <Metric label="Applications" value={String(tenantApplications.length)} />
      </section>

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
  const { landlordApplications } = useApplications()
  const { conversations } = useMessaging()
  const newInterest = landlordApplications.filter((application) => application.status === 'sent').length
  // Dual-role accounts have tenant-side conversations too (see the Stage E audit's inbox-scoping
  // fix in Messages.jsx) — landlord-side is scoped the same way here so a tenant-side unread
  // thread never inflates the landlord dashboard's count.
  const unreadMessages = filterConversationsByRole(conversations, 'landlord').filter((conversation) => conversation.unread).length

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

      <AttentionSummary
        newInterest={newInterest}
        unreadMessages={unreadMessages}
        onReviewApplicants={() => navigate('/applicants')}
        onOpenMessages={() => navigate('/messages')}
      />
    </div>
  )
}

// Viewings deliberately has no entry here: it is not integrated yet (Stage F). Unread messages
// is real again as of Stage E (context/MessagingProvider), so it's back — see the Stage D
// pre-merge audit report for why it was removed when it was still mock-conversation-derived, and
// the Stage E final report for why real messaging data makes it honest to restore.
function AttentionSummary({ newInterest, unreadMessages, onReviewApplicants, onOpenMessages }) {
  const items = [
    newInterest > 0
      ? { key: 'applicants', label: `${newInterest} new applicant${newInterest === 1 ? '' : 's'}`, onClick: onReviewApplicants }
      : null,
    unreadMessages > 0
      ? { key: 'messages', label: `${unreadMessages} unread conversation${unreadMessages === 1 ? '' : 's'}`, onClick: onOpenMessages }
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

function Metric({ label, value, className = '' }) {
  return (
    <div className={`card-surface card-shadow min-w-0 rounded-[22px] px-4 py-4 ${className}`}>
      <div className="break-words text-sm font-medium leading-5 text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
    </div>
  )
}
