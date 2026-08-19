import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import GaffloPlusPreview from '../components/GaffloPlusPreview'
import MatchBadge from '../components/MatchBadge'
import { domainLabel } from '../config/domainOptions'
import { isRoomListing, LISTING_CATEGORIES } from '../config/listingCategories'
import { formatFreshness, getBrowseFacts, getSmartMatchFacts } from '../config/listingPresentation'
import { isListingPromoted, sortBySmartMatchScore, sortForBrowseExposure } from '../config/promotion'
import { getPrimaryTrustSignal, isNewProperty } from '../config/rentalJourney'
import useAppState from '../context/useAppState'
import useApplications from '../context/useApplications'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

const swipeThreshold = 105

export default function MarketplaceDiscover() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    activeFilterCount,
    activeProperties: allActiveProperties,
    discoveryProperties,
    availableProperties,
    recordSmartMatchInterest,
    passSmartMatchProperty,
    resetPropertyFilters,
    saveProperty,
    savedPropertyIds,
    smartMatchUsage,
    startOver,
  } = useAppState()
  const { getTenantApplicationForListing, applyToListing } = useApplications()
  const [viewMode, setViewMode] = useState('smart')
  const [leaving, setLeaving] = useState(null)
  const [savedPulseId, setSavedPulseId] = useState(null)
  const [showGaffloPlus, setShowGaffloPlus] = useState(false)
  // Smart Match ranking is compatibility-only — never sort this deck by exposure/boost.
  const rankedSmartMatches = useMemo(() => sortBySmartMatchScore(availableProperties), [availableProperties])
  // Browse may weight a paid boost's exposure; Rental Fit still decides order within each group.
  const browseProperties = useMemo(() => sortForBrowseExposure(discoveryProperties), [discoveryProperties])

  // "Interested" here means Apply (Stage D) — see the Stage D report's CTA audit. If the listing
  // was already applied to (e.g. resurfaced by "Start over", which resets dismissedPropertyIds),
  // this only records the local daily-usage/dismiss bookkeeping and never re-submits a duplicate
  // application; the real backend's unique(listing_id, tenant_id) constraint is never relied on
  // as the only guard against that from this surface.
  const handleInterest = async (propertyId) => {
    if (getTenantApplicationForListing(propertyId)) {
      recordSmartMatchInterest(propertyId)
      return
    }
    const { error } = await applyToListing(propertyId)
    if (!error) recordSmartMatchInterest(propertyId)
  }

  const handleBrowseCardAction = async (propertyId, hasApplication) => {
    if (hasApplication) {
      navigate(`/properties/${propertyId}`)
      return
    }
    await applyToListing(propertyId)
  }

  const activeProperties = viewMode === 'smart' ? rankedSmartMatches : browseProperties

  if (!activeProperties.length && viewMode === 'browse') {
    return (
      <EmptyState
        eyebrow={activeFilterCount ? 'No matching properties' : 'Browse'}
        title={activeFilterCount ? 'No properties match these filters.' : 'No published properties available.'}
        description="Reset filters or update your rental profile to widen the results."
        actions={
          <>
            <Button onClick={resetPropertyFilters}>Reset filters</Button>
            <Button variant="secondary" onClick={() => navigate('/profile')}>Update profile</Button>
          </>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <section className="card-surface card-shadow rounded-[26px] p-4 min-[390px]:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-600">Discover</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 min-[390px]:text-3xl">Smart Match</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ranked listings based on your rental profile.
            </p>
          </div>
          <div className="grid w-full shrink-0 grid-cols-2 rounded-full bg-slate-100 p-1 md:w-auto">
            {[
              ['smart', 'Smart Match'],
              ['browse', 'Browse'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`min-h-11 rounded-full px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 ${viewMode === mode ? 'bg-white text-slate-950 shadow-soft' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <UsageTile label="Cards today" value={smartMatchUsage.isLaunchFree ? 'Free' : `${smartMatchUsage.cardsRemaining} left`} />
          <UsageTile label="Interest" value={smartMatchUsage.isLaunchFree ? 'Free' : `${smartMatchUsage.interestsRemaining} left`} />
          <UsageTile label="Browse" value="Open" />
        </div>
      </section>

      {viewMode === 'smart' ? (
        <SmartMatchDeck
          key={`${location.key}-${rankedSmartMatches[0]?.id || 'empty'}`}
          properties={rankedSmartMatches}
          savedPropertyIds={savedPropertyIds}
          getTenantApplicationForListing={getTenantApplicationForListing}
          leaving={leaving}
          onDetails={(propertyId) => navigate(`/properties/${propertyId}`)}
          onInterest={handleInterest}
          onLeaving={setLeaving}
          onPass={passSmartMatchProperty}
          onResetFilters={resetPropertyFilters}
          onSave={(propertyId) => {
            saveProperty(propertyId)
            setSavedPulseId(propertyId)
            window.setTimeout(() => setSavedPulseId(null), 280)
          }}
          onBrowse={() => setViewMode('browse')}
          onReset={startOver}
          noFilterResults={activeFilterCount > 0 && discoveryProperties.length === 0}
          savedPulseId={savedPulseId}
          smartLimitReached={!smartMatchUsage.isLaunchFree && smartMatchUsage.cardsRemaining <= 0}
          interestLimitReached={!smartMatchUsage.isLaunchFree && smartMatchUsage.interestsRemaining <= 0}
          noActiveListings={allActiveProperties.length === 0}
          freePlanMessage={smartMatchUsage.access.freePlanMessage}
          onExploreGafflo={() => setShowGaffloPlus(true)}
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {browseProperties.map((property) => {
            const application = getTenantApplicationForListing(property.id)
            return (
              <PropertyBrowseCard
                key={property.id}
                property={property}
                isSaved={savedPropertyIds.includes(property.id)}
                applicationStatus={application?.statusLabel}
                onDetails={() => navigate(`/properties/${property.id}`)}
                onInterest={() => handleBrowseCardAction(property.id, Boolean(application))}
                onSave={() => saveProperty(property.id)}
              />
            )
          })}
        </section>
      )}

      {showGaffloPlus ? <GaffloPlusPreview onClose={() => setShowGaffloPlus(false)} /> : null}
    </div>
  )
}

function SmartMatchDeck({
  properties,
  savedPropertyIds,
  getTenantApplicationForListing,
  leaving,
  onBrowse,
  onDetails,
  onInterest,
  onLeaving,
  onPass,
  onReset,
  onResetFilters,
  onSave,
  noFilterResults,
  savedPulseId,
  smartLimitReached,
  interestLimitReached,
  noActiveListings,
  freePlanMessage,
  onExploreGafflo,
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const [dragIntent, setDragIntent] = useState(null)
  const pointerStart = useRef(null)
  const latestDrag = useRef({ x: 0, y: 0 })
  const movedDuringPointer = useRef(false)
  const suppressNextClick = useRef(false)
  const activeProperty = properties[0]
  const nextProperty = properties[1]
  const dragRatio = Math.min(1, Math.abs(drag.x) / swipeThreshold)
  const passedThreshold = Math.abs(drag.x) > swipeThreshold
  const intent = drag.x > 12 ? 'interested' : drag.x < -12 ? 'pass' : null

  const resetDrag = useCallback(() => {
    pointerStart.current = null
    movedDuringPointer.current = false
    setDragIntent(null)
    latestDrag.current = { x: 0, y: 0 }
    setDrag({ x: 0, y: 0, active: false })
  }, [])

  useEffect(() => {
    const clearPointerState = () => resetDrag()
    const clearHiddenPointerState = () => {
      if (document.visibilityState === 'hidden') resetDrag()
    }

    window.addEventListener('pointerup', clearPointerState)
    window.addEventListener('pointercancel', clearPointerState)
    window.addEventListener('blur', clearPointerState)
    document.addEventListener('visibilitychange', clearHiddenPointerState)

    return () => {
      window.removeEventListener('pointerup', clearPointerState)
      window.removeEventListener('pointercancel', clearPointerState)
      window.removeEventListener('blur', clearPointerState)
      document.removeEventListener('visibilitychange', clearHiddenPointerState)
    }
  }, [resetDrag])

  const finishAction = (action, propertyId) => {
    if (smartLimitReached || (action === 'interested' && interestLimitReached)) {
      resetDrag()
      return
    }
    onLeaving({ propertyId, action })
    window.setTimeout(() => {
      if (action === 'interested') onInterest(propertyId)
      else onPass(propertyId)
      onLeaving(null)
      resetDrag()
    }, 240)
  }

  const handlePointerDown = (event) => {
    if (!activeProperty || leaving) return
    if (!event.target.closest('[data-smart-swipe-zone="true"]')) return
    pointerStart.current = { x: event.clientX, y: event.clientY }
    latestDrag.current = { x: 0, y: 0 }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    movedDuringPointer.current = false
    setDrag({ x: 0, y: 0, active: true })
  }

  const handlePointerMove = (event) => {
    if (!pointerStart.current || leaving) return
    const x = event.clientX - pointerStart.current.x
    const y = event.clientY - pointerStart.current.y
    if (!dragIntent && Math.max(Math.abs(x), Math.abs(y)) < 10) return
    const nextIntent = dragIntent || (Math.abs(x) > Math.abs(y) * 1.35 ? 'horizontal' : Math.abs(y) > Math.abs(x) * 1.15 ? 'vertical' : null)
    if (!nextIntent) return
    setDragIntent(nextIntent)
    if (nextIntent === 'vertical') {
      resetDrag()
      return
    }
    movedDuringPointer.current = Math.abs(x) > 6 || Math.abs(y) > 6
    if (movedDuringPointer.current) suppressNextClick.current = true
    const constrainedY = Math.max(-18, Math.min(18, y))
    latestDrag.current = { x, y: constrainedY }
    setDrag({ x, y: constrainedY, active: true })
  }

  const handlePointerUp = () => {
    if (!activeProperty || !pointerStart.current || leaving) return
    const latestX = latestDrag.current.x
    if (latestX > swipeThreshold) finishAction('interested', activeProperty.id)
    else if (latestX < -swipeThreshold) finishAction('pass', activeProperty.id)
    else resetDrag()
  }

  const triggerButtonAction = (action) => {
    if (!activeProperty || leaving) return
    if (smartLimitReached) return
    if (action === 'interested' && interestLimitReached) return
    finishAction(action, activeProperty.id)
  }

  if (!activeProperty) {
    const title = smartLimitReached
      ? 'Daily Smart Match limit reached.'
      : noActiveListings
        ? 'No active listings available.'
        : noFilterResults
          ? 'No properties match these filters.'
          : "You've reviewed all eligible listings."
    const description = smartLimitReached
      ? freePlanMessage
      : noActiveListings
        ? 'Check back after landlords publish listings.'
        : noFilterResults
          ? 'Reset filters or update your rental profile to widen the results.'
          : 'Continue browsing all matching properties, or start over to review the stack again without changing today’s usage.'
    return (
      <section className="card-surface card-shadow rounded-[30px] p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">Smart Match</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-4 grid gap-3">
          <Button onClick={onBrowse}>Continue browsing</Button>
          <Button variant="secondary" onClick={noFilterResults ? onResetFilters : onReset} disabled={smartLimitReached || noActiveListings}>
            {noFilterResults ? 'Reset filters' : 'Start over'}
          </Button>
        </div>
        {smartLimitReached ? (
          <div className="mt-5 rounded-[20px] border border-indigo-100 bg-indigo-50/50 p-4 text-left">
            <p className="text-sm font-semibold text-slate-950">Want more today?</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Gafflo+ gives you more Smart Match cards and Interested actions each day.
            </p>
            <Button variant="secondary" className="mt-3 w-full border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50" onClick={onExploreGafflo}>
              Continue with Gafflo+
            </Button>
          </div>
        ) : null}
      </section>
    )
  }

  const application = getTenantApplicationForListing(activeProperty.id)
  const isSaved = savedPropertyIds.includes(activeProperty.id)
  const rotate = drag.x / 26
  const activeScale = 1 - dragRatio * 0.012
  const leavingTransform = leaving?.action === 'interested' ? 'translate3d(126%, -3%, 0) rotate(9deg) scale(0.985)' : 'translate3d(-126%, -3%, 0) rotate(-9deg) scale(0.985)'
  const cardTransform = leaving
    ? leavingTransform
    : `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotate}deg) scale(${activeScale})`

  return (
    <section className="mx-auto max-w-[520px]">
      <div className="relative [perspective:1200px]">
        {nextProperty ? (
          <div
            aria-hidden="true"
            data-testid="smart-match-backplate"
            className="card-shadow pointer-events-none absolute inset-x-3 top-4 -z-10 h-[23rem] rounded-[32px] border border-slate-200/70 bg-white min-[390px]:h-[24rem]"
            style={{
              transform: `translateY(${18 - dragRatio * 11}px) scale(${0.958 + dragRatio * 0.03})`,
            }}
          />
        ) : null}

        <div
          role="button"
          tabIndex={0}
          aria-label={`Open ${activeProperty.title}`}
          className={`cursor-grab select-none rounded-[32px] [touch-action:pan-y] outline-none transition-[transform,opacity,box-shadow] focus-visible:ring-4 focus-visible:ring-indigo-100 ${
            drag.active ? 'duration-0' : 'motion-spring duration-300'
          } ${leaving ? 'motion-exit duration-300' : ''} ${
            passedThreshold && intent === 'interested'
              ? 'shadow-[0_34px_70px_-34px_rgba(16,185,129,0.48)]'
              : passedThreshold
                ? 'shadow-[0_34px_70px_-36px_rgba(15,23,42,0.28)]'
                : ''
          }`}
          style={{
            opacity: leaving ? 0.96 : 1 - dragRatio * 0.025,
            transform: cardTransform,
          }}
          onClick={(event) => {
            if (suppressNextClick.current) {
              suppressNextClick.current = false
              return
            }
            if (!movedDuringPointer.current && Math.abs(drag.x) < 8 && Math.abs(drag.y) < 8 && !leaving) onDetails(activeProperty.id)
            event.currentTarget.blur()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onDetails(activeProperty.id)
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={resetDrag}
        >
          <PropertyDeckFace property={activeProperty} applicationStatus={application?.statusLabel} isSaved={isSaved} highlight={passedThreshold ? intent : null} />
          <SwipeIntentBadge intent={intent || leaving?.action} opacity={leaving ? 1 : dragRatio} ready={passedThreshold} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[24px] border border-white/70 bg-white/94 p-2 shadow-soft backdrop-blur-xl">
        <Button variant="secondary" className="min-h-14" disabled={smartLimitReached} onClick={() => triggerButtonAction('pass')}>Pass</Button>
        <Button
          variant={isSaved ? 'secondary' : 'primary'}
          success={savedPulseId === activeProperty.id}
          className="min-h-14"
          data-account-action="save-property"
          onClick={() => onSave(activeProperty.id)}
        >
          {isSaved ? 'Saved' : 'Save'}
        </Button>
        <Button variant="dark" className="min-h-14" data-account-action="send-interest" disabled={interestLimitReached || smartLimitReached} onClick={() => triggerButtonAction('interested')}>
          {interestLimitReached ? 'Limit reached' : 'Interested'}
        </Button>
      </div>
      {smartLimitReached || interestLimitReached ? (
        <div className="mt-3 rounded-[20px] border border-indigo-100 bg-indigo-50/50 p-3">
          <p className="text-xs leading-5 text-slate-600">
            {smartLimitReached
              ? "You've reached today's Smart Match card limit."
              : "You've reached today's Interested limit."}
          </p>
          <Button variant="secondary" className="mt-2 w-full border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50" onClick={onExploreGafflo}>
            Continue with Gafflo+
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function PropertyDeckFace({ property, applicationStatus, isSaved, highlight = null }) {
  const trustSignal = getPrimaryTrustSignal(property)
  const isNew = isNewProperty(property)
  const roomListing = isRoomListing(property.listingCategory)
  const facts = getSmartMatchFacts(property).slice(0, roomListing ? 5 : 5)
  const updated = formatFreshness(property.updatedAt)
  const availability = formatFreshness(property.availabilityConfirmedAt, 'Availability confirmed')

  return (
    <article
      className={`card-surface card-shadow overflow-hidden rounded-[32px] bg-white transition-[border-color,box-shadow] duration-200 ${
        highlight === 'interested'
          ? 'border-emerald-200 ring-4 ring-emerald-50'
          : highlight === 'pass'
            ? 'border-slate-300 ring-4 ring-slate-100'
            : ''
      }`}
    >
      <div data-smart-swipe-zone="true" className="relative h-[23rem] min-[390px]:h-[24rem]">
        <ImageWithSkeleton src={property.images[0]} alt={property.title} draggable={false} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/86 via-slate-950/20 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <MatchBadge score={property.match.score} />
          <span className="rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
            {roomListing ? domainLabel('roomType', property.roomType) : `${property.bedrooms ? `${property.bedrooms} bed` : 'Studio'} · ${domainLabel('propertyType', property.propertyType)}`}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <h2 className="text-balance text-[1.55rem] font-semibold leading-tight tracking-tight min-[390px]:text-[1.85rem]">{property.title}</h2>
          <p className="mt-1 text-sm text-slate-200">{property.area}, {property.city}</p>
          <p className="mt-2 text-sm font-semibold">{formatCurrency(property.rent)}/mo · available {formatDate(property.availableFrom)}</p>
          {property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? <p className="mt-1 text-sm font-semibold text-emerald-100">Owner lives here</p> : null}
        </div>
      </div>

      <div className="space-y-2.5 p-3.5 min-[390px]:p-4">
        <div className="grid grid-cols-2 gap-2 min-[390px]:grid-cols-3">
          {facts.map((fact) => <Info key={fact.label} label={fact.label} value={fact.value} />)}
        </div>
        <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Why it fits</p>
          <ul className="mt-1.5 space-y-1 text-sm leading-5 text-emerald-950">
            {property.match.reasons.slice(0, 2).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {getSecondarySignalPills({ applicationStatus, isNew, trustSignal, isSaved, availability, updated }).map(({ tone, label }) => (
            <Pill key={label} tone={tone}>{label}</Pill>
          ))}
        </div>
      </div>
    </article>
  )
}

// Caps the swipe card's secondary status pills to the ~2 signals most likely to change a
// tenant's decision (an existing application first, then freshness/trust) — everything else
// still reaches the tenant through Property Details, which is one tap away.
function getSecondarySignalPills({ applicationStatus, isNew, trustSignal, isSaved, availability, updated }) {
  return [
    applicationStatus ? { tone: 'dark', label: applicationStatus } : null,
    isNew ? { tone: 'new', label: 'New' } : trustSignal ? { tone: 'trust', label: trustSignal } : null,
    isSaved ? { tone: 'green', label: 'Saved' } : null,
    availability ? { tone: 'green', label: availability } : updated ? { tone: 'trust', label: updated } : null,
  ]
    .filter(Boolean)
    .slice(0, 2)
}

function SwipeIntentBadge({ intent, opacity, ready }) {
  if (!intent) return null
  const isInterested = intent === 'interested'
  return (
    <div
      className={`pointer-events-none absolute top-8 ${isInterested ? 'left-6 rotate-[-8deg]' : 'right-6 rotate-[8deg]'} rounded-2xl border px-4 py-2 text-sm font-black uppercase tracking-[0.14em] shadow-soft transition-transform duration-150 ${
        ready ? 'scale-105' : 'scale-100'
      } ${
        isInterested
          ? 'border-emerald-200 bg-emerald-50/96 text-emerald-700'
          : 'border-slate-300 bg-white/94 text-slate-600'
      }`}
      style={{ opacity }}
    >
      {isInterested ? 'Interested' : 'Pass'}
    </div>
  )
}

function PropertyBrowseCard({ property, isSaved, applicationStatus, onDetails, onInterest, onSave }) {
  const trustSignal = getPrimaryTrustSignal(property)
  const isNew = isNewProperty(property)
  const isPromoted = isListingPromoted(property)
  const roomListing = isRoomListing(property.listingCategory)
  const facts = getBrowseFacts(property)
  const availability = formatFreshness(property.availabilityConfirmedAt, 'Availability confirmed')

  return (
    <article className="card-surface card-shadow overflow-hidden rounded-[30px]">
      <button type="button" onClick={onDetails} className="block w-full text-left">
        <div className="relative h-64">
          <ImageWithSkeleton src={property.images[0]} alt={property.title} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/82 via-slate-950/18 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <div className="flex flex-col items-start gap-2">
              <MatchBadge score={property.match.score} />
              {isPromoted ? <Pill tone="amber">Promoted</Pill> : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              {isNew ? <Pill tone="new">New</Pill> : null}
              <span className="rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
                {roomListing ? domainLabel('roomType', property.roomType) : property.bedrooms ? `${property.bedrooms} bed` : 'Studio'}
              </span>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight">{property.title}</h2>
            <p className="mt-1 text-sm text-slate-200">{property.area}, {property.city}</p>
            <p className="mt-2 text-sm font-semibold">{formatCurrency(property.rent)}/mo · {formatDate(property.availableFrom)}</p>
            {property.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? <p className="mt-1 text-sm font-semibold text-emerald-100">Owner lives here</p> : null}
          </div>
        </div>
      </button>
      <div className="space-y-3 p-4 min-[390px]:p-5">
        <div className="grid grid-cols-2 gap-2">
          {facts.slice(0, 4).map((fact) => <Info key={fact.label} label={fact.label} value={fact.value} />)}
        </div>
        <div className="flex flex-wrap gap-2">
          {trustSignal ? <Pill tone="trust">{trustSignal}</Pill> : null}
          {availability ? <Pill tone="green">{availability}</Pill> : null}
        </div>
        {applicationStatus ? (
          <div className="rounded-[20px] bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
            Application status: {applicationStatus}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant={isSaved ? 'secondary' : 'primary'} data-account-action="save-property" onClick={onSave}>{isSaved ? 'Saved' : 'Save'}</Button>
          <Button variant="dark" data-account-action={applicationStatus ? 'view-application' : 'send-interest'} onClick={onInterest}>{applicationStatus ? 'View status' : 'Apply'}</Button>
        </div>
      </div>
    </article>
  )
}

function UsageTile({ label, value }) {
  return (
    <div className="rounded-[18px] bg-slate-50 px-3 py-3 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="surface-line min-w-0 rounded-[18px] bg-slate-50/78 px-3 py-3">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function Pill({ children, tone }) {
  const classes = {
    green: 'bg-emerald-50 text-emerald-700',
    dark: 'bg-slate-900 text-white',
    amber: 'bg-amber-50 text-amber-800',
    new: 'bg-white text-slate-700 shadow-soft',
    trust: 'bg-indigo-50 text-indigo-900',
  }
  return <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${classes[tone]}`}>{children}</span>
}

function ImageWithSkeleton({ alt, draggable = true, src }) {
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
        draggable={draggable}
        className={`h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        onError={() => setHasFailed(true)}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  )
}
