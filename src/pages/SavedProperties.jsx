import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ApplicationStatus, { ApplicationStatusPill } from '../components/ApplicationStatus'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import MatchBadge from '../components/MatchBadge'
import { domainLabel } from '../config/domainOptions'
import { isRoomListing, LISTING_CATEGORIES, listingCategoryLabel } from '../config/listingCategories'
import useAppState from '../context/useAppState'
import { formatDate } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatCurrency'

export default function SavedProperties() {
  const navigate = useNavigate()
  const { createEnquiry, savedProperties, removeSavedProperty, tenantEnquiries, toast, dismissToast } = useAppState()
  const [imageFailures, setImageFailures] = useState({})

  const sortedSavedProperties = useMemo(
    () => [...savedProperties].sort((a, b) => b.match.score - a.match.score),
    [savedProperties],
  )
  const bestMatch = sortedSavedProperties[0]
  const averageRent = sortedSavedProperties.length
    ? Math.round(sortedSavedProperties.reduce((total, property) => total + property.rent, 0) / sortedSavedProperties.length)
    : 0
  const openEnquiry = (propertyId) => {
    const conversationId = createEnquiry(propertyId)
    if (conversationId) navigate(`/messages/${conversationId}`)
  }

  useEffect(() => {
    if (!toast) return undefined

    const timeoutId = window.setTimeout(() => {
      dismissToast()
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [toast, dismissToast])

  if (!sortedSavedProperties.length) {
    return (
      <div className="mx-auto w-full max-w-[480px]">
        <EmptyState
          eyebrow="Saved properties"
          title="Build your shortlist"
          description="Save properties from discovery and they’ll stay here on this device for quick review later."
          actions={
            <>
              <Button onClick={() => navigate('/properties')}>Browse properties</Button>
              <Button variant="secondary" onClick={() => navigate('/profile')}>
                Update profile
              </Button>
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="card-shadow rounded-[22px] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 text-sm font-medium text-emerald-900">
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" onClick={dismissToast} className="text-emerald-700 hover:text-emerald-800">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <section className="card-surface card-shadow overflow-hidden rounded-[30px]">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Saved properties</p>
          <h1 className="text-balance mt-2 text-3xl font-semibold tracking-tight">Your shortlist</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Compare saved properties, revisit match reasons and remove anything that no longer fits.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          <SummaryTile label="Saved" value={String(sortedSavedProperties.length)} />
          <SummaryTile label="Avg rent" value={`${formatCurrency(averageRent)}`} />
          <SummaryTile label="Best match" value={bestMatch ? `${bestMatch.match.score}%` : '-'} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {sortedSavedProperties.map((property) => {
          const imageFailed = Boolean(imageFailures[property.id])
          const enquiry = tenantEnquiries.find((item) => item.propertyId === property.id)
          const roomListing = isRoomListing(property.listingCategory)

          return (
            <article key={property.id} className="card-surface card-shadow overflow-hidden rounded-[30px]">
              <button
                type="button"
                onClick={() => navigate(`/properties/${property.id}`)}
                className="block w-full text-left"
              >
              <div className="relative h-62">
                {imageFailed ? (
                  <div className="flex h-full w-full items-center justify-center bg-slate-200 px-4 text-center text-sm font-medium text-slate-500">
                    Gafflo property preview
                  </div>
                ) : (
                  <img
                    src={property.images[0]}
                    alt={property.title}
                    className="h-full w-full object-cover"
                    onError={() => setImageFailures((current) => ({ ...current, [property.id]: true }))}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/18 to-transparent" />
                <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                  <MatchBadge score={property.match.score} />
                  <div className="flex flex-col items-end gap-2">
                    <span className="rounded-full bg-emerald-50/95 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-soft">
                      Saved
                    </span>
                    {enquiry ? <ApplicationStatusPill status={enquiry.status} /> : null}
                    <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
                      {listingCategoryLabel(property.listingCategory)}
                    </span>
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight">{property.title}</h2>
                  <p className="mt-1 text-sm text-slate-200">
                    {property.area}, {property.city}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <span>{formatCurrency(property.rent)}/mo</span>
                    <span className="h-1 w-1 rounded-full bg-white/70" />
                    <span>{formatDate(property.availableFrom)}</span>
                  </div>
                </div>
              </div>
              </button>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 min-[430px]:grid-cols-3">
                  {roomListing ? (
                    <>
                      <InfoTile label="Room" value={domainLabel('roomType', property.roomType)} />
                      <InfoTile label="Bathroom" value={domainLabel('bathroomArrangement', property.bathroomArrangement)} />
                      <InfoTile label="Bills" value={property.billsIncluded ? 'Included' : 'Separate'} />
                      <InfoTile label="Owner" value={property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 'Lives here' : 'Shared home'} />
                    </>
                  ) : (
                    <>
                      <InfoTile label="Home" value={`${property.bedrooms ? `${property.bedrooms} bed` : 'Studio'} ${domainLabel('propertyType', property.propertyType)}`} />
                      <InfoTile label="Deposit" value={formatCurrency(property.deposit)} />
                      <InfoTile label="Bills" value={property.billsIncluded ? 'Included' : 'Separate'} />
                    </>
                  )}
                  <InfoTile label="Furnished" value={domainLabel('furnished', property.furnished)} />
                  <InfoTile label="Available" value={formatDate(property.availableFrom)} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {property.features.slice(0, 3).map((feature) => (
                    <span key={feature} className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-indigo-100">
                      {feature}
                    </span>
                  ))}
                </div>

                {enquiry ? <ApplicationStatus enquiry={enquiry} compact /> : null}

                <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Top match reason</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-950">
                    {property.match.reasons[0] || 'Looks like a strong fit based on your profile.'}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Button
                    variant="dark"
                    onClick={() => navigate(`/properties/${property.id}`)}
                  >
                    Details
                  </Button>
                  {enquiry ? (
                    <Button variant="secondary" onClick={() => openEnquiry(property.id)}>
                      Open status
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    className="text-rose-600 hover:border-rose-100 hover:bg-rose-50"
                    onClick={() => removeSavedProperty(property.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function InfoTile({ label, value }) {
  return (
    <div className="surface-line min-w-0 rounded-[20px] bg-slate-50/78 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold leading-5 text-slate-700">{value}</div>
    </div>
  )
}

function SummaryTile({ label, value }) {
  return (
    <div className="rounded-[22px] bg-slate-50 px-3 py-3 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  )
}
