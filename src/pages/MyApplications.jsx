import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ApplicationStatus, { ApplicationStatusPill } from '../components/ApplicationStatus'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { isTerminalApplicationStatus } from '../config/applicationStatus'
import useAppState from '../context/useAppState'
import useApplications from '../context/useApplications'
import useViewings from '../context/useViewings'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

// Stage M — the tenant-facing home for "what's happening with my applications", which did not
// exist anywhere before this: tenantApplications was only ever read for a Dashboard count tile
// and for the subset of applications that also happen to be saved (SavedProperties.jsx). A
// tenant who applies without saving had no way to check status except navigating back to that
// exact listing. This page is deliberately read/status-focused, reusing ApplicationStatus exactly
// as PropertyDetailsModal already does — no new business logic, no new backend calls beyond what
// ApplicationsProvider/ViewingsProvider already expose.
export default function MyApplications() {
  const navigate = useNavigate()
  const { properties } = useAppState()
  const { tenantApplications, withdraw } = useApplications()
  const { getActiveViewing, acceptSlot, decline, cancel } = useViewings()
  const [pendingWithdrawId, setPendingWithdrawId] = useState(null)

  const sortedApplications = useMemo(
    () => [...tenantApplications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [tenantApplications],
  )

  if (!sortedApplications.length) {
    return (
      <div className="mx-auto w-full max-w-[480px]">
        <EmptyState
          eyebrow="Applications"
          title="No applications yet"
          description="Apply to a listing from its details page and it will show up here with real, up-to-date status."
          actions={<Button onClick={() => navigate('/discover')}>Discover properties</Button>}
        />
      </div>
    )
  }

  const handleWithdraw = async (applicationId) => {
    setPendingWithdrawId(applicationId)
    await withdraw(applicationId)
    setPendingWithdrawId(null)
  }

  return (
    <div className="space-y-4">
      <section className="card-surface card-shadow overflow-hidden rounded-[30px]">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Applications</p>
          <h1 className="text-balance mt-2 text-3xl font-semibold tracking-tight">Your applications</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Every application you've sent, with real status and what to do next.
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {sortedApplications.map((application) => {
          const property = properties.find((item) => item.id === application.propertyId)
          const activeViewing = getActiveViewing(application.id)
          const withdrawable = !isTerminalApplicationStatus(application.status)

          if (!property) {
            // A real edge case, not a bug: the listing was paused, rented, or removed since this
            // tenant applied (publicListings only ever contains status='published' rows), so it
            // no longer resolves — the application itself is still real and still shown honestly,
            // just without listing details that no longer exist to show.
            return (
              <article key={application.id} className="card-surface card-shadow rounded-[26px] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">This listing is no longer available</p>
                    <p className="mt-1 text-xs text-slate-500">Applied {formatDate(application.createdAt)}</p>
                  </div>
                  <ApplicationStatusPill status={application.status} />
                </div>
                {withdrawable ? (
                  <Button
                    variant="secondary"
                    className="mt-4 w-full"
                    disabled={pendingWithdrawId === application.id}
                    isLoading={pendingWithdrawId === application.id}
                    onClick={() => handleWithdraw(application.id)}
                  >
                    Withdraw application
                  </Button>
                ) : null}
              </article>
            )
          }

          return (
            <article key={application.id} className="card-surface card-shadow overflow-hidden rounded-[30px]">
              <button type="button" onClick={() => navigate(`/properties/${property.id}`)} className="block w-full text-left">
                <div className="relative h-48">
                  <img src={property.images[0]} alt={property.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-950/14 to-transparent" />
                  <div className="absolute inset-x-0 top-0 flex justify-end p-4">
                    <ApplicationStatusPill status={application.status} />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <h2 className="text-balance truncate text-xl font-semibold tracking-tight">{property.title}</h2>
                    <p className="mt-1 text-sm text-slate-200">{property.area}, {property.city}</p>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <span>{formatCurrency(property.rent)}/mo</span>
                      <span className="h-1 w-1 rounded-full bg-white/70" />
                      <span>Applied {formatDate(application.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </button>

              <div className="space-y-4 p-5">
                <ApplicationStatus
                  application={application}
                  viewing={activeViewing}
                  onAcceptSlot={(slotId) => acceptSlot(activeViewing.id, slotId)}
                  onDeclineViewing={() => decline(activeViewing.id)}
                  onCancelViewing={() => cancel(activeViewing.id)}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button variant="dark" onClick={() => navigate(`/properties/${property.id}`)}>
                    View listing
                  </Button>
                  {withdrawable ? (
                    <Button
                      variant="secondary"
                      className="text-rose-600 hover:border-rose-100 hover:bg-rose-50"
                      disabled={pendingWithdrawId === application.id}
                      isLoading={pendingWithdrawId === application.id}
                      onClick={() => handleWithdraw(application.id)}
                    >
                      Withdraw
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
