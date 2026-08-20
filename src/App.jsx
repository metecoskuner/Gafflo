import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import { BrandLockup } from './components/BrandLogo'
import Footer from './components/Footer'
import GaffloSelect from './components/GaffloSelect'
import Navbar from './components/Navbar'
import NotificationsPanel from './components/NotificationsPanel'
import PropertyDetailsModal from './components/PropertyDetailsModal'
import Button from './components/Button'
import AuthGate from './components/AuthGate'
import ProfileGate from './components/ProfileGate'
import { ANY_VALUE, domainLabel, furnishedOptions, propertyTypeOptions, roomTypeOptions } from './config/domainOptions'
import { cityOptions } from './config/locationOptions'
import { LISTING_CATEGORIES, listingCategoryOptions } from './config/listingCategories'
import { AppStateProvider } from './context/MarketplaceState'
import { ApplicationsProvider } from './context/ApplicationsProvider'
import { AuthProvider } from './context/AuthProvider'
import { AccountProfileProvider } from './context/AccountProfileProvider'
import { ListingsProvider } from './context/ListingsProvider'
import { MessagingProvider } from './context/MessagingProvider'
import { ViewingsProvider } from './context/ViewingsProvider'
import { EngagementProvider } from './context/EngagementProvider'
import { NotificationsProvider } from './context/NotificationsProvider'
import useAccountProfile from './context/useAccountProfile'
import useNotifications from './context/useNotifications'
import { canUseAdvancedFilters } from './config/entitlements'
import useAppState from './context/useAppState'
import { getTodayIsoDate, isPastIsoDate } from './utils/dateUtils'
import Dashboard from './pages/Dashboard'
import CreateListing from './pages/CreateListing'
import Messages from './pages/Messages'
import SavedProperties from './pages/SavedProperties'
import DiscoverProperties from './pages/DiscoverProperties'
import TenantProfile from './pages/Profile'
import RoleSelection from './pages/RoleSelection'
import TenantOnboarding from './pages/TenantOnboarding'
import LandlordOnboarding from './pages/LandlordOnboarding'
import LandlordProperties from './pages/LandlordProperties'
import Applicants from './pages/Applicants'

const emptyPropertyFilters = {
  priceMin: '',
  priceMax: '',
  location: 'Any',
  moveInBy: '',
  listingCategory: 'Any',
  propertyType: ANY_VALUE,
  roomType: 'Any',
  privateBathroom: 'Any',
  billsIncluded: 'Any',
  ownerOccupied: 'Any',
  couplesAccepted: 'Any',
  furnishedPreference: ANY_VALUE,
  bedrooms: 'Any',
  pets: 'Any',
  parking: 'Any',
  leaseLength: ANY_VALUE,
}

const advancedFilterFields = [
  'propertyType',
  'roomType',
  'privateBathroom',
  'billsIncluded',
  'ownerOccupied',
  'couplesAccepted',
  'bedrooms',
  'pets',
  'parking',
  'furnishedPreference',
]

// Gafflo+ gates these fields for real — a Free tenant's applied filters never carry an
// advanced value even if one was set before a downgrade or left over in draft state.
function stripAdvancedFilters(filters) {
  const next = { ...filters }
  advancedFilterFields.forEach((field) => {
    next[field] = emptyPropertyFilters[field]
  })
  return next
}

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation
  const routeLocation = backgroundLocation || location
  const shouldRenderPropertyDetailsRoutes = Boolean(backgroundLocation) || /^\/(properties|rooms)\/[^/]+$/.test(location.pathname)
  const isLandingPage = routeLocation.pathname === '/'
  const isAppRoute = !isLandingPage
  const { activeFilterCount } = useAppState()
  const { activeRole: role, hasTenantProfile, hasLandlordProfile } = useAccountProfile()
  // Distinct from hasTenantProfile/hasLandlordProfile on purpose: choosing a role in
  // RoleSelection persists last_active_role immediately (real intent) but does not create the
  // role's profile row yet (target_city/looking_for, display_name — genuinely required fields
  // with no truthful value at that point). "Has selected a role" must stay true through that
  // in-progress-onboarding window, or a fresh tenant pick would bounce straight back to
  // RoleSelection instead of falling through to TenantOnboarding below.
  const hasSelectedRole = Boolean(role)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const { unreadCount: unreadNotificationCount } = useNotifications()
  const homeRoute = role === 'landlord' ? '/dashboard' : '/discover'

  useEffect(() => {
    if (!isAppRoute) return undefined

    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [isAppRoute])

  useEffect(() => {
    document.documentElement.scrollLeft = 0
    document.body.scrollLeft = 0
    document.querySelector('#app-shell-scroll')?.scrollTo({ left: 0 })
  }, [routeLocation.pathname])

  if (!hasSelectedRole) return <RoleSelection />
  if (role === 'tenant' && !hasTenantProfile) return <TenantOnboarding />
  if (role === 'landlord' && !hasLandlordProfile) return <LandlordOnboarding />

  return (
    <>
      {isAppRoute ? (
        <div className="page-shell relative mx-auto h-[100dvh] w-full min-w-0 max-w-[560px] overflow-hidden overscroll-x-none md:max-w-[620px]">
          <AppHeader
            activeFilterCount={activeFilterCount}
            homeRoute={homeRoute}
            showCreateAction={role === 'landlord'}
            onCreateListing={() => navigate('/listings/new')}
            onFilterOpen={role === 'tenant' ? () => setIsFilterOpen(true) : null}
            unreadNotificationCount={unreadNotificationCount}
            onNotificationsOpen={() => setIsNotificationsOpen(true)}
          />
          <main
            id="app-shell-scroll"
            className="h-[100dvh] min-w-0 overflow-y-auto overflow-x-clip overscroll-x-none px-4 pb-[calc(var(--gafflo-bottom-nav-offset)+2.5rem)] pt-[var(--gafflo-app-header-offset)] [touch-action:pan-y] md:px-6"
          >
            <Routes location={routeLocation}>
              <Route path="/profile" element={<TenantProfile />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/discover" element={<DiscoverProperties />} />
              <Route path="/properties" element={role === 'landlord' ? <LandlordProperties /> : <DiscoverProperties />} />
              <Route path="/properties/:propertyId" element={<PropertyDetailsModal standalone />} />
              <Route path="/properties/manage" element={<LandlordProperties />} />
              <Route path="/rooms" element={<Navigate to="/properties" replace />} />
              <Route path="/rooms/:propertyId" element={<NavigateToPropertyDetails />} />
              <Route path="/applicants" element={role === 'landlord' ? <Applicants /> : <Navigate to="/discover" replace />} />
              <Route path="/listings/new" element={role === 'landlord' ? <CreateListing /> : <Navigate to="/discover" replace />} />
              <Route path="/listings/:propertyId/edit" element={role === 'landlord' ? <CreateListing /> : <Navigate to="/discover" replace />} />
              <Route path="/create" element={<Navigate to="/listings/new" replace />} />
              <Route path="/saved" element={role === 'tenant' ? <SavedProperties /> : <Navigate to="/properties" replace />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route path="*" element={<Navigate to={homeRoute} replace />} />
            </Routes>
          </main>
          <BottomNav />
          {isFilterOpen ? (
            <FilterSheet
              onClose={() => setIsFilterOpen(false)}
              onUpdateProfile={() => {
                setIsFilterOpen(false)
                navigate('/profile')
              }}
            />
          ) : null}
          {isNotificationsOpen ? (
            <NotificationsPanel
              onClose={() => setIsNotificationsOpen(false)}
              onNavigate={(path) => {
                setIsNotificationsOpen(false)
                navigate(path)
              }}
            />
          ) : null}
        </div>
      ) : (
        <div className="page-shell mx-auto flex min-h-screen w-full max-w-[1120px] flex-col px-4 pb-10 md:px-6 md:pb-12">
          <Navbar />
          <main className="flex-1 py-4 md:py-7">
            <Routes location={routeLocation}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<TenantProfile />} />
              <Route path="/discover" element={<DiscoverProperties />} />
              <Route path="/properties" element={role === 'landlord' ? <LandlordProperties /> : <DiscoverProperties />} />
              <Route path="/properties/:propertyId" element={<PropertyDetailsModal standalone />} />
              <Route path="/properties/manage" element={<LandlordProperties />} />
              <Route path="/rooms" element={<Navigate to="/properties" replace />} />
              <Route path="/rooms/:propertyId" element={<NavigateToPropertyDetails />} />
              <Route path="/applicants" element={role === 'landlord' ? <Applicants /> : <Navigate to="/discover" replace />} />
              <Route path="/listings/new" element={role === 'landlord' ? <CreateListing /> : <Navigate to="/discover" replace />} />
              <Route path="/listings/:propertyId/edit" element={role === 'landlord' ? <CreateListing /> : <Navigate to="/discover" replace />} />
              <Route path="/create" element={<Navigate to="/listings/new" replace />} />
              <Route path="/saved" element={role === 'tenant' ? <SavedProperties /> : <Navigate to="/properties" replace />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route path="*" element={<Navigate to={homeRoute} replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      )}

      {shouldRenderPropertyDetailsRoutes && backgroundLocation ? (
        <Routes>
          <Route path="/properties/:propertyId" element={<PropertyDetailsModal />} />
          <Route path="/rooms/:propertyId" element={<NavigateToPropertyDetails />} />
        </Routes>
      ) : null}

      {shouldRenderPropertyDetailsRoutes && !backgroundLocation && !isAppRoute ? (
        <Routes>
          <Route path="/properties/:propertyId" element={<PropertyDetailsModal standalone />} />
          <Route path="/rooms/:propertyId" element={<NavigateToPropertyDetails />} />
        </Routes>
      ) : null}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AccountProfileProvider>
          <ProfileGate>
            <ListingsProvider>
              <ApplicationsProvider>
                <ViewingsProvider>
                  <MessagingProvider>
                    <EngagementProvider>
                      <AppStateProvider>
                        <NotificationsProvider>
                          <AppLayout />
                        </NotificationsProvider>
                      </AppStateProvider>
                    </EngagementProvider>
                  </MessagingProvider>
                </ViewingsProvider>
              </ApplicationsProvider>
            </ListingsProvider>
          </ProfileGate>
        </AccountProfileProvider>
      </AuthGate>
    </AuthProvider>
  )
}

function AppHeader({ activeFilterCount, homeRoute, showCreateAction, onCreateListing, onFilterOpen, unreadNotificationCount, onNotificationsOpen }) {
  const navigate = useNavigate()

  return (
    <header className="absolute inset-x-0 top-0 z-40 border-b border-slate-200/85 bg-white shadow-[0_1px_16px_-10px_rgba(15,23,42,0.22)]">
      <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] md:max-w-[620px] md:px-6">
        <button
          type="button"
          aria-label="Go to Gafflo home"
          onClick={() => navigate(homeRoute)}
          className="flex h-11 items-center rounded-xl px-1 outline-none transition active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          <BrandLockup />
        </button>

        <div className="flex items-center gap-2">
          {showCreateAction ? <HeaderIconButton ariaLabel="Create listing" icon="+" onClick={onCreateListing} /> : null}
          {onFilterOpen ? <HeaderIconButton ariaLabel="Open filters" badge={activeFilterCount} icon="☷" onClick={onFilterOpen} /> : null}
          <HeaderIconButton ariaLabel="Notifications" badge={unreadNotificationCount} icon="🔔" onClick={onNotificationsOpen} />
        </div>
      </div>
    </header>
  )
}

function HeaderIconButton({ ariaLabel, badge = 0, disabled = false, icon, onClick }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 text-lg text-slate-700 transition hover:bg-slate-100 active:scale-[0.97] disabled:opacity-45"
    >
      <span aria-hidden="true">{icon}</span>
      {badge > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-bold text-white shadow-soft">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function NavigateToPropertyDetails() {
  const { propertyId } = useParams()
  return <Navigate to={`/properties/${propertyId}`} replace />
}

function FilterSheet({ onClose }) {
  const {
    activeFilterCount,
    discoveryProperties,
    properties,
    propertyFilters,
    resetPropertyFilters,
    setPropertyFilters,
    tenantPlan,
  } = useAppState()
  const navigate = useNavigate()
  const [draftFilters, setDraftFilters] = useState(propertyFilters)
  const [filterErrors, setFilterErrors] = useState({})
  const today = getTodayIsoDate()
  const canAdvanced = canUseAdvancedFilters(tenantPlan)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const locations = [
    'Any',
    ...Array.from(new Set([...cityOptions, ...properties.flatMap((property) => [property.city, property.area])])).filter(Boolean).sort((a, b) => a.localeCompare(b)),
  ]
  const categoryFilterOptions = toFilterOptions([{ value: 'Any', label: 'Any' }, ...listingCategoryOptions, { value: 'room', label: 'Any room' }])
  const propertyTypeFilterOptions = toFilterOptions([{ value: ANY_VALUE, label: 'Any' }, ...propertyTypeOptions])
  const roomTypeFilterOptions = toFilterOptions([{ value: 'Any', label: 'Any' }, ...roomTypeOptions])
  const furnishedFilterOptions = toFilterOptions([{ value: ANY_VALUE, label: 'Any' }, ...furnishedOptions])
  const bedroomOptions = ['Any', '1', '2', '3', '4']
  const petOptions = ['Any', 'Required']
  const parkingOptions = ['Any', 'Required']
  const selectedCategory = draftFilters.listingCategory
  const showEntireFilters = selectedCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY
  const showRoomFilters = [LISTING_CATEGORIES.PRIVATE_ROOM, LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM, 'room'].includes(selectedCategory)

  const updateDraft = (field, value) => {
    setDraftFilters((current) => {
      if (field !== 'listingCategory') return { ...current, [field]: value }
      return {
        ...current,
        listingCategory: value,
        propertyType: ANY_VALUE,
        roomType: 'Any',
        privateBathroom: 'Any',
        billsIncluded: 'Any',
        ownerOccupied: 'Any',
        couplesAccepted: 'Any',
        bedrooms: 'Any',
        pets: 'Any',
        parking: 'Any',
        furnishedPreference: ANY_VALUE,
      }
    })
    setFilterErrors((current) => {
      if (!current[field] && !current.priceRange) return current
      const next = { ...current }
      delete next[field]
      delete next.priceRange
      return next
    })
  }

  const validateFilters = () => {
    const nextErrors = {}
    const min = Number(draftFilters.priceMin)
    const max = Number(draftFilters.priceMax)
    if (draftFilters.priceMin && (!Number.isFinite(min) || min < 0)) nextErrors.priceMin = 'Use a positive minimum rent.'
    if (draftFilters.priceMax && (!Number.isFinite(max) || max < 0)) nextErrors.priceMax = 'Use a positive maximum rent.'
    if (draftFilters.priceMin && draftFilters.priceMax && Number.isFinite(min) && Number.isFinite(max) && min > max) nextErrors.priceRange = 'Minimum rent cannot be higher than maximum rent.'
    if (isPastIsoDate(draftFilters.moveInBy, today)) nextErrors.moveInBy = 'Move-in date cannot be in the past.'
    setFilterErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const applyFilters = () => {
    if (!validateFilters()) return
    setPropertyFilters(canAdvanced ? draftFilters : stripAdvancedFilters(draftFilters))
    onClose()
  }

  const resetFilters = () => {
    resetPropertyFilters()
    setDraftFilters(emptyPropertyFilters)
    setFilterErrors({})
  }

  const selectedFilters = getFilterLabels(draftFilters)

  return (
    <div className="absolute inset-0 z-50">
      <button type="button" aria-label="Close filters" className="absolute inset-0 bg-slate-950/28 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-0.75rem)] justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] min-[390px]:px-4 md:px-6">
        <div className="card-surface card-shadow flex w-full flex-col overflow-hidden rounded-[32px]">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          <div className="px-4 pb-3 pt-4 min-[390px]:px-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-950">Filters</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Narrow the property deck without changing your renter profile.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  {discoveryProperties.length} properties
                </div>
                <button
                  type="button"
                  aria-label="Close filters"
                  onClick={onClose}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl font-semibold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
                >
                  ×
                </button>
              </div>
            </div>

            {selectedFilters.length ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {selectedFilters.slice(0, 5).map((label) => (
                  <span key={label} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                    {label}
                  </span>
                ))}
                {selectedFilters.length > 5 ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    +{selectedFilters.length - 5}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 rounded-[18px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                No filters selected
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 min-[390px]:px-5">
            <FilterGroup title="Price range">
              <div className="grid grid-cols-2 gap-3">
                <FilterInput
                  label="Min"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="800"
                  value={draftFilters.priceMin}
                  error={filterErrors.priceMin}
                  onChange={(event) => updateDraft('priceMin', event.target.value)}
                />
                <FilterInput
                  label="Max"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="1400"
                  value={draftFilters.priceMax}
                  error={filterErrors.priceMax}
                  onChange={(event) => updateDraft('priceMax', event.target.value)}
                />
              </div>
              {filterErrors.priceRange ? <p className="mt-2 text-xs font-medium text-rose-500">{filterErrors.priceRange}</p> : null}
            </FilterGroup>

            <FilterGroup title="Search details">
              <div className="grid gap-3">
                <FilterSelect
                  label="Location"
                  value={draftFilters.location}
                  onChange={(event) => updateDraft('location', event.target.value)}
                  options={locations}
                />
                <FilterInput
                  label="Move-in by"
                  type="date"
                  min={today}
                  value={draftFilters.moveInBy}
                  error={filterErrors.moveInBy}
                  onChange={(event) => updateDraft('moveInBy', event.target.value)}
                />
                <FilterSelect
                  label="Listing category"
                  value={draftFilters.listingCategory}
                  onChange={(event) => updateDraft('listingCategory', event.target.value)}
                  options={categoryFilterOptions}
                />
              </div>
            </FilterGroup>

            {showEntireFilters ? (
              <FilterGroup title="Entire property fit" plusLabel locked={!canAdvanced} onUpgrade={() => { onClose(); navigate('/profile') }}>
                <div className="grid gap-3">
                  <FilterSelect
                    label="Property type"
                    disabled={!canAdvanced}
                    value={draftFilters.propertyType}
                    onChange={(event) => updateDraft('propertyType', event.target.value)}
                    options={propertyTypeFilterOptions}
                  />
                  <FilterSelect
                    label="Furnished"
                    disabled={!canAdvanced}
                    value={draftFilters.furnishedPreference}
                    onChange={(event) => updateDraft('furnishedPreference', event.target.value)}
                    options={furnishedFilterOptions}
                  />
                  <FilterSelect
                    label="Minimum bedrooms"
                    disabled={!canAdvanced}
                    value={draftFilters.bedrooms}
                    onChange={(event) => updateDraft('bedrooms', event.target.value)}
                    options={bedroomOptions}
                  />
                  <FilterSelect
                    label="Pets"
                    disabled={!canAdvanced}
                    value={draftFilters.pets}
                    onChange={(event) => updateDraft('pets', event.target.value)}
                    options={petOptions}
                  />
                  <FilterSelect
                    label="Parking"
                    disabled={!canAdvanced}
                    value={draftFilters.parking}
                    onChange={(event) => updateDraft('parking', event.target.value)}
                    options={parkingOptions}
                  />
                </div>
              </FilterGroup>
            ) : null}

            {showRoomFilters ? (
              <FilterGroup title="Room fit" plusLabel locked={!canAdvanced} onUpgrade={() => { onClose(); navigate('/profile') }}>
                <div className="grid gap-3">
                  <FilterSelect
                    label="Room type"
                    disabled={!canAdvanced}
                    value={draftFilters.roomType}
                    onChange={(event) => updateDraft('roomType', event.target.value)}
                    options={roomTypeFilterOptions}
                  />
                  <FilterSelect
                    label="Private bathroom"
                    disabled={!canAdvanced}
                    value={draftFilters.privateBathroom}
                    onChange={(event) => updateDraft('privateBathroom', event.target.value)}
                    options={['Any', 'Required']}
                  />
                  <FilterSelect
                    label="Bills included"
                    disabled={!canAdvanced}
                    value={draftFilters.billsIncluded}
                    onChange={(event) => updateDraft('billsIncluded', event.target.value)}
                    options={['Any', 'Required']}
                  />
                  <FilterSelect
                    label="Owner occupied"
                    disabled={!canAdvanced}
                    value={draftFilters.ownerOccupied}
                    onChange={(event) => updateDraft('ownerOccupied', event.target.value)}
                    options={['Any', 'Required', 'Excluded']}
                  />
                  <FilterSelect
                    label="Couples accepted"
                    disabled={!canAdvanced}
                    value={draftFilters.couplesAccepted}
                    onChange={(event) => updateDraft('couplesAccepted', event.target.value)}
                    options={['Any', 'Required']}
                  />
                  <FilterSelect
                    label="Furnished"
                    disabled={!canAdvanced}
                    value={draftFilters.furnishedPreference}
                    onChange={(event) => updateDraft('furnishedPreference', event.target.value)}
                    options={furnishedFilterOptions}
                  />
                  <FilterSelect
                    label="Parking"
                    disabled={!canAdvanced}
                    value={draftFilters.parking}
                    onChange={(event) => updateDraft('parking', event.target.value)}
                    options={parkingOptions}
                  />
                </div>
              </FilterGroup>
            ) : null}
          </div>

          <div className="border-t border-slate-100 bg-white/88 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur min-[390px]:px-5">
            <div className="grid grid-cols-[0.9fr_1.1fr] gap-3">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={resetFilters}
                disabled={activeFilterCount === 0 && selectedFilters.length === 0}
              >
                Reset
              </Button>
              <Button className="flex-1" onClick={applyFilters}>
                Show properties
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterGroup({ title, plusLabel = false, locked = false, onUpgrade, children }) {
  return (
    <section className="surface-line rounded-[24px] bg-white/76 p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {plusLabel ? (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-indigo-700">Gafflo+</span>
        ) : null}
      </div>
      <div className={`mt-3 ${locked ? 'opacity-60' : ''}`}>{children}</div>
      {locked ? (
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-3 text-xs font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          Unlock these filters with Gafflo+
        </button>
      ) : null}
    </section>
  )
}

function FilterInput({ label, ...props }) {
  const { error, ...inputProps } = props
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <input
        className={`min-h-12 w-full rounded-[18px] border bg-white px-4 py-3 text-base text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-emerald-50/20 focus:ring-4 focus:ring-emerald-100 ${error ? 'border-rose-300 bg-rose-50/40 focus:border-rose-300 focus:ring-rose-100' : 'border-indigo-100'}`}
        aria-invalid={error ? 'true' : undefined}
        {...inputProps}
      />
      {error ? <span className="mt-2 block text-xs font-medium text-rose-500">{error}</span> : null}
    </label>
  )
}

function FilterSelect({ label, options, value, onChange, disabled }) {
  const listOptions = options.map((option) => {
    const [optionValue, optionLabel = optionValue] = String(option).split('|')
    return { value: optionValue, label: optionLabel }
  })
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <GaffloSelect ariaLabel={label} options={listOptions} value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function getFilterLabels(filters) {
  return [
    filters.priceMin ? `From €${filters.priceMin}` : null,
    filters.priceMax ? `Up to €${filters.priceMax}` : null,
    filters.location !== 'Any' ? filters.location : null,
    filters.moveInBy ? `By ${filters.moveInBy}` : null,
    !['Any', ANY_VALUE].includes(filters.listingCategory) ? (filters.listingCategory === 'room' ? 'Any room' : listingCategoryOptions.find((item) => item.value === filters.listingCategory)?.label) : null,
    !['Any', ANY_VALUE].includes(filters.propertyType) ? domainLabel('propertyType', filters.propertyType) : null,
    filters.roomType !== 'Any' ? domainLabel('roomType', filters.roomType) : null,
    filters.privateBathroom !== 'Any' ? 'Private bathroom' : null,
    filters.billsIncluded !== 'Any' ? 'Bills included' : null,
    filters.ownerOccupied !== 'Any' ? `Owner occupied ${filters.ownerOccupied.toLowerCase()}` : null,
    filters.couplesAccepted !== 'Any' ? 'Couples accepted' : null,
    !['Any', ANY_VALUE].includes(filters.furnishedPreference) ? domainLabel('furnished', filters.furnishedPreference) : null,
    filters.bedrooms !== 'Any' ? `${filters.bedrooms}+ bedrooms` : null,
    filters.pets !== 'Any' ? 'Pets needed' : null,
    filters.parking !== 'Any' ? 'Parking required' : null,
    !['Any', ANY_VALUE].includes(filters.leaseLength) ? `${domainLabel('lease', filters.leaseLength)} lease` : null,
  ].filter(Boolean)
}

function toFilterOptions(options) {
  return options.map((option) => `${option.value}|${option.label}`)
}
