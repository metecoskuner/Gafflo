import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import PricingEntryCard from '../components/PricingEntryCard'
import { domainLabel } from '../config/domainOptions'
import { isRoomListing, listingCategoryLabel, LISTING_CATEGORIES } from '../config/listingCategories'
import { getActiveListingAllowance } from '../config/entitlements'
import { getListingActions, listingStatusLabels } from '../config/listingLifecycle'
import { getLandlordPlanConfig, getListingProductConfig, LANDLORD_PLAN, LISTING_PRODUCT } from '../config/pricingPlans'
import { canBoostListing } from '../config/promotion'
import useAppState from '../context/useAppState'
import useApplications from '../context/useApplications'
import useListingAnalytics from '../context/useListingAnalytics'
import useListings from '../context/useListings'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

const statusTabs = ['published', 'pending_verification', 'draft', 'paused', 'rejected', 'rented']

// One clear primary action per lifecycle stage — everything else is secondary context, not a
// wall of equally-weighted buttons. Lifecycle transition rules themselves are unchanged; this
// only decides which already-valid action is presented as the primary one.
const listingActionPlan = {
  draft: { primaryKey: 'edit', primaryLabel: 'Continue editing', secondaryKeys: ['pending_verification'] },
  pending_verification: { primaryKey: 'preview', primaryLabel: 'Preview', secondaryKeys: [] },
  published: { primaryKey: 'applicants', primaryLabel: 'Applicants', secondaryKeys: ['preview', 'edit', 'paused', 'rented'] },
  active: { primaryKey: 'applicants', primaryLabel: 'Applicants', secondaryKeys: ['preview', 'edit', 'paused', 'rented'] },
  paused: { primaryKey: 'published', primaryLabel: 'Resume', secondaryKeys: ['preview', 'edit', 'rented'] },
  rented: { primaryKey: 'preview', primaryLabel: 'View history', secondaryKeys: [] },
  rejected: { primaryKey: 'edit', primaryLabel: 'Continue editing', secondaryKeys: ['pending_verification'] },
}

function getListingActionPlan(status) {
  return listingActionPlan[status] || { primaryKey: 'preview', primaryLabel: 'Preview', secondaryKeys: [] }
}

export default function LandlordProperties() {
  const navigate = useNavigate()
  const { landlordPlan, landlordProperties } = useAppState()
  const { markRented, pauseListing, requestReview, resumeListing } = useListings()
  const { landlordApplications } = useApplications()
  const { getAnalyticsForListing, refreshListingAnalytics } = useListingAnalytics()
  const [allowanceBlock, setAllowanceBlock] = useState(null)
  const [boostPreview, setBoostPreview] = useState(null)
  const [actionError, setActionError] = useState('')
  const [pendingPropertyId, setPendingPropertyId] = useState(null)
  const counts = useMemo(
    () =>
      statusTabs.reduce((acc, status) => {
        acc[status] = landlordProperties.filter((property) =>
          status === 'published'
            ? ['published', 'active'].includes(property.listingStatus)
            : property.listingStatus === status,
        ).length
        return acc
      }, {}),
    [landlordProperties],
  )

  useEffect(() => {
    refreshListingAnalytics()
  }, [refreshListingAnalytics])

  if (!landlordProperties.length) {
    return (
      <EmptyState
        eyebrow="Properties"
        title="Create your first listing"
        description="Add a property to manage listing status, applicants and conversations."
        actions={<Button onClick={() => navigate('/listings/new')}>Create property</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <section className="card-surface card-shadow rounded-[30px] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">My properties</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Properties</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Manage listing status, applicant activity and conversations.</p>
          </div>
          <Button onClick={() => navigate('/listings/new')}>Create</Button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 md:grid-cols-6">
          {statusTabs.map((status) => (
            <div key={status} className="rounded-[20px] bg-slate-50 px-3 py-3 text-center">
              <div className="text-base font-semibold text-slate-950">{counts[status] || 0}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{listingStatusLabels[status]}</div>
            </div>
          ))}
        </div>
      </section>

      {actionError ? (
        <div className="rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</div>
      ) : null}

      <section className="grid gap-4">
        {landlordProperties.map((property) => {
          const roomListing = isRoomListing(property.listingCategory)
          const plan = getListingActionPlan(property.listingStatus)
          const transitions = getListingActions(property.listingStatus)
          const isPending = pendingPropertyId === property.id
          const analytics = getAnalyticsForListing(property.id)
          // Real applications only (Stage D) — a draft/paused/rejected listing can never actually
          // have one (create_application() requires status = 'published'), so this is always 0
          // for those, never a fabricated count.
          const applicantCount = landlordApplications.filter((application) => application.propertyId === property.id).length
          // Free-plan active-listing allowance is a frontend-only soft gate today — the backend
          // resume_listing() RPC deliberately defers real enforcement to a future payments/
          // entitlements phase (see its migration comment) — so this pre-check still only
          // narrows what the UI offers before ever calling the real RPC, never replaces it.
          const runTransition = async (status) => {
            if (status === 'published') {
              const allowance = getActiveListingAllowance(landlordPlan)
              const activeCount = landlordProperties.filter(
                (item) => item.id !== property.id && ['published', 'active'].includes(item.listingStatus),
              ).length
              if (activeCount >= allowance) {
                setAllowanceBlock({ allowance, activeCount })
                return
              }
            }
            setActionError('')
            setPendingPropertyId(property.id)
            const action =
              status === 'pending_verification' ? requestReview
                : status === 'published' ? resumeListing
                  : status === 'paused' ? pauseListing
                    : status === 'rented' ? markRented
                      : null
            const { error } = action ? await action(property.id) : { error: null }
            setPendingPropertyId(null)
            if (error) setActionError(error)
          }
          const renderAction = (key, isPrimary) => {
            if (key === 'preview') {
              return (
                <Button key={key} variant={isPrimary ? 'dark' : 'secondary'} onClick={() => navigate(`/properties/${property.id}`)}>
                  {isPrimary ? plan.primaryLabel : 'Preview'}
                </Button>
              )
            }
            if (key === 'edit') {
              return (
                <Button key={key} variant={isPrimary ? 'dark' : 'secondary'} onClick={() => navigate(`/listings/${property.id}/edit`)}>
                  {isPrimary ? plan.primaryLabel : 'Edit'}
                </Button>
              )
            }
            if (key === 'applicants') {
              return (
                <Button key={key} variant={isPrimary ? 'dark' : 'secondary'} onClick={() => navigate(`/applicants?property=${encodeURIComponent(property.id)}`)}>
                  {isPrimary ? plan.primaryLabel : 'Applicants'}
                </Button>
              )
            }
            const transition = transitions.find((action) => action.status === key)
            if (!transition) return null
            // Only the single primary action gets the dark/prominent treatment. A destructive
            // secondary action (e.g. Mark rented) is flagged with cautionary colour, not with
            // the same visual weight as the primary action — one clear "main" button per card.
            const destructiveSecondaryClass = !isPrimary && transition.destructive ? 'border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50' : ''
            return (
              <Button
                key={key}
                variant={isPrimary ? 'dark' : 'secondary'}
                className={destructiveSecondaryClass}
                disabled={isPending}
                isLoading={isPending}
                onClick={() => runTransition(transition.status)}
              >
                {isPrimary ? plan.primaryLabel : transition.label}
              </Button>
            )
          }
          return (
            <article key={property.id} className="card-surface card-shadow overflow-hidden rounded-[30px]">
              <div className="grid md:grid-cols-[12rem_1fr]">
                <div className="h-48 bg-slate-200 md:h-full">
                  <ListingImage src={property.images[0]} alt={property.title} />
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {listingStatusLabels[property.listingStatus] || property.listingStatus}
                        </span>
                        {['published', 'active'].includes(property.listingStatus) ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {applicantCount} applicant{applicantCount === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{property.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {property.area}, {property.city} · {property.rent != null ? `${formatCurrency(property.rent)}/mo` : 'Rent not set'} · available {formatDate(property.availableFrom)}
                      </p>
                    </div>
                  </div>
                  {property.listingStatus === 'rejected' && property.rejectionReason ? (
                    <div className="rounded-[18px] border border-rose-100 bg-rose-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-600">Rejected — reason given</p>
                      <p className="mt-1 text-sm leading-6 text-rose-800">{property.rejectionReason}</p>
                    </div>
                  ) : null}
                  {property.listingStatus === 'removed_by_platform' && property.removedReason ? (
                    <div className="rounded-[18px] border border-rose-100 bg-rose-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-600">Removed — reason given</p>
                      <p className="mt-1 text-sm leading-6 text-rose-800">{property.removedReason}</p>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-3">
                    <Info label="Category" value={listingCategoryLabel(property.listingCategory)} />
                    <Info label={roomListing ? 'Room' : 'Home'} value={roomListing ? domainLabel('roomType', property.roomType) : `${property.bedrooms ? `${property.bedrooms} bed` : 'Studio'} ${domainLabel('propertyType', property.propertyType)}`} />
                    {roomListing ? (
                      <Info label="Owner" value={property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 'Lives here' : 'Not present'} />
                    ) : (
                      <Info label="Viewing" value={property.viewingType} />
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Listing performance</p>
                    <div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-3 md:grid-cols-5">
                      <Info label="Views" value={`${analytics.uniqueViews}`} />
                      <Info label="Saves" value={`${analytics.saves}`} />
                      <Info label="Apps" value={`${analytics.applications}`} />
                      <Info label="Enquiries" value={`${analytics.enquiries}`} />
                      <Info label="Viewings" value={`${analytics.confirmedViewings}`} />
                    </div>
                  </div>
                  <div className="grid gap-2 min-[380px]:grid-cols-2 md:grid-cols-3">
                    {renderAction(plan.primaryKey, true)}
                    {plan.secondaryKeys.map((key) => renderAction(key, false))}
                    {canBoostListing(property) ? (
                      <Button variant="secondary" onClick={() => setBoostPreview(property)}>Boost listing</Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </section>

      {allowanceBlock ? (
        <ListingAllowanceSheet
          activeCount={allowanceBlock.activeCount}
          allowance={allowanceBlock.allowance}
          onClose={() => setAllowanceBlock(null)}
        />
      ) : null}

      {boostPreview ? <BoostPreviewSheet property={boostPreview} onClose={() => setBoostPreview(null)} /> : null}
    </div>
  )
}

function ListingAllowanceSheet({ activeCount, allowance, onClose }) {
  const landlordPlus = getLandlordPlanConfig(LANDLORD_PLAN.LANDLORD_PLUS)
  const singleListingPlus = getListingProductConfig(LISTING_PRODUCT.SINGLE_LISTING_PLUS)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-allowance-title"
        className="card-shadow relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-y-auto rounded-t-[28px] bg-white p-5 md:max-h-[85vh] md:max-w-md md:rounded-[28px]"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Active listing limit</p>
        <h2 id="listing-allowance-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
          You&rsquo;re at your active listing limit
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your plan allows {allowance} active listing{allowance === 1 ? '' : 's'}, and you currently have {activeCount}. Pause another
          listing to free up a slot, or choose one of the options below.
        </p>
        <div className="mt-4 space-y-3">
          <PricingEntryCard
            eyebrow="One listing"
            name={singleListingPlus.name}
            priceMonthly={singleListingPlus.price}
            priceUnit={`per ${singleListingPlus.unit}, one-off`}
            tagline="For a private landlord with just one vacancy to fill right now."
            features={singleListingPlus.features}
          />
          <PricingEntryCard
            eyebrow="Multiple listings"
            name={landlordPlus.name}
            priceMonthly={landlordPlus.priceMonthly}
            tagline="More active listings for your properties, ongoing."
            features={landlordPlus.features}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">Payments aren&rsquo;t available yet — these are shown for planning, not purchase.</p>
        <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

// Boost is informational only — there is no payment provider connected yet, so this can never
// activate a promotion, mutate property.promotion, or imply a purchase succeeded.
function BoostPreviewSheet({ property, onClose }) {
  const boost = getListingProductConfig(LISTING_PRODUCT.BOOST)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="boost-preview-title"
        className="card-shadow relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-y-auto rounded-t-[28px] bg-white p-5 md:max-h-[85vh] md:max-w-md md:rounded-[28px]"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Boost this listing</p>
        <h2 id="boost-preview-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{property.title}</h2>
        <div className="mt-3 inline-flex items-baseline gap-1.5 rounded-full bg-[var(--gafflo-brand-ink)] px-4 py-2 text-white">
          <span className="text-base font-semibold tracking-tight">€{boost.price.toFixed(2)}</span>
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-200">/ {boost.unit}</span>
        </div>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-emerald-600">✓</span>
            <span>More visibility in relevant Browse results for 7 days.</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-emerald-600">✓</span>
            <span>Clearly labelled &ldquo;Promoted&rdquo; to tenants — never disguised as a better match.</span>
          </li>
        </ul>
        <p className="mt-4 rounded-[18px] border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs leading-5 text-indigo-900">
          You can pay for exposure. You cannot pay for compatibility. Boost never changes Rental Fit or Smart Match
          scores, and never bypasses a tenant&rsquo;s filters.
        </p>
        <button
          type="button"
          disabled
          aria-label={`Boost coming soon — €${boost.price.toFixed(2)} per ${boost.unit}`}
          className="mt-4 flex min-h-12 w-full cursor-not-allowed items-center justify-between rounded-2xl bg-[var(--gafflo-brand-ink)] px-5 py-3 text-white opacity-60"
        >
          <span className="text-sm font-semibold">€{boost.price.toFixed(2)} / {boost.unit}</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.06em]">Coming soon</span>
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">Payments aren&rsquo;t available yet.</p>
        <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="surface-line rounded-[18px] bg-slate-50/78 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function ListingImage({ alt, src }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)

  if (hasFailed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 px-4 text-center text-sm font-medium text-slate-500">
        Gafflo property preview
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {!isLoaded ? <div className="skeleton absolute inset-0" /> : null}
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        onError={() => setHasFailed(true)}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  )
}
