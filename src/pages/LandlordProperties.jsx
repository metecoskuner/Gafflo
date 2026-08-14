import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

const statusTabs = ['published', 'pending_verification', 'draft', 'paused', 'rejected', 'rented']
const statusLabels = {
  published: 'Published',
  pending_verification: 'In review',
  draft: 'Draft',
  paused: 'Paused',
  rejected: 'Rejected',
  rented: 'Rented',
  active: 'Published',
}

export default function LandlordProperties() {
  const navigate = useNavigate()
  const { landlordProperties, landlordEnquiries, updatePropertyStatus } = useAppState()
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
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{statusLabels[status]}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        {landlordProperties.map((property) => {
          const applicantCount = landlordEnquiries.filter((enquiry) => enquiry.propertyId === property.id).length
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
                          {statusLabels[property.listingStatus] || property.listingStatus}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {applicantCount} applicants
                        </span>
                      </div>
                      <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{property.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {property.area}, {property.city} · {formatCurrency(property.rent)}/mo · available {formatDate(property.availableFrom)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Info label="Beds" value={String(property.bedrooms || 'Studio')} />
                    <Info label="Type" value={property.propertyType} />
                    <Info label="Viewing" value={property.viewingType} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <Button variant="secondary" onClick={() => navigate(`/properties/${property.id}`)}>Preview</Button>
                    <Button variant="secondary" onClick={() => navigate('/listings/new')}>Create another</Button>
                    <Button
                      variant="secondary"
                      disabled={property.listingStatus === 'pending_verification'}
                      onClick={() => updatePropertyStatus(property.id, 'pending_verification')}
                    >
                      Request review
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={property.listingStatus === 'paused'}
                      onClick={() => updatePropertyStatus(property.id, 'paused')}
                    >
                      Pause
                    </Button>
                    <Button variant="dark" onClick={() => navigate('/applicants')}>Applicants</Button>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </section>
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
