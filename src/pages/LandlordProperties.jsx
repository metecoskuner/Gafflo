import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import PricingEntryCard from '../components/PricingEntryCard'
import { domainLabel } from '../config/domainOptions'
import { isRoomListing, listingCategoryLabel, LISTING_CATEGORIES } from '../config/listingCategories'
import { getListingActions, listingStatusLabels } from '../config/listingLifecycle'
import { getLandlordPlanConfig, LANDLORD_PLAN } from '../config/pricingPlans'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

const statusTabs = ['published', 'pending_verification', 'draft', 'paused', 'rejected', 'rented']

export default function LandlordProperties() {
  const navigate = useNavigate()
  const { landlordProperties, landlordEnquiries, updatePropertyStatus } = useAppState()
  const [allowanceBlock, setAllowanceBlock] = useState(null)
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

      <section className="grid gap-4">
        {landlordProperties.map((property) => {
          const applicantCount = landlordEnquiries.filter((enquiry) => enquiry.propertyId === property.id).length
          const actions = getPrimaryListingActions(property.listingStatus)
          const roomListing = isRoomListing(property.listingCategory)
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
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {applicantCount} applicants
                        </span>
                      </div>
                      <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{property.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {property.area}, {property.city} · {property.rent != null ? `${formatCurrency(property.rent)}/mo` : 'Rent not set'} · available {formatDate(property.availableFrom)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-3">
                    <Info label="Category" value={listingCategoryLabel(property.listingCategory)} />
                    <Info label={roomListing ? 'Room' : 'Home'} value={roomListing ? domainLabel('roomType', property.roomType) : `${property.bedrooms ? `${property.bedrooms} bed` : 'Studio'} ${domainLabel('propertyType', property.propertyType)}`} />
                    {roomListing ? (
                      <Info label="Owner" value={property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 'Lives here' : 'Not present'} />
                    ) : (
                      <Info label="Viewing" value={property.viewingType} />
                    )}
                  </div>
                  <div className="grid gap-2 min-[380px]:grid-cols-2 md:grid-cols-3">
                    {actions.includes('preview') ? <Button variant="secondary" onClick={() => navigate(`/properties/${property.id}`)}>Preview</Button> : null}
                    {actions.includes('edit') ? <Button variant="secondary" onClick={() => navigate(`/listings/${property.id}/edit`)}>Edit</Button> : null}
                    {getListingActions(property.listingStatus).filter((action) => actions.includes(action.status)).map((action) => (
                      <Button
                        key={action.status}
                        variant={action.destructive ? 'dark' : 'secondary'}
                        onClick={() => {
                          const result = updatePropertyStatus(property.id, action.status)
                          if (result && result.reason === 'allowance') setAllowanceBlock(result)
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                    {actions.includes('applicants') ? <Button variant="dark" onClick={() => navigate(`/applicants?property=${encodeURIComponent(property.id)}`)}>Applicants</Button> : null}
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
    </div>
  )
}

function ListingAllowanceSheet({ activeCount, allowance, onClose }) {
  const landlordPlus = getLandlordPlanConfig(LANDLORD_PLAN.LANDLORD_PLUS)

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
          listing to free up a slot, or upgrade for more active listings.
        </p>
        <div className="mt-4">
          <PricingEntryCard
            eyebrow="Upgrade"
            name={landlordPlus.name}
            priceMonthly={landlordPlus.priceMonthly}
            tagline="More active listings for your properties."
            features={landlordPlus.features}
          />
        </div>
        <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

function getPrimaryListingActions(status) {
  const normalized = status === 'active' ? 'published' : status
  const actionsByStatus = {
    draft: ['edit', 'pending_verification'],
    pending_verification: ['preview'],
    published: ['preview', 'edit', 'paused', 'applicants', 'rented'],
    paused: ['preview', 'edit', 'published', 'rented'],
    rented: ['preview'],
    rejected: ['edit', 'pending_verification'],
  }
  return actionsByStatus[normalized] || ['preview']
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
