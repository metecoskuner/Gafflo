import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useAccountProfile from '../context/useAccountProfile'
import useAppState from '../context/useAppState'
import useApplications from '../context/useApplications'
import useListingAnalytics from '../context/useListingAnalytics'
import useMessaging from '../context/useMessaging'
import useViewings from '../context/useViewings'
import { domainLabel } from '../config/domainOptions'
import { isTerminalApplicationStatus } from '../config/applicationStatus'
import { friendlyWriteError } from '../config/devAuthBypass'
import { LISTING_CATEGORIES, isRoomListing, listingCategoryLabel } from '../config/listingCategories'
import { formatFreshness, shouldShowTenantMatch } from '../config/listingPresentation'
import { canListingReceiveEnquiry } from '../config/rentalJourney'
import { canViewListing, listingStatusLabels } from '../config/listingLifecycle'
import { LISTING_REPORT_REASONS } from '../config/listingReportsAdapter'
import { formatDate } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatCurrency'
import { sanitizeMessageBody } from '../utils/messagingRules'
import { reportListing as reportListingRequest } from '../services/listingReportsService'
import ApplicationStatus from './ApplicationStatus'
import Button from './Button'
import EmptyState from './EmptyState'
import MatchBadge from './MatchBadge'
import TrustSummary from './TrustSummary'

// previewProperty + onClose let a landlord preview an in-progress, unsaved listing draft exactly
// as CreateListing will pass it: real tenant-facing layout, no route, no persistence. Everything
// else (route-based lookup, access rules, application/messaging actions) is untouched for the
// normal case.
export default function PropertyDetailsModal({ standalone = false, previewProperty = null, onClose }) {
  const { propertyId } = useParams()
  const {
    properties,
    savedPropertyIds,
    saveProperty,
    removeSavedProperty,
  } = useAppState()
  const { getTenantApplicationForListing, applyToListing, withdraw } = useApplications()
  const { recordListingView } = useListingAnalytics()
  const { getConversationForListing, isUserBlocked, blockUser, startConversation } = useMessaging()
  const { getActiveViewing, acceptSlot, decline: declineViewing, cancel: cancelViewing } = useViewings()
  const { activeRole: role, profile } = useAccountProfile()
  const navigate = useNavigate()
  const routeProperty = useMemo(() => properties.find((item) => item.id === propertyId), [propertyId, properties])
  const property = previewProperty || routeProperty
  const fallbackRoute = role === 'landlord' ? '/properties' : '/discover'
  const close = useCallback(() => {
    if (previewProperty) {
      onClose?.()
      return
    }
    if (window.history.state?.idx > 0) {
      navigate(-1)
    } else {
      navigate(fallbackRoute, { replace: true })
    }
  }, [fallbackRoute, navigate, onClose, previewProperty])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close])

  // Keyed by propertyId rather than reset via an effect/ref: route param changes reuse this same
  // mounted instance rather than remounting (confirmed during Stage C), so a plain useState would
  // let a leftover apply error/pending flag from one property bleed into the next one navigated
  // to. Deriving applyPending/applyError below (ignoring stored state for any other propertyId)
  // keeps that reset purely a render-time derivation instead.
  const [applyState, setApplyState] = useState({ propertyId: null, pending: false, error: '' })
  const applyPending = applyState.propertyId === propertyId && applyState.pending
  const applyError = applyState.propertyId === propertyId ? applyState.error : ''

  // Same propertyId-keyed derivation as applyState above, for the same reason — this instance
  // is reused (not remounted) across a route param change.
  const [messageState, setMessageState] = useState({ propertyId: null, open: false, draft: '', pending: false, error: '' })
  const messageComposerOpen = messageState.propertyId === propertyId && messageState.open
  const messagePending = messageState.propertyId === propertyId && messageState.pending
  const messageError = messageState.propertyId === propertyId ? messageState.error : ''
  const messageDraft = messageState.propertyId === propertyId ? messageState.draft : ''

  const application = property && !previewProperty ? getTenantApplicationForListing(property.id) : null
  const activeViewing = application ? getActiveViewing(application.id) : null
  const existingConversation = property && !previewProperty ? getConversationForListing(property.id) : null
  const hasHistoricalRelationship =
    role === 'tenant' && (Boolean(application) || Boolean(existingConversation) || savedPropertyIds.includes(propertyId))
  // Real listing ownership (property.ownerId) is the real auth uuid (Stage C) — profile.id is
  // that same uuid (profiles.id = auth.users.id). canViewListing only ever reads viewerId for the
  // landlord/'own' branch below, so it's fine to pass it through unconditionally rather than
  // stamping in any fixture identity for the tenant case, which was never actually compared
  // against anything (Stage E retired the last of those fixture ids from real listing/messaging
  // surfaces — see the Stage E report).
  const access = previewProperty
    ? { allowed: true, mode: 'own' }
    : canViewListing({ role, viewerId: profile?.id, property, hasHistoricalRelationship })
  const recordedViewIds = useRef(new Set())

  useEffect(() => {
    if (previewProperty || !property?.id || !access.allowed || property.listingStatus !== 'published') return
    if (recordedViewIds.current.has(property.id)) return
    recordedViewIds.current.add(property.id)
    recordListingView(property.id)
  }, [access.allowed, previewProperty, property?.id, property?.listingStatus, recordListingView])

  if (!property || !access.allowed) {
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
  const isHistorical = access.mode === 'historical'
  const tenantContext = shouldShowTenantMatch(role)
  const warnings = tenantContext ? property.match.warnings || [] : []
  const hardStops = tenantContext ? property.match.hardStops || [] : []
  const canEnquire = canListingReceiveEnquiry(property)
  const roomListing = isRoomListing(property.listingCategory)
  const ownerOccupied = property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM
  const updated = formatFreshness(property.updatedAt)
  const availabilityConfirmed = formatFreshness(property.availabilityConfirmedAt, 'Availability confirmed')
  const applicationTerminal = Boolean(application) && isTerminalApplicationStatus(application.status)

  const handleApply = async () => {
    if (application || !canEnquire || applyPending) return
    setApplyState({ propertyId, pending: true, error: '' })
    const { error } = await applyToListing(property.id)
    setApplyState({ propertyId, pending: false, error: error ? friendlyWriteError(error) : '' })
  }

  const handleWithdraw = async () => {
    if (!application || applicationTerminal || applyPending) return
    setApplyState({ propertyId, pending: true, error: '' })
    const { error } = await withdraw(application.id)
    setApplyState({ propertyId, pending: false, error: error ? friendlyWriteError(error) : '' })
  }

  // Opening the composer never creates anything — start_conversation() only fires once the
  // tenant actually submits a real first message below, matching "a real user action must
  // initiate it."
  const openMessageComposer = () => setMessageState({ propertyId, open: true, draft: '', pending: false, error: '' })
  const closeMessageComposer = () => setMessageState({ propertyId, open: false, draft: '', pending: false, error: '' })

  const handleSendInitialMessage = async () => {
    const body = sanitizeMessageBody(messageDraft)
    if (!body || messagePending) return
    setMessageState({ propertyId, open: true, draft: messageDraft, pending: true, error: '' })
    const { conversationId, error } = await startConversation(property.id, body)
    if (error) {
      setMessageState({ propertyId, open: true, draft: messageDraft, pending: false, error: friendlyWriteError(error) })
      return
    }
    navigate(`/messages/${conversationId}`)
  }

  return (
    <div className="fixed inset-0 z-50 max-w-full overflow-x-hidden [touch-action:pan-y]">
      {!standalone ? (
        <button
          type="button"
          aria-label="Close property details"
          className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
          onClick={close}
        />
      ) : null}

      <div
        className={`relative flex h-[100dvh] max-w-full items-stretch justify-center overflow-x-hidden ${standalone ? 'bg-slate-50' : 'p-0 md:p-6'}`}
      >
        <div
          // The bare `max-w-4xl` this branch used to set here loses the cascade tie against the
          // base `max-w-full` a few classes earlier (both are unprefixed, same specificity, and
          // Tailwind's generated order between two bare max-w-* utilities isn't something to rely
          // on) — confirmed live: the standalone modal was rendering edge-to-edge at full
          // viewport width on desktop instead of capping at 4xl. `md:`-prefixed utilities always
          // cascade after their bare counterparts, which is exactly why the non-standalone branch
          // right after it was never affected by the same base class.
          className={`card-surface card-shadow relative flex h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-hidden bg-white ${standalone ? 'md:max-w-4xl' : 'md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[32px]'}`}
        >
          <div data-property-details-scroll className="min-h-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [touch-action:pan-y]">
            <PropertyImageGallery property={property} isSaved={isSaved} isPreview={Boolean(previewProperty)} onClose={close} />

            <div className="max-w-full space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom)+6.75rem)] pt-4 md:space-y-4 md:px-6">
              <section className="card-surface card-shadow rounded-[24px] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500">{property.area}, {property.city}</p>
                    <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
                      {formatCurrency(property.rent)}
                      <span className="text-base font-medium text-slate-500"> / month</span>
                    </div>
                  </div>
                  {tenantContext ? <MatchBadge score={property.match.score} /> : null}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <DetailTile label="Deposit" value={formatCurrency(property.deposit)} />
                  <DetailTile label="Bills" value={property.billsIncluded ? 'Included' : 'Separate'} />
                  <DetailTile label="Move-in" value={formatDate(property.availableFrom)} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <DetailTile label="Category" value={listingCategoryLabel(property.listingCategory)} />
                  <DetailTile label={roomListing ? 'Room' : 'Home'} value={roomListing ? domainLabel('roomType', property.roomType) : `${property.bedrooms ? `${property.bedrooms} bed` : 'Studio'} ${domainLabel('propertyType', property.propertyType)}`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ownerOccupied ? <Pill>Owner lives in the property</Pill> : null}
                  {updated ? <Pill>{updated}</Pill> : null}
                  {availabilityConfirmed ? <Pill>{availabilityConfirmed}</Pill> : null}
                </div>
              </section>

              {isHistorical ? (
                <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Listing no longer active</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    This listing is {(listingStatusLabels[property.listingStatus] || 'no longer active').toLowerCase()} and is no longer part of public discovery. You can still see it because of your saved property or application history.
                  </p>
                </section>
              ) : null}

              <DetailSection title={roomListing ? 'Room' : 'Overview'}>
                <p className="text-sm leading-7 text-slate-600">{property.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {property.features.slice(0, 5).map((feature) => (
                    <span
                      key={feature}
                      className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-indigo-100"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </DetailSection>

              {roomListing ? (
                <>
                  <DetailSection title="Shared home">
                    <div className="grid grid-cols-2 gap-3">
                      <DetailTile label="Type" value={domainLabel('roomParentPropertyType', property.parentPropertyType)} />
                      <DetailTile label="Total bedrooms" value={`${property.totalBedrooms || 1}`} />
                      <DetailTile label="Bathrooms" value={`${property.bathrooms}`} />
                      <DetailTile label="Owner occupied" value={ownerOccupied ? 'Owner lives here' : 'No'} />
                    </div>
                  </DetailSection>

                  <DetailSection title="Shared spaces">
                    <div className="grid grid-cols-2 gap-3">
                      <DetailTile label="Kitchen" value={property.sharedKitchen ? 'Shared' : 'Ask landlord'} />
                      <DetailTile label="Living area" value={property.sharedLivingRoom ? 'Shared' : 'Not listed'} />
                      <DetailTile label="Laundry" value={property.laundry ? 'Available' : 'Ask landlord'} />
                      <DetailTile label="Internet" value={property.internet ? 'Available' : 'Ask landlord'} />
                    </div>
                  </DetailSection>

                  <DetailSection title="Household">
                    <div className="grid grid-cols-2 gap-3">
                      <DetailTile label="Current household" value={`${property.currentHouseholdSize || 1}`} />
                      <DetailTile label="Max household" value={`${property.maxHouseholdSize || 2}`} />
                      <DetailTile label="Couples" value={property.couplesAccepted ? 'Accepted' : 'Not accepted'} />
                      <DetailTile label="Pets in home" value={property.petsInHome ? 'Yes' : 'No'} />
                    </div>
                    {property.householdSummary ? <p className="mt-3 text-sm leading-7 text-slate-600">{property.householdSummary}</p> : null}
                  </DetailSection>
                </>
              ) : (
                <DetailSection title="Amenities">
                  <div className="flex flex-wrap gap-2">
                    {(property.amenities || []).map((amenity) => (
                      <span key={amenity} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{amenity}</span>
                    ))}
                  </div>
                </DetailSection>
              )}

              <DetailSection title={roomListing ? 'Bills and stay' : 'Rent and lease'}>
                <div className="grid grid-cols-2 gap-3">
                  <DetailTile label="Occupancy" value={`Up to ${property.maxOccupants || 1}`} />
                  <DetailTile label="Minimum stay" value={`${property.minStayMonths} mo`} />
                  <DetailTile label="Internet" value={roomListing ? (property.internet ? 'Listed' : 'Ask landlord') : 'Ask landlord'} />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {property.listingTerms ||
                    // ownerName can genuinely be empty (e.g. the owner lookup itself failing
                    // gracefully — see ListingsProvider's Promise.allSettled handling) — a clean
                    // fallback beats rendering "managed by ." with a visible gap before the period.
                    `This listing is managed by ${property.ownerName || 'the landlord'}. Tenants should confirm viewing times, lease terms and required documents before applying.`}
                </p>
              </DetailSection>

              <DetailSection title={roomListing ? 'Rules' : 'Lease and rules'}>
                <div className="grid grid-cols-2 gap-3">
                  <DetailTile label="Furnished" value={domainLabel('furnished', property.furnished)} />
                  <DetailTile label="Smoking" value={domainLabel('smoking', property.smokingAllowed)} />
                  <DetailTile label="Pets" value={domainLabel('petPolicy', property.petsAllowed)} />
                  <DetailTile label="Parking" value={domainLabel('parking', property.parking)} />
                  <DetailTile label="Viewing" value={property.viewingType} />
                </div>
                <ul className="space-y-2 text-sm text-slate-600">
                  {(property.listingRules || []).map((rule) => (
                    <li key={rule} className="flex items-start gap-3 rounded-[18px] bg-slate-50/78 px-3 py-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </DetailSection>

              {tenantContext ? (
                <section className="rounded-[22px] border border-emerald-100 bg-emerald-50/80 p-4">
                  <p className="text-sm font-semibold text-emerald-950">Why this {roomListing ? 'room' : 'listing'} fits you</p>
                  <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                    {property.match.reasons.slice(0, 4).map((reason) => (
                      <li key={reason} className="flex items-start gap-2">
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

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

              {tenantContext && application ? (
                <ApplicationStatus
                  application={application}
                  viewing={activeViewing}
                  onAcceptSlot={(slotId) => acceptSlot(activeViewing.id, slotId)}
                  onDeclineViewing={() => declineViewing(activeViewing.id)}
                  onCancelViewing={() => cancelViewing(activeViewing.id)}
                />
              ) : null}
              {tenantContext && applyError ? (
                <p className="rounded-[18px] bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{applyError}</p>
              ) : null}

              <TrustSummary property={property} />

              <SafetyActions
                disabled={property.ownerId === profile?.id}
                alreadyBlocked={isUserBlocked(property.ownerId)}
                listingId={property.id}
                onBlock={() => blockUser(property.ownerId)}
              />
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white/94 px-4 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3 backdrop-blur-xl md:px-6">
            {previewProperty ? (
              <Button className="w-full" onClick={close}>Close preview</Button>
            ) : role === 'landlord' ? (
              <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-3">
                <Button variant="secondary" onClick={() => navigate('/properties')}>Back to properties</Button>
                <Button variant="dark" onClick={() => navigate(`/applicants?property=${encodeURIComponent(property.id)}`)}>View applicants</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {messageComposerOpen ? (
                  <div className="rounded-[20px] border border-slate-200 bg-white p-3">
                    <textarea
                      autoFocus
                      rows={3}
                      value={messageDraft}
                      onChange={(event) => setMessageState({ propertyId, open: true, draft: event.target.value, pending: false, error: '' })}
                      maxLength={1200}
                      placeholder="Write a message to the landlord"
                      className="w-full resize-none rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-200 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    />
                    {messageError ? <p className="mt-2 text-sm font-medium text-rose-600">{messageError}</p> : null}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={closeMessageComposer} disabled={messagePending}>Cancel</Button>
                      <Button variant="dark" onClick={handleSendInitialMessage} disabled={!messageDraft.trim() || messagePending}>
                        {messagePending ? 'Sending…' : 'Send'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-3">
                    <Button
                      variant={isSaved ? 'secondary' : 'primary'}
                      data-account-action="save-property"
                      onClick={() => (isSaved ? removeSavedProperty(property.id) : saveProperty(property.id))}
                    >
                      {isSaved ? 'Saved' : 'Save'}
                    </Button>
                    <Button
                      variant="dark"
                      data-account-action={application ? 'withdraw-application' : 'send-interest'}
                      disabled={(!application && !canEnquire) || applyPending || applicationTerminal}
                      onClick={application ? handleWithdraw : handleApply}
                    >
                      {applyPending
                        ? 'Please wait…'
                        : application
                          ? applicationTerminal
                            ? application.statusLabel
                            : 'Withdraw application'
                          : canEnquire
                            ? 'Apply'
                            : 'Closed'}
                    </Button>
                  </div>
                )}
                {!messageComposerOpen ? (
                  existingConversation ? (
                    <Button variant="secondary" className="w-full" data-account-action="open-message" onClick={() => navigate(`/messages/${existingConversation.id}`)}>
                      Open conversation
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="w-full"
                      data-account-action="message-landlord"
                      disabled={!canEnquire}
                      onClick={openMessageComposer}
                    >
                      Message landlord
                    </Button>
                  )
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PropertyImageGallery({ property, isSaved, isPreview, onClose }) {
  const images = property.images?.length ? property.images : ['']
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [failedImageIndexes, setFailedImageIndexes] = useState([])
  const [loadedImageIndexes, setLoadedImageIndexes] = useState([])
  const activeImage = images[selectedImageIndex] || images[0]
  const activeImageFailed = failedImageIndexes.includes(selectedImageIndex)
  const activeImageLoaded = loadedImageIndexes.includes(selectedImageIndex)

  return (
    <>
      <div className="relative h-[18rem] max-w-full overflow-hidden bg-slate-200 min-[390px]:h-[21rem] md:h-[25rem]">
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
            {isPreview ? 'Preview — how tenants will see this' : isSaved ? 'Saved property' : 'Property details'}
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
          <h2 className="text-balance text-[1.65rem] font-semibold leading-tight tracking-tight min-[390px]:text-[2rem] md:text-4xl">{property.title}</h2>
          <p className="mt-2 text-sm font-medium text-slate-200">
            {property.area}, {property.city}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {isSaved ? (
              <span className="rounded-full border border-emerald-200/40 bg-emerald-400/22 px-3 py-1.5 text-xs font-semibold text-emerald-50 backdrop-blur-sm">
                Saved
              </span>
            ) : null}
            {/* Bills/available-from used to repeat here too — removed: they're the very next
                thing visible, zero scroll away, in the fact tiles right below this image. Rent
                stays: unlike those two, it's genuinely useful while still browsing photos, before
                the price header below has scrolled into view. */}
            <span className="rounded-full border border-white/15 bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              {formatCurrency(property.rent)}/mo
            </span>
          </div>
        </div>
      </div>

      {images.length > 1 ? (
        <div className="max-w-full overflow-x-hidden border-b border-slate-100 bg-white px-4 py-4 md:px-6">
          <div className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 min-[390px]:gap-3">
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
                  className={`relative h-16 w-18 shrink-0 overflow-hidden rounded-[16px] border transition min-[390px]:h-18 min-[390px]:w-20 ${
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

function SafetyActions({ disabled, alreadyBlocked, listingId, onBlock }) {
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [reportPending, setReportPending] = useState(false)
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const [reportError, setReportError] = useState('')

  const submitReport = async () => {
    if (!reason) return
    setReportPending(true)
    setReportError('')
    try {
      await reportListingRequest(listingId, reason, description)
      // Whether this created a new report or the caller already had one open, the outcome the
      // user should see is the same real, honest confirmation — no public drama either way.
      setReportSubmitted(true)
    } catch {
      setReportError('Could not submit this report. Please try again.')
    } finally {
      setReportPending(false)
    }
  }

  return (
    <details className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100">
        Safety and reporting
      </summary>
      <div className="mt-3 grid min-w-0 gap-3">
        <p className="text-sm leading-6 text-slate-600">
          Reports go only to Gafflo — the landlord is never notified and never sees who reported a listing.
          Blocking applies to your real account and stops messaging both ways.
        </p>
        {reportSubmitted ? (
          <p className="rounded-[16px] bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Thanks — this listing has been reported.
          </p>
        ) : (
          <>
            <select
              value={reason}
              disabled={disabled || reportPending}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-11 w-full min-w-0 rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <option value="">Choose a report reason</option>
              {LISTING_REPORT_REASONS.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
            <textarea
              rows={2}
              value={description}
              disabled={disabled || reportPending}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              placeholder="Optional details"
              className="w-full min-w-0 resize-none rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100"
            />
            {reportError ? <p className="text-xs font-medium text-rose-500">{reportError}</p> : null}
          </>
        )}
        <div className="grid min-w-0 gap-2 min-[380px]:grid-cols-2">
          {!reportSubmitted ? (
            <Button variant="secondary" disabled={disabled || reportPending || !reason} isLoading={reportPending} onClick={submitReport}>
              Submit report
            </Button>
          ) : (
            <Button variant="secondary" disabled>Reported</Button>
          )}
          {alreadyBlocked ? (
            <Button variant="secondary" disabled>Blocked</Button>
          ) : confirmBlock ? (
            <Button variant="dark" disabled={disabled} onClick={() => { onBlock(); setConfirmBlock(false) }}>
              Confirm block
            </Button>
          ) : (
            <Button variant="secondary" disabled={disabled} onClick={() => setConfirmBlock(true)}>
              Block user
            </Button>
          )}
        </div>
      </div>
    </details>
  )
}

function DetailSection({ title, children }) {
  return (
    <section className="card-surface min-w-0 max-w-full rounded-[22px] p-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Pill({ children }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{children}</span>
}

function DetailTile({ label, value }) {
  return (
    <div className="surface-line min-w-0 max-w-full rounded-[20px] bg-slate-50/78 px-3 py-3">
      <div className="break-words text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 [overflow-wrap:anywhere] min-[390px]:text-[11px]">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold leading-5 text-slate-800">{value}</div>
    </div>
  )
}
