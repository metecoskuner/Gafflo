import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import BrandLogo from './components/BrandLogo'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import PropertyDetailsModal from './components/PropertyDetailsModal'
import Button from './components/Button'
import { AppStateProvider } from './context/MarketplaceState'
import useAppState from './context/useAppState'
import { getTodayIsoDate, isPastIsoDate } from './utils/dateUtils'
import Dashboard from './pages/Dashboard'
import CreateListing from './pages/CreateListing'
import Messages from './pages/Messages'
import SavedProperties from './pages/SavedProperties'
import DiscoverProperties from './pages/DiscoverProperties'
import TenantProfile from './pages/Profile'
import RoleSelection from './pages/RoleSelection'
import LandlordProperties from './pages/LandlordProperties'
import Applicants from './pages/Applicants'

const emptyPropertyFilters = {
  priceMin: '',
  priceMax: '',
  location: 'Any',
  moveInBy: '',
  propertyType: 'Any',
  furnishedPreference: 'Any',
  bedrooms: 'Any',
  pets: 'Any',
  parking: 'Any',
  leaseLength: 'Any',
}

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation
  const routeLocation = backgroundLocation || location
  const isLandingPage = routeLocation.pathname === '/'
  const isAppRoute = !isLandingPage
  const { activeFilterCount, hasSelectedRole, role } = useAppState()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
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

  if (!hasSelectedRole) return <RoleSelection />

  return (
    <>
      {isAppRoute ? (
        <div className="page-shell relative mx-auto h-[100dvh] w-full max-w-[560px] overflow-hidden md:max-w-[620px]">
          <AppHeader
            activeFilterCount={activeFilterCount}
            homeRoute={homeRoute}
            showCreateAction={role === 'landlord'}
            onCreateListing={() => navigate('/listings/new')}
            onFilterOpen={role === 'tenant' ? () => setIsFilterOpen(true) : null}
          />
          <main
            id="app-shell-scroll"
            className="h-[100dvh] overflow-y-auto px-4 pb-[calc(9.75rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+5.5rem)] md:px-6"
          >
            <Routes location={routeLocation}>
              <Route path="/profile" element={<TenantProfile />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/discover" element={<DiscoverProperties />} />
              <Route path="/properties" element={role === 'landlord' ? <LandlordProperties /> : <DiscoverProperties />} />
              <Route path="/properties/manage" element={<LandlordProperties />} />
              <Route path="/rooms" element={<Navigate to="/properties" replace />} />
              <Route path="/applicants" element={role === 'landlord' ? <Applicants /> : <Navigate to="/discover" replace />} />
              <Route path="/listings/new" element={role === 'landlord' ? <CreateListing /> : <Navigate to="/discover" replace />} />
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
              <Route path="/properties/manage" element={<LandlordProperties />} />
              <Route path="/rooms" element={<Navigate to="/properties" replace />} />
              <Route path="/applicants" element={role === 'landlord' ? <Applicants /> : <Navigate to="/discover" replace />} />
              <Route path="/listings/new" element={role === 'landlord' ? <CreateListing /> : <Navigate to="/discover" replace />} />
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

      {backgroundLocation ? (
        <Routes>
          <Route path="/properties/:propertyId" element={<PropertyDetailsModal />} />
          <Route path="/rooms/:propertyId" element={<NavigateToPropertyDetails />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/properties/:propertyId" element={<PropertyDetailsModal standalone />} />
          <Route path="/rooms/:propertyId" element={<NavigateToPropertyDetails />} />
        </Routes>
      )}
    </>
  )
}

export default function App() {
  return (
    <AppStateProvider>
      <AppLayout />
    </AppStateProvider>
  )
}

function AppHeader({ activeFilterCount, homeRoute, showCreateAction, onCreateListing, onFilterOpen }) {
  const navigate = useNavigate()

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] md:px-6">
      <div className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-[22px] border border-white/75 bg-white/90 px-3 py-3 shadow-[0_18px_38px_-26px_rgba(30,27,75,0.34)] backdrop-blur-xl min-[375px]:px-4">
        <button
          type="button"
          aria-label="Go to Gafflo home"
          onClick={() => navigate(homeRoute)}
          className="rounded-2xl outline-none transition active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          <BrandLogo size="sm" className="max-w-[112px] min-[375px]:max-w-none" />
        </button>

        <div className="flex items-center gap-2">
          {showCreateAction ? <HeaderIconButton ariaLabel="Create listing" icon="+" onClick={onCreateListing} /> : null}
          {onFilterOpen ? <HeaderIconButton ariaLabel="Open filters" badge={activeFilterCount} icon="☷" onClick={onFilterOpen} /> : null}
        </div>
      </div>
    </div>
  )
}

function HeaderIconButton({ ariaLabel, badge = 0, disabled = false, icon, onClick }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/88 text-lg text-slate-700 shadow-soft transition hover:bg-white active:scale-[0.97] disabled:opacity-45"
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
  } = useAppState()
  const [draftFilters, setDraftFilters] = useState(propertyFilters)
  const [filterErrors, setFilterErrors] = useState({})
  const today = getTodayIsoDate()

  const locations = [
    'Any',
    ...Array.from(new Set(properties.flatMap((property) => [property.city, property.area]))).sort((a, b) => a.localeCompare(b)),
  ]
  const propertyTypeOptions = ['Any', ...Array.from(new Set(properties.map((property) => property.propertyType))).filter(Boolean).sort()]
  const furnishedOptions = ['Any', 'Furnished', 'Part-furnished', 'Unfurnished']
  const bedroomOptions = ['Any', '1', '2', '3', '4']
  const petOptions = ['Any', 'Required']
  const parkingOptions = ['Any', 'Required']
  const leaseOptions = ['Any', '6 months', '12 months', '18 months']

  const updateDraft = (field, value) => {
    setDraftFilters((current) => ({ ...current, [field]: value }))
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
    setPropertyFilters(draftFilters)
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
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6">
        <div className="card-surface card-shadow flex w-full flex-col overflow-hidden rounded-[32px]">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          <div className="px-5 pb-3 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">Filters</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Narrow the property deck without changing your renter profile.
                </p>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                {discoveryProperties.length} properties
              </div>
            </div>

            {selectedFilters.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedFilters.map((label) => (
                  <span key={label} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-[18px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                No filters selected
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
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
              </div>
            </FilterGroup>

            <FilterGroup title="Property fit">
              <div className="grid gap-3">
                <FilterSelect
                  label="Property type"
                  value={draftFilters.propertyType}
                  onChange={(event) => updateDraft('propertyType', event.target.value)}
                  options={propertyTypeOptions}
                />
                <FilterSelect
                  label="Furnished"
                  value={draftFilters.furnishedPreference}
                  onChange={(event) => updateDraft('furnishedPreference', event.target.value)}
                  options={furnishedOptions}
                />
                <FilterSelect
                  label="Minimum bedrooms"
                  value={draftFilters.bedrooms}
                  onChange={(event) => updateDraft('bedrooms', event.target.value)}
                  options={bedroomOptions}
                />
                <FilterSelect
                  label="Pets"
                  value={draftFilters.pets}
                  onChange={(event) => updateDraft('pets', event.target.value)}
                  options={petOptions}
                />
                <FilterSelect
                  label="Parking"
                  value={draftFilters.parking}
                  onChange={(event) => updateDraft('parking', event.target.value)}
                  options={parkingOptions}
                />
                <FilterSelect
                  label="Lease length"
                  value={draftFilters.leaseLength}
                  onChange={(event) => updateDraft('leaseLength', event.target.value)}
                  options={leaseOptions}
                />
              </div>
            </FilterGroup>
          </div>

          <div className="border-t border-slate-100 bg-white/88 px-5 pb-5 pt-4 backdrop-blur">
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

function FilterGroup({ title, children }) {
  return (
    <section className="surface-line rounded-[24px] bg-white/76 p-4">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-3">{children}</div>
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

function FilterSelect({ label, options, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <select
        className="min-h-12 w-full rounded-[18px] border border-indigo-100 bg-white px-4 py-3 text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-emerald-50/20 focus:ring-4 focus:ring-emerald-100"
        {...props}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function getFilterLabels(filters) {
  return [
    filters.priceMin ? `From €${filters.priceMin}` : null,
    filters.priceMax ? `Up to €${filters.priceMax}` : null,
    filters.location !== 'Any' ? filters.location : null,
    filters.moveInBy ? `By ${filters.moveInBy}` : null,
    filters.propertyType !== 'Any' ? filters.propertyType : null,
    filters.furnishedPreference !== 'Any' ? filters.furnishedPreference : null,
    filters.bedrooms !== 'Any' ? `${filters.bedrooms}+ bedrooms` : null,
    filters.pets !== 'Any' ? 'Pets needed' : null,
    filters.parking !== 'Any' ? 'Parking required' : null,
    filters.leaseLength !== 'Any' ? `${filters.leaseLength}+ lease` : null,
  ].filter(Boolean)
}
