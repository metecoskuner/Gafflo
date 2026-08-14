import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import MatchBadge from '../components/MatchBadge'
import { getPrimaryTrustSignal, isNewProperty } from '../config/rentalJourney'
import useAppState from '../context/useAppState'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/dateUtils'

const swipeThreshold = 105

export default function MarketplaceDiscover() {
  const navigate = useNavigate()
  const {
    activeFilterCount,
    createEnquiry,
    discoveryProperties,
    availableProperties,
    expressSmartMatchInterest,
    passSmartMatchProperty,
    resetPropertyFilters,
    saveProperty,
    savedPropertyIds,
    smartMatchUsage,
    startOver,
    tenantEnquiries,
  } = useAppState()
  const [viewMode, setViewMode] = useState('smart')
  const [leaving, setLeaving] = useState(null)
  const [savedPulseId, setSavedPulseId] = useState(null)
  const rankedSmartMatches = useMemo(
    () => [...availableProperties].sort((a, b) => b.match.score - a.match.score),
    [availableProperties],
  )
  const browseProperties = useMemo(
    () => [...discoveryProperties].sort((a, b) => b.match.score - a.match.score),
    [discoveryProperties],
  )

  const handleInterest = (propertyId) => {
    expressSmartMatchInterest(propertyId)
  }

  const openEnquiry = (propertyId) => {
    const conversationId = createEnquiry(propertyId)
    if (conversationId) navigate(`/messages/${conversationId}`)
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
        <div className="flex flex-col gap-4 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-600">Discover</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 min-[390px]:text-3xl">Smart Match</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ranked Dublin listings based on budget, area, timing, tenancy rules and application readiness.
            </p>
          </div>
          <div className="grid w-full shrink-0 grid-cols-2 rounded-full bg-slate-100 p-1 min-[390px]:w-auto">
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
          properties={rankedSmartMatches}
          savedPropertyIds={savedPropertyIds}
          tenantEnquiries={tenantEnquiries}
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
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {browseProperties.map((property) => {
            const enquiry = tenantEnquiries.find((item) => item.propertyId === property.id)
            return (
              <PropertyBrowseCard
                key={property.id}
                property={property}
                isSaved={savedPropertyIds.includes(property.id)}
                enquiryStatus={enquiry?.statusLabel}
                onDetails={() => navigate(`/properties/${property.id}`)}
                onInterest={() => openEnquiry(property.id)}
                onSave={() => saveProperty(property.id)}
              />
            )
          })}
        </section>
      )}
    </div>
  )
}

function SmartMatchDeck({
  properties,
  savedPropertyIds,
  tenantEnquiries,
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
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const pointerStart = useRef(null)
  const activeProperty = properties[0]
  const nextProperty = properties[1]
  const dragRatio = Math.min(1, Math.abs(drag.x) / swipeThreshold)
  const passedThreshold = Math.abs(drag.x) > swipeThreshold
  const intent = drag.x > 12 ? 'interested' : drag.x < -12 ? 'pass' : null

  const resetDrag = () => {
    pointerStart.current = null
    setDrag({ x: 0, y: 0, active: false })
  }

  const finishAction = (action, propertyId) => {
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
    pointerStart.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({ x: 0, y: 0, active: true })
  }

  const handlePointerMove = (event) => {
    if (!pointerStart.current || leaving) return
    const x = event.clientX - pointerStart.current.x
    const y = event.clientY - pointerStart.current.y
    setDrag({ x, y, active: true })
  }

  const handlePointerUp = () => {
    if (!activeProperty || !pointerStart.current || leaving) return
    if (drag.x > swipeThreshold) finishAction('interested', activeProperty.id)
    else if (drag.x < -swipeThreshold) finishAction('pass', activeProperty.id)
    else resetDrag()
  }

  const triggerButtonAction = (action) => {
    if (!activeProperty || leaving) return
    finishAction(action, activeProperty.id)
  }

  if (!activeProperty) {
    return (
      <section className="card-surface card-shadow rounded-[30px] p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">Smart Match</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          {noFilterResults ? 'No properties match these filters.' : "Today's Smart Matches are finished."}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {noFilterResults
            ? 'Reset filters or update your rental profile to widen the results.'
            : 'Continue browsing all matching properties, or start over if you want to review the stack again.'}
        </p>
        <div className="mt-4 grid gap-3">
          <Button onClick={onBrowse}>Continue browsing</Button>
          <Button variant="secondary" onClick={noFilterResults ? onResetFilters : onReset}>{noFilterResults ? 'Reset filters' : 'Start over'}</Button>
        </div>
      </section>
    )
  }

  const enquiry = tenantEnquiries.find((item) => item.propertyId === activeProperty.id)
  const isSaved = savedPropertyIds.includes(activeProperty.id)
  const rotate = drag.x / 26
  const activeScale = 1 - dragRatio * 0.012
  const leavingTransform = leaving?.action === 'interested' ? 'translate3d(126%, -3%, 0) rotate(9deg) scale(0.985)' : 'translate3d(-126%, -3%, 0) rotate(-9deg) scale(0.985)'
  const cardTransform = leaving
    ? leavingTransform
    : `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotate}deg) scale(${activeScale})`

  return (
    <section className="mx-auto max-w-[520px]">
      <div className="relative h-[clamp(28rem,calc(100dvh-15.5rem-env(safe-area-inset-bottom)),34rem)] touch-none [perspective:1200px]">
        {nextProperty ? (
          <PropertyDeckFace
            property={nextProperty}
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.62 + dragRatio * 0.24,
              transform: `translateY(${18 - dragRatio * 11}px) scale(${0.958 + dragRatio * 0.03})`,
            }}
          />
        ) : null}

        <div
          role="button"
          tabIndex={0}
          aria-label={`Open ${activeProperty.title}`}
          className={`absolute inset-0 cursor-grab touch-none select-none rounded-[32px] outline-none transition-[transform,opacity,box-shadow] focus-visible:ring-4 focus-visible:ring-indigo-100 ${
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
            if (Math.abs(drag.x) < 8 && Math.abs(drag.y) < 8 && !leaving) onDetails(activeProperty.id)
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
          <PropertyDeckFace property={activeProperty} enquiryStatus={enquiry?.statusLabel} isSaved={isSaved} highlight={passedThreshold ? intent : null} />
          <SwipeIntentBadge intent={intent || leaving?.action} opacity={leaving ? 1 : dragRatio} ready={passedThreshold} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[24px] border border-white/70 bg-white/94 p-2 shadow-soft backdrop-blur-xl">
        <Button variant="secondary" className="min-h-14" onClick={() => triggerButtonAction('pass')}>Pass</Button>
        <Button
          variant={isSaved ? 'secondary' : 'primary'}
          success={savedPulseId === activeProperty.id}
          className="min-h-14"
          data-account-action="save-property"
          onClick={() => onSave(activeProperty.id)}
        >
          {isSaved ? 'Saved' : 'Save'}
        </Button>
        <Button variant="dark" className="min-h-14" data-account-action="send-interest" onClick={() => triggerButtonAction('interested')}>
          Interested
        </Button>
      </div>
    </section>
  )
}

function PropertyDeckFace({ property, enquiryStatus, isSaved, highlight = null, className = '', style }) {
  const trustSignal = getPrimaryTrustSignal(property)
  const isNew = isNewProperty(property)

  return (
    <article
      className={`card-surface card-shadow h-full overflow-hidden rounded-[32px] bg-white transition-[border-color,box-shadow] duration-200 ${
        highlight === 'interested'
          ? 'border-emerald-200 ring-4 ring-emerald-50'
          : highlight === 'pass'
            ? 'border-slate-300 ring-4 ring-slate-100'
            : ''
      } ${className}`}
      style={style}
    >
      <div className="relative h-[58%] min-[390px]:h-[62%]">
        <ImageWithSkeleton src={property.images[0]} alt={property.title} draggable={false} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/86 via-slate-950/20 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <MatchBadge score={property.match.score} />
          <span className="rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
            {property.bedrooms ? `${property.bedrooms} bed` : 'Studio'} · {property.propertyType}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <h2 className="text-balance text-[1.55rem] font-semibold leading-tight tracking-tight min-[390px]:text-[1.85rem]">{property.title}</h2>
          <p className="mt-1 text-sm text-slate-200">{property.area}, {property.city}</p>
          <p className="mt-2 text-sm font-semibold">{formatCurrency(property.rent)}/mo · available {formatDate(property.availableFrom)}</p>
        </div>
      </div>

      <div className="space-y-3 p-3.5 min-[390px]:p-4">
        <div className="grid grid-cols-3 gap-2">
          <Info label="Deposit" value={formatCurrency(property.deposit)} />
          <Info label="Furnished" value={property.furnished} />
          <Info label="Parking" value={property.parking} />
        </div>
        <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Why it fits</p>
          <ul className="mt-2 space-y-1 text-sm leading-5 text-emerald-950">
            {property.match.reasons.slice(0, 2).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {isNew ? <Pill tone="new">New</Pill> : null}
          {trustSignal ? <Pill tone="trust">{trustSignal}</Pill> : null}
          {isSaved ? <Pill tone="green">Saved</Pill> : null}
          {enquiryStatus ? <Pill tone="dark">{enquiryStatus}</Pill> : null}
          {property.match.warnings?.[0] ? <Pill tone="amber">{property.match.warnings[0]}</Pill> : null}
        </div>
      </div>
    </article>
  )
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

function PropertyBrowseCard({ property, isSaved, enquiryStatus, onDetails, onInterest, onSave }) {
  const trustSignal = getPrimaryTrustSignal(property)
  const isNew = isNewProperty(property)

  return (
    <article className="card-surface card-shadow overflow-hidden rounded-[30px]">
      <button type="button" onClick={onDetails} className="block w-full text-left">
        <div className="relative h-64">
          <ImageWithSkeleton src={property.images[0]} alt={property.title} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/82 via-slate-950/18 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <MatchBadge score={property.match.score} />
            <div className="flex flex-col items-end gap-2">
              {isNew ? <Pill tone="new">New</Pill> : null}
              <span className="rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft">
                {property.bedrooms ? `${property.bedrooms} bed` : 'Studio'}
              </span>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight">{property.title}</h2>
            <p className="mt-1 text-sm text-slate-200">{property.area}, {property.city}</p>
            <p className="mt-2 text-sm font-semibold">{formatCurrency(property.rent)}/mo · {formatDate(property.availableFrom)}</p>
          </div>
        </div>
      </button>
      <div className="space-y-4 p-5">
        {trustSignal ? <Pill tone="trust">{trustSignal}</Pill> : null}
        {enquiryStatus ? (
          <div className="rounded-[20px] bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
            Enquiry status: {enquiryStatus}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant={isSaved ? 'secondary' : 'primary'} data-account-action="save-property" onClick={onSave}>{isSaved ? 'Saved' : 'Save'}</Button>
          <Button variant="dark" data-account-action={enquiryStatus ? 'open-message' : 'send-interest'} onClick={onInterest}>{enquiryStatus ? 'Open' : 'Interested'}</Button>
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
