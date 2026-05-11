import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import RoomDetailsModal from './components/RoomDetailsModal'
import Button from './components/Button'
import { AppStateProvider } from './context/AppState'
import useAppState from './context/useAppState'
import Home from './pages/Home'
import CreateListing from './pages/CreateListing'
import Messages from './pages/Messages'
import SavedRooms from './pages/SavedRooms'
import SwipeRooms from './pages/SwipeRooms'
import TenantProfile from './pages/TenantProfile'

const emptyRoomFilters = {
  priceMin: '',
  priceMax: '',
  location: 'Any',
  moveInBy: '',
  genderPreference: 'Any',
  occupationType: 'Any',
  smokingPreference: 'Any',
  petFriendliness: 'Any',
  lifestylePreference: 'Any',
}

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation
  const routeLocation = backgroundLocation || location
  const isLandingPage = routeLocation.pathname === '/'
  const isAppRoute = !isLandingPage
  const { activeFilterCount, canUndo, hasCompletedOnboarding, onboarding, undoLastAction } = useAppState()
  const [isFilterOpen, setIsFilterOpen] = useState(false)

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

  const handleUndo = () => {
    if (!undoLastAction()) return
    const shell = document.getElementById('app-shell-scroll')
    shell?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  return (
    <>
      {isAppRoute ? (
        <div className="page-shell relative mx-auto h-[100dvh] w-full max-w-[560px] overflow-hidden md:max-w-[620px]">
          <AppHeader
            activeFilterCount={activeFilterCount}
            canUndo={canUndo}
            showCreateAction={onboarding?.userType === 'offering'}
            onCreateListing={() => navigate('/create')}
            onFilterOpen={() => setIsFilterOpen(true)}
            onUndo={handleUndo}
          />
          <main
            id="app-shell-scroll"
            className="h-[100dvh] overflow-y-auto px-4 pb-[calc(9.75rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+5.5rem)] md:px-6"
          >
            <Routes location={routeLocation}>
              <Route path="/profile" element={<TenantProfile />} />
              <Route path="/rooms" element={<SwipeRooms />} />
              <Route path="/create" element={<CreateListing />} />
              <Route path="/saved" element={<SavedRooms />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <BottomNav />
          <FilterSheet
            isOpen={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
            onUpdateProfile={() => {
              setIsFilterOpen(false)
              navigate('/profile')
            }}
          />
          {!hasCompletedOnboarding ? <OnboardingFlow /> : null}
        </div>
      ) : (
        <div className="page-shell mx-auto flex min-h-screen w-full max-w-[1120px] flex-col px-4 pb-10 md:px-6 md:pb-12">
          <Navbar />
          <main className="flex-1 py-4 md:py-7">
            <Routes location={routeLocation}>
              <Route path="/" element={<Home />} />
              <Route path="/profile" element={<TenantProfile />} />
              <Route path="/rooms" element={<SwipeRooms />} />
              <Route path="/create" element={<CreateListing />} />
              <Route path="/saved" element={<SavedRooms />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      )}

      {backgroundLocation ? (
        <Routes>
          <Route path="/rooms/:roomId" element={<RoomDetailsModal />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/rooms/:roomId" element={<RoomDetailsModal standalone />} />
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

function AppHeader({ activeFilterCount, canUndo, showCreateAction, onCreateListing, onUndo, onFilterOpen }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] md:px-6">
      <div className="pointer-events-auto flex w-full items-center justify-between rounded-[24px] border border-white/70 bg-[rgba(255,247,237,0.82)] px-4 py-3 shadow-[0_18px_38px_-26px_rgba(15,23,42,0.34)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="shadow-pressable flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-base font-semibold text-white">
            ⌂
          </div>
          <div className="text-lg font-semibold tracking-tight text-slate-950">Gaffly</div>
        </div>

        <div className="flex items-center gap-2">
          {showCreateAction ? <HeaderIconButton ariaLabel="Create listing" icon="+" onClick={onCreateListing} /> : null}
          <HeaderIconButton ariaLabel="Undo last swipe" disabled={!canUndo} icon="↶" onClick={onUndo} />
          <HeaderIconButton ariaLabel="Open filters" badge={activeFilterCount} icon="☷" onClick={onFilterOpen} />
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

function FilterSheet({ isOpen, onClose }) {
  const { activeFilterCount, discoveryRooms, roomFilters, rooms, resetRoomFilters, setRoomFilters } = useAppState()
  const [draftFilters, setDraftFilters] = useState(roomFilters)

  useEffect(() => {
    if (isOpen) setDraftFilters(roomFilters)
  }, [isOpen, roomFilters])

  if (!isOpen) return null

  const locations = [
    'Any',
    ...Array.from(new Set(rooms.flatMap((room) => [room.city, room.area]))).sort((a, b) => a.localeCompare(b)),
  ]
  const genderOptions = ['Any', 'Female preferred', 'Male preferred']
  const occupationOptions = ['Any', 'Full-time', 'Part-time', 'Student', 'Remote worker']
  const smokingOptions = ['Any', 'No smoking', 'Outside ok', 'Smoking friendly']
  const petOptions = ['Any', 'Comfortable', 'Not comfortable']
  const lifestyleOptions = ['Any', 'Quiet', 'Balanced', 'Social']

  const updateDraft = (field, value) => {
    setDraftFilters((current) => ({ ...current, [field]: value }))
  }

  const applyFilters = () => {
    setRoomFilters(draftFilters)
    onClose()
  }

  const resetFilters = () => {
    resetRoomFilters()
    setDraftFilters(emptyRoomFilters)
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
                  Narrow the room deck without changing your profile.
                </p>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                {discoveryRooms.length} rooms
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
                  placeholder="800"
                  value={draftFilters.priceMin}
                  onChange={(event) => updateDraft('priceMin', event.target.value)}
                />
                <FilterInput
                  label="Max"
                  type="number"
                  placeholder="1400"
                  value={draftFilters.priceMax}
                  onChange={(event) => updateDraft('priceMax', event.target.value)}
                />
              </div>
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
                  value={draftFilters.moveInBy}
                  onChange={(event) => updateDraft('moveInBy', event.target.value)}
                />
              </div>
            </FilterGroup>

            <FilterGroup title="Household fit">
              <div className="grid gap-3">
                <FilterSelect
                  label="Gender preference"
                  value={draftFilters.genderPreference}
                  onChange={(event) => updateDraft('genderPreference', event.target.value)}
                  options={genderOptions}
                />
                <FilterSelect
                  label="Occupation type"
                  value={draftFilters.occupationType}
                  onChange={(event) => updateDraft('occupationType', event.target.value)}
                  options={occupationOptions}
                />
                <FilterSelect
                  label="Smoking"
                  value={draftFilters.smokingPreference}
                  onChange={(event) => updateDraft('smokingPreference', event.target.value)}
                  options={smokingOptions}
                />
                <FilterSelect
                  label="Pets"
                  value={draftFilters.petFriendliness}
                  onChange={(event) => updateDraft('petFriendliness', event.target.value)}
                  options={petOptions}
                />
                <FilterSelect
                  label="Lifestyle"
                  value={draftFilters.lifestylePreference}
                  onChange={(event) => updateDraft('lifestylePreference', event.target.value)}
                  options={lifestyleOptions}
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
                Show rooms
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
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <input
        className="min-h-12 w-full rounded-[18px] border border-orange-100 bg-white px-4 py-3 text-base text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-emerald-50/20 focus:ring-4 focus:ring-emerald-100"
        {...props}
      />
    </label>
  )
}

function FilterSelect({ label, options, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <select
        className="min-h-12 w-full rounded-[18px] border border-orange-100 bg-white px-4 py-3 text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-emerald-50/20 focus:ring-4 focus:ring-emerald-100"
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
    filters.genderPreference !== 'Any' ? filters.genderPreference : null,
    filters.occupationType !== 'Any' ? filters.occupationType : null,
    filters.smokingPreference !== 'Any' ? filters.smokingPreference : null,
    filters.petFriendliness !== 'Any' ? filters.petFriendliness : null,
    filters.lifestylePreference !== 'Any' ? filters.lifestylePreference : null,
  ].filter(Boolean)
}

function OnboardingFlow() {
  const { completeOnboarding, rooms, skipOnboarding } = useAppState()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    userType: 'looking',
    budgetMin: '900',
    budgetMax: '1300',
    preferredArea: 'Any',
    moveInDate: '',
    lifestylePreference: 'Balanced',
  })
  const totalSteps = 4
  const locations = [
    'Any',
    ...Array.from(new Set(rooms.flatMap((room) => [room.city, room.area]))).sort((a, b) => a.localeCompare(b)),
  ]

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const finish = () => {
    completeOnboarding(form)
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-end bg-slate-950/38 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-[3px] md:items-center md:justify-center">
      <div className="card-surface card-shadow w-full overflow-hidden rounded-[32px] md:max-w-[520px]">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-5 py-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Welcome to Gaffly</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Personalize your room deck</h2>
            </div>
            <button type="button" onClick={skipOnboarding} className="rounded-full bg-white/12 px-3 py-2 text-xs font-semibold text-white">
              Skip
            </button>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div key={index} className={`h-1.5 rounded-full ${index <= step ? 'bg-emerald-400' : 'bg-white/18'}`} />
            ))}
          </div>
        </div>

        <div className="min-h-[22rem] px-5 py-5">
          {step === 0 ? (
            <OnboardingStep title="What are you here to do?" description="We’ll tune the first session around your goal.">
              <div className="grid gap-3">
                <ChoiceCard
                  active={form.userType === 'looking'}
                  title="I’m looking for a room"
                  body="Build a renter shortlist and compare matches."
                  onClick={() => updateField('userType', 'looking')}
                />
                <ChoiceCard
                  active={form.userType === 'offering'}
                  title="I’m offering a room"
                  body="Preview the renter experience before landlord tools arrive."
                  onClick={() => updateField('userType', 'offering')}
                />
              </div>
            </OnboardingStep>
          ) : null}

          {step === 1 ? (
            <OnboardingStep title="Budget and area" description="Set the range and primary area you want to see first.">
              <div className="grid grid-cols-2 gap-3">
                <FilterInput label="Min budget" type="number" value={form.budgetMin} onChange={(event) => updateField('budgetMin', event.target.value)} />
                <FilterInput label="Max budget" type="number" value={form.budgetMax} onChange={(event) => updateField('budgetMax', event.target.value)} />
              </div>
              <div className="mt-4">
                <FilterSelect label="Preferred areas" value={form.preferredArea} onChange={(event) => updateField('preferredArea', event.target.value)} options={locations} />
              </div>
            </OnboardingStep>
          ) : null}

          {step === 2 ? (
            <OnboardingStep title="Timing and vibe" description="A couple of details make the first deck feel relevant.">
              <div className="grid gap-4">
                <FilterInput label="Move-in date" type="date" value={form.moveInDate} onChange={(event) => updateField('moveInDate', event.target.value)} />
                <div>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Lifestyle</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['Quiet', 'Balanced', 'Social'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateField('lifestylePreference', option)}
                        className={`min-h-12 rounded-[18px] border px-3 text-sm font-semibold transition ${
                          form.lifestylePreference === option
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-soft'
                            : 'border-orange-100 bg-white text-slate-600'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </OnboardingStep>
          ) : null}

          {step === 3 ? (
            <OnboardingStep title="Your first deck is ready" description="These choices will prefill discovery filters and stay saved on this device.">
              <div className="grid gap-2">
                {[
                  form.userType === 'looking' ? 'Looking for a room' : 'Offering a room',
                  `€${form.budgetMin || '0'} - €${form.budgetMax || 'any'}`,
                  form.preferredArea,
                  form.moveInDate || 'Flexible move-in',
                  form.lifestylePreference,
                ].map((item) => (
                  <div key={item} className="surface-line rounded-[18px] bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </OnboardingStep>
          ) : null}
        </div>

        <div className="grid grid-cols-[0.85fr_1.15fr] gap-3 border-t border-slate-100 bg-white/88 px-5 pb-5 pt-4">
          <Button variant="secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            Back
          </Button>
          <Button onClick={step === totalSteps - 1 ? finish : () => setStep((current) => Math.min(totalSteps - 1, current + 1))}>
            {step === totalSteps - 1 ? 'Start discovery' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function OnboardingStep({ title, description, children }) {
  return (
    <section>
      <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function ChoiceCard({ active, title, body, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`surface-line rounded-[24px] p-4 text-left transition ${
        active ? 'border-emerald-200 bg-emerald-50/78 shadow-soft' : 'bg-white hover:bg-slate-50'
      }`}
    >
      <div className="text-base font-semibold text-slate-950">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
    </button>
  )
}
