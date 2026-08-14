import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useAppState from '../context/useAppState'
import { canListingReceiveEnquiry } from '../config/rentalJourney'
import { formatDate } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatCurrency'
import ApplicationStatus from './ApplicationStatus'
import Button from './Button'
import EmptyState from './EmptyState'
import MatchBadge from './MatchBadge'
import TrustSummary from './TrustSummary'

export default function PropertyDetailsModal({ standalone = false }) {
  const { propertyId } = useParams()
  const { createEnquiry, properties, role, savedPropertyIds, saveProperty, removeSavedProperty, tenantEnquiries } = useAppState()
  const navigate = useNavigate()
  const property = useMemo(() => properties.find((item) => item.id === propertyId), [propertyId, properties])
  const fallbackRoute = role === 'landlord' ? '/properties' : '/discover'
  const close = useCallback(() => {
    if (window.history.state?.idx > 0) {
      navigate(-1)
    } else {
      navigate(fallbackRoute, { replace: true })
    }
  }, [fallbackRoute, navigate])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close])

  if (!property) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-[480px]">
          <EmptyState
            eyebrow="Property details"
            title="Property not available"
            description="This property could not be opened. It may have been removed or paused."
            actions={
              <>
                <Button onClick={() => navigate('/properties')}>Back to properties</Button>
                <Button variant="secondary" onClick={() => navigate('/discover')}>Smart Match</Button>
              </>
            }
          />
        </div>
      </div>
    )
  }

  const isSaved = savedPropertyIds.includes(property.id)
  const warnings = property.match.warnings || []
  const hardStops = property.match.hardStops || []
  const enquiry = tenantEnquiries.find((item) => item.propertyId === property.id)
  const canEnquire = canListingReceiveEnquiry(property)
  const handleEnquire = () => {
    if (!enquiry && !canEnquire) return
    const conversationId = createEnquiry(property.id)
    if (!conversationId) return
    navigate(`/messages/${conversationId}`)
  }

  return (
    <div className="fixed inset-0 z-50">
      {!standalone ? (
        <button
          type="button"
          aria-label="Close property details"
          className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
          onClick={close}
        />
      ) : null}

      <div
        className={`relative flex h-[100dvh] items-stretch justify-center ${standalone ? 'bg-slate-50' : 'p-0 md:p-6'}`}
      >
        <div
          className={`card-surface card-shadow relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white ${standalone ? 'max-w-4xl' : 'md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[32px]'}`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <PropertyImageGallery property={property} isSaved={isSaved} onClose={close} />

            <div className="space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] pt-4 md:px-6">
              <section className="card-surface card-shadow rounded-[26px] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500">{property.area}, {property.city}</p>
                    <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
                      {formatCurrency(property.rent)}
                      <span className="text-base font-medium text-slate-500"> / month</span>
                    </div>
                  </div>
                  <MatchBadge score={property.match.score} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <DetailTile label="Deposit" value={formatCurrency(property.deposit)} />
                  <DetailTile label="Bills" value={property.billsIncluded ? 'Included' : 'Separate'} />
                  <DetailTile label="Move-in" value={formatDate(property.availableFrom)} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <DetailTile label="Type" value={property.propertyType} />
                  <DetailTile label="Bedrooms" value={property.bedrooms ? `${property.bedrooms}` : 'Studio'} />
                </div>
              </section>

              <DetailSection title="About the property">
                <p className="text-sm leading-7 text-slate-600">{property.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {property.features.map((feature) => (
                    <span
                      key={feature}
                      className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-indigo-100"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </DetailSection>

              <DetailSection title="Listing terms">
                <div className="grid grid-cols-2 gap-3">
                  <DetailTile label="Occupancy" value={`Up to ${property.maxOccupants || 1}`} />
                  <DetailTile label="Minimum stay" value={`${property.minStayMonths} mo`} />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {property.listingTerms ||
                    `This listing is managed by ${property.ownerName}. Tenants should confirm viewing times, lease terms and required documents before applying.`}
                </p>
              </DetailSection>

              <DetailSection title="Property attributes">
                <div className="grid grid-cols-2 gap-3">
                  <DetailTile label="Furnished" value={property.furnished || 'Furnished'} />
                  <DetailTile label="Type" value={property.propertyType} />
                  <DetailTile label="Bedrooms" value={property.bedrooms ? `${property.bedrooms}` : 'Studio'} />
                  <DetailTile label="Bathrooms" value={`${property.bathrooms}`} />
                  <DetailTile label="Smoking" value={property.smokingAllowed} />
                  <DetailTile label="Pets" value={property.petsAllowed} />
                  <DetailTile label="Parking" value={property.parking} />
                  <DetailTile label="Viewing" value={property.viewingType} />
                </div>
              </DetailSection>

              <DetailSection title="Listing rules">
                <ul className="space-y-2 text-sm text-slate-600">
                  {(property.listingRules || []).map((rule) => (
                    <li key={rule} className="flex items-start gap-3 rounded-[18px] bg-slate-50/78 px-3 py-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </DetailSection>

              <section className="rounded-[22px] border border-emerald-100 bg-emerald-50/80 p-4">
                <p className="text-sm font-semibold text-emerald-950">Why this property fits you</p>
                <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                  {property.match.reasons.slice(0, 4).map((reason) => (
                    <li key={reason} className="flex items-start gap-2">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {hardStops.length ? (
                <section className="rounded-[22px] border border-rose-100 bg-rose-50/80 p-4">
                  <p className="text-sm font-semibold text-rose-800">Important mismatch</p>
                  <ul className="mt-3 space-y-2 text-sm text-rose-950">
                    {hardStops.map((stop) => (
                      <li key={stop}>{stop}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {warnings.length ? (
                <section className="rounded-[22px] border border-amber-100 bg-amber-50/80 p-4">
                  <p className="text-sm font-semibold text-amber-800">Things to consider</p>
                  <ul className="mt-3 space-y-2 text-sm text-amber-950">
                    {warnings.map((warning) => (
                      <li key={warning} className="flex items-start gap-2">
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-500" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {enquiry?.viewing?.status === 'viewing proposed' ? (
                <DetailSection title="Viewing proposed">
                  <p className="text-sm leading-6 text-slate-600">Choose a proposed slot in Messages to confirm a viewing.</p>
                </DetailSection>
              ) : null}
              {enquiry?.viewing?.status === 'viewing confirmed' ? (
                <section className="is-success-pulse rounded-[22px] border border-emerald-100 bg-emerald-50/85 p-4">
                  <p className="text-sm font-semibold text-emerald-950">Viewing confirmed</p>
                  <p className="mt-1 text-sm leading-6 text-emerald-800">
                    {enquiry.viewing.selectedSlot} · keep the conversation open for access details.
                  </p>
                </section>
              ) : null}

              {enquiry ? <ApplicationStatus enquiry={enquiry} /> : null}

              <TrustSummary property={property} />

              <SafetyActions />
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white/94 px-4 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3 backdrop-blur-xl md:px-6">
            {role === 'landlord' ? (
              <div className="grid grid-cols-[0.95fr_1.05fr] gap-3">
                <Button variant="secondary" onClick={() => navigate('/properties')}>Back to properties</Button>
                <Button variant="dark" onClick={() => navigate('/applicants')}>View applicants</Button>
              </div>
            ) : (
              <div className="grid grid-cols-[0.95fr_1.05fr] gap-3">
                <Button
                  variant={isSaved ? 'secondary' : 'primary'}
                  data-account-action="save-property"
                  onClick={() => (isSaved ? removeSavedProperty(property.id) : saveProperty(property.id))}
                >
                  {isSaved ? 'Remove saved' : 'Save property'}
                </Button>
                <Button
                  variant="dark"
                  data-account-action={enquiry ? 'open-message' : 'send-interest'}
                  disabled={!enquiry && !canEnquire}
                  onClick={handleEnquire}
                >
                  {enquiry ? 'Open enquiry' : canEnquire ? 'Interested' : 'Not accepting enquiries'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PropertyImageGallery({ property, isSaved, onClose }) {
  const images = property.images?.length ? property.images : ['']
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [failedImageIndexes, setFailedImageIndexes] = useState([])
  const [loadedImageIndexes, setLoadedImageIndexes] = useState([])
  const activeImage = images[selectedImageIndex] || images[0]
  const activeImageFailed = failedImageIndexes.includes(selectedImageIndex)
  const activeImageLoaded = loadedImageIndexes.includes(selectedImageIndex)

  return (
    <>
      <div className="relative h-[24rem] overflow-hidden bg-slate-200 md:h-[30rem]">
        {activeImageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-200 text-sm font-medium text-slate-500">
            Gafflo property preview
          </div>
        ) : (
          <>
            {!activeImageLoaded ? <div className="skeleton absolute inset-0" /> : null}
            <img
              src={activeImage}
              alt={`${property.title} image ${selectedImageIndex + 1}`}
              className={`h-full w-full object-cover transition-opacity duration-300 ${activeImageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onError={() =>
                setFailedImageIndexes((current) =>
                  current.includes(selectedImageIndex) ? current : [...current, selectedImageIndex],
                )
              }
              onLoad={() =>
                setLoadedImageIndexes((current) =>
                  current.includes(selectedImageIndex) ? current : [...current, selectedImageIndex],
                )
              }
            />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/88 via-slate-950/18 to-slate-950/18" />

        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.85rem)] md:px-5 md:pt-5">
          <div className="rounded-full bg-white/16 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md">
            {isSaved ? 'Saved property' : 'Property details'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 text-xl text-slate-800 shadow-soft backdrop-blur transition hover:bg-white"
            aria-label="Close property details"
          >
            ×
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 text-white md:p-5">
          <h2 className="text-balance text-[2rem] font-semibold leading-tight tracking-tight md:text-4xl">{property.title}</h2>
          <p className="mt-2 text-sm font-medium text-slate-200">
            {property.area}, {property.city}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {isSaved ? (
              <span className="rounded-full border border-emerald-200/40 bg-emerald-400/22 px-3 py-1.5 text-xs font-semibold text-emerald-50 backdrop-blur-sm">
                Saved
              </span>
            ) : null}
            <span className="rounded-full border border-white/15 bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              {formatCurrency(property.rent)}/mo
            </span>
            <span className="rounded-full border border-white/15 bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              {property.billsIncluded ? 'Bills included' : 'Bills separate'}
            </span>
            <span className="rounded-full border border-white/15 bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              {formatDate(property.availableFrom)}
            </span>
          </div>
        </div>
      </div>

      {images.length > 1 ? (
        <div className="border-b border-slate-100 bg-white px-4 py-4 md:px-6">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {images.map((image, index) => {
              const thumbFailed = failedImageIndexes.includes(index)
              const thumbLoaded = loadedImageIndexes.includes(index)
              const isActive = selectedImageIndex === index

              return (
                <button
                  key={`${property.id}-thumb-${index}`}
                  type="button"
                  onClick={() => setSelectedImageIndex(index)}
                  aria-label={`Show image ${index + 1} for ${property.title}`}
                  className={`relative h-18 w-20 shrink-0 overflow-hidden rounded-[18px] border transition ${
                    isActive ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
                  }`}
                >
                  {thumbFailed ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-200 text-[11px] font-medium text-slate-500">
                      Image
                    </div>
                  ) : (
                    <>
                      {!thumbLoaded ? <div className="skeleton absolute inset-0" /> : null}
                      <img
                        src={image}
                        alt={`${property.title} thumbnail ${index + 1}`}
                        className={`h-full w-full object-cover transition-opacity duration-300 ${thumbLoaded ? 'opacity-100' : 'opacity-0'}`}
                        onError={() =>
                          setFailedImageIndexes((current) =>
                            current.includes(index) ? current : [...current, index],
                          )
                        }
                        onLoad={() =>
                          setLoadedImageIndexes((current) =>
                            current.includes(index) ? current : [...current, index],
                          )
                        }
                      />
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </>
  )
}

function SafetyActions() {
  return (
    <details className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100">
        Safety and reporting
      </summary>
      <div className="mt-3 grid gap-2 min-[380px]:grid-cols-3">
        <Button variant="secondary">Report listing</Button>
        <Button variant="secondary">Report landlord</Button>
        <Button variant="secondary">Block user</Button>
      </div>
    </details>
  )
}

function DetailSection({ title, children }) {
  return (
    <section className="card-surface card-shadow rounded-[26px] p-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function DetailTile({ label, value }) {
  return (
    <div className="surface-line min-w-0 rounded-[20px] bg-slate-50/78 px-3 py-3">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
