import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import GaffloPlusPreview from '../components/GaffloPlusPreview'
import LandlordPlansPreview from '../components/LandlordPlansPreview'
import PricingEntryCard from '../components/PricingEntryCard'
import SegmentedControl from '../components/SegmentedControl'
import SelectInput from '../components/SelectInput'
import Toggle from '../components/Toggle'
import { getActiveListingAllowance } from '../config/entitlements'
import { getLandlordPlanConfig, getTenantPlanConfig, LANDLORD_PLAN, TENANT_PLAN } from '../config/pricingPlans'
import {
  ANY_VALUE,
  furnishedOptions,
  leasePreferenceOptions,
  normalizeFurnished,
  normalizeLeaseMonths,
  normalizeParking,
  normalizePet,
  normalizeSmoking,
  parkingNeedOptions,
  petOptions,
  smokingOptions,
  withAny,
} from '../config/domainOptions'
import { cityOptions, getAreaOptionsForCity, normalizePreferredAreas, resetAreasForCityChange } from '../config/locationOptions'
import { getTenantProfileCompleteness } from '../config/rentalJourney'
import { LISTING_CATEGORIES } from '../config/listingCategories'
import useAccountProfile from '../context/useAccountProfile'
import useAppState from '../context/useAppState'
import useAuth from '../context/useAuth'
import useIsModerator from '../context/useIsModerator'
import { getTodayIsoDate, isPastIsoDate } from '../utils/dateUtils'

const lookingForChoices = [
  { value: LISTING_CATEGORIES.ENTIRE_PROPERTY, label: 'Entire property' },
  { value: 'room', label: 'A room' },
  { value: 'any', label: 'Either' },
]

// A step ladder, not a free-typed number — "0" never appears as a real, selectable value, and
// the unset ends are explicit ("No minimum"/"No maximum") rather than an empty box that reads as
// unfinished. Stored value stays the exact same empty-string-means-unset contract the rest of
// this form (validateField, submit) already relies on — this only changes how the value is
// chosen, never what gets saved for "not answered."
const BUDGET_STEPS = [600, 800, 1000, 1200, 1500, 1800, 2000, 2500, 3000]
const budgetMinOptions = [
  { label: 'No minimum', value: '' },
  ...BUDGET_STEPS.map((amount) => ({ label: `€${amount.toLocaleString('en-IE')}`, value: String(amount) })),
]
const budgetMaxOptions = [
  { label: 'No maximum', value: '' },
  ...BUDGET_STEPS.map((amount, index) => ({
    label: index === BUDGET_STEPS.length - 1 ? `€${amount.toLocaleString('en-IE')}+` : `€${amount.toLocaleString('en-IE')}`,
    value: String(amount),
  })),
]

// GaffloSelect matches its current value by strict equality against each option's string value —
// an existing saved budget can arrive here as a real number (a Postgres numeric column, read back
// as a JS number) rather than the string a <select> naturally works in, so this normalizes either
// shape to the one string form the options list uses. A literal 0 (a real value at least one
// existing tenant profile has — see e2e/global-setup.js's tenantBudgetMinZero fixture) is treated
// the same as unset: this UI's whole point is that a shown "0" reads as broken, not as "any price."
function budgetSelectValue(value) {
  const numeric = Number(value)
  return value === null || value === undefined || value === '' || !Number.isFinite(numeric) || numeric <= 0 ? '' : String(numeric)
}

// validateField's budgetMin/budgetMax checks used to only skip validation for the select's own ''
// sentinel, missing the genuinely-untouched null/undefined a fresh tenant profile has before the
// budget selector is ever opened — Number(undefined) is NaN, so that state tripped "cannot be
// negative" and silently blocked the whole form. Shares budgetSelectValue()'s unset definition
// rather than re-deriving it, so this can't drift from what the selector itself treats as unset.
function isBudgetValueUnset(value) {
  return budgetSelectValue(value) === ''
}

// A saved budget from before this step ladder existed (or just not one of the round steps) must
// still display as itself, not silently snap to "unset" — inserted in sorted position rather than
// dropped, so an existing preference is never misrepresented back to the tenant who set it.
function withCurrentBudgetValue(baseOptions, currentValue) {
  const selected = budgetSelectValue(currentValue)
  if (!selected || baseOptions.some((option) => option.value === selected)) return baseOptions
  const extra = { label: `€${Number(selected).toLocaleString('en-IE')}`, value: selected }
  return [...baseOptions, extra].sort((a, b) => (a.value === '' ? -1 : b.value === '' ? 1 : Number(a.value) - Number(b.value)))
}

const employmentOptions = ['Full-time', 'Part-time', 'Student', 'Remote worker', 'Self-employed']
const contactOptions = ['In-app message', 'Email', 'Phone']

export default function Profile() {
  const { activeRole: role } = useAccountProfile()
  return role === 'landlord' ? <LandlordProfile /> : <TenantProfile />
}

function TenantProfile() {
  const navigate = useNavigate()
  const { tenantPlan } = useAppState()
  const { profile, tenantProfile, updateDisplayName, updateTenantProfile } = useAccountProfile()
  const gaffloPlus = getTenantPlanConfig(TENANT_PLAN.GAFFLO_PLUS)
  const today = getTodayIsoDate()
  const [form, setForm] = useState(() => ({
    ...tenantProfile,
    // tenant_profiles has no name column — the account-level display name lives on `profiles`
    // (AccountProfileProvider), so it's merged in here and saved back separately on submit.
    name: profile?.displayName || '',
    preferredAreas: normalizePreferredAreas(tenantProfile.preferredAreas || [], tenantProfile.targetCity),
    areaDraft: '',
    leaseLength: normalizeLeaseMonths(tenantProfile.leaseLength, 12),
    furnishedPreference: ['Any', ANY_VALUE].includes(tenantProfile.furnishedPreference) ? ANY_VALUE : normalizeFurnished(tenantProfile.furnishedPreference),
    pets: normalizePet(tenantProfile.pets),
    smoking: normalizeSmoking(tenantProfile.smoking),
    parkingNeeded: normalizeParking(tenantProfile.parkingNeeded) === 'none' ? 'no' : 'yes',
    applyingAsCouple: Boolean(tenantProfile.applyingAsCouple ?? tenantProfile.coupleRequirement),
  }))
  const [errors, setErrors] = useState(() =>
    isPastIsoDate(tenantProfile.moveInDate, today) ? { moveInDate: 'Move-in date cannot be in the past.' } : {},
  )
  const areaOptions = useMemo(() => getAreaOptionsForCity(form.targetCity || 'Dublin'), [form.targetCity])
  const completeness = getTenantProfileCompleteness(form)
  const [showGaffloPlus, setShowGaffloPlus] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const validateField = (field, value, nextForm = form) => {
    const minBudget = Number(field === 'budgetMin' ? value : nextForm.budgetMin)
    const maxBudget = Number(field === 'budgetMax' ? value : nextForm.budgetMax)
    const validators = {
      name: () => (String(value || '').length > 80 ? 'Keep your name under 80 characters.' : ''),
      // A budget side is "unset" as either the select's own '' sentinel or a genuinely untouched
      // null/undefined (e.g. a fresh tenant profile that never had budgetMin/budgetMax written at
      // all) — only householdSize handled both forms before this fix; budgetMin/budgetMax checked
      // only for '', so Number(undefined) = NaN tripped the "cannot be negative" branch and
      // silently blocked saving the entire form for anyone who'd never touched the budget selector.
      budgetMin: () => {
        if (isBudgetValueUnset(value)) return ''
        if (!Number.isFinite(minBudget) || minBudget < 0) return 'Minimum budget cannot be negative.'
        if (!isBudgetValueUnset(nextForm.budgetMax) && minBudget > maxBudget) return 'Minimum budget cannot be higher than maximum budget.'
        return ''
      },
      budgetMax: () => {
        if (isBudgetValueUnset(value)) return ''
        if (!Number.isFinite(maxBudget) || maxBudget < 0) return 'Maximum budget cannot be negative.'
        if (!isBudgetValueUnset(nextForm.budgetMin) && minBudget > maxBudget) return 'Maximum budget must be at least the minimum budget.'
        return ''
      },
      moveInDate: () => (isPastIsoDate(value, today) ? 'Move-in date cannot be in the past.' : ''),
      // Empty/unset is a valid "not answered yet" state, not an error — only a filled-in but
      // invalid value (e.g. 0 or negative) should block saving.
      householdSize: () => {
        if (value === '' || value === null || value === undefined) return ''
        return !Number.isFinite(Number(value)) || Number(value) < 1 ? 'Household size must be at least 1.' : ''
      },
      bio: () => (String(value || '').length > 600 ? 'Keep your introduction under 600 characters.' : ''),
      applyingAsCouple: () => (value && Number(nextForm.householdSize) < 2 ? 'Set room applicants to 2 people if you are applying as a couple.' : ''),
    }
    return validators[field]?.() || ''
  }

  const update = (field, value) => {
    setForm((current) => {
      const resetAreas = field === 'targetCity' ? resetAreasForCityChange(current.targetCity, value) : null
      const next = resetAreas ? { ...current, ...resetAreas } : { ...current, [field]: value }
      setErrors((currentErrors) => {
        const nextErrors = { ...currentErrors }
        const error = validateField(field, value, next)
        if (error) nextErrors[field] = error
        else delete nextErrors[field]

        if (field === 'budgetMin' || field === 'budgetMax') {
          const minError = validateField('budgetMin', next.budgetMin, next)
          const maxError = validateField('budgetMax', next.budgetMax, next)
          if (minError) nextErrors.budgetMin = minError
          else delete nextErrors.budgetMin
          if (maxError) nextErrors.budgetMax = maxError
          else delete nextErrors.budgetMax
        }
        if (field === 'householdSize' || field === 'applyingAsCouple') {
          const coupleError = validateField('applyingAsCouple', next.applyingAsCouple, next)
          if (coupleError) nextErrors.applyingAsCouple = coupleError
          else delete nextErrors.applyingAsCouple
        }
        return nextErrors
      })
      return next
    })
  }
  const toggle = (field) => update(field, !form[field])
  // Applying as a couple implies at least 2 applicants — raise the count automatically rather
  // than making the tenant fix a validation error by hand. Turning couple status back off must
  // never reduce the count: two friends applying together (2 applicants, Couple: No) is just as
  // valid a household as a couple, so applicant count and relationship status are only coupled
  // in the couple-on -> minimum-2 direction, never the reverse.
  const setCoupleStatus = (nextValue) => {
    setForm((current) => {
      const currentHousehold = current.householdSize === '' || current.householdSize === null || current.householdSize === undefined
        ? NaN
        : Number(current.householdSize)
      const shouldRaiseHousehold = nextValue && (!Number.isFinite(currentHousehold) || currentHousehold < 2)
      const next = {
        ...current,
        applyingAsCouple: nextValue,
        ...(shouldRaiseHousehold ? { householdSize: 2 } : {}),
      }
      setErrors((currentErrors) => {
        const nextErrors = { ...currentErrors }
        const coupleError = validateField('applyingAsCouple', next.applyingAsCouple, next)
        if (coupleError) nextErrors.applyingAsCouple = coupleError
        else delete nextErrors.applyingAsCouple
        const householdError = validateField('householdSize', next.householdSize, next)
        if (householdError) nextErrors.householdSize = householdError
        else delete nextErrors.householdSize
        return nextErrors
      })
      return next
    })
  }
  const addPreferredArea = (area) => {
    const nextAreas = normalizePreferredAreas([...(form.preferredAreas || []), area], form.targetCity)
    update('preferredAreas', nextAreas)
    update('areaDraft', '')
  }
  const removePreferredArea = (area) => {
    update('preferredAreas', (form.preferredAreas || []).filter((item) => item !== area))
  }

  const submit = async (event) => {
    event.preventDefault()
    const fields = ['name', 'budgetMin', 'budgetMax', 'moveInDate', 'householdSize', 'applyingAsCouple', 'bio']
    const nextErrors = fields.reduce((acc, field) => {
      const error = validateField(field, form[field], form)
      if (error) acc[field] = error
      return acc
    }, {})
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setIsSaving(true)
    setSaveError('')
    const trimmedName = String(form.name || '').trim()
    const [nameResult, tenantResult] = await Promise.all([
      trimmedName !== (profile?.displayName || '') ? updateDisplayName(trimmedName) : Promise.resolve({ error: null }),
      updateTenantProfile({
        ...form,
        preferredAreas: normalizePreferredAreas(form.preferredAreas, form.targetCity),
      }),
    ])
    setIsSaving(false)
    if (nameResult.error || tenantResult.error) {
      setSaveError('Something went wrong saving your profile. Please try again.')
      return
    }
    navigate('/discover')
  }

  return (
    <>
      <ProfileShell eyebrow="Tenant profile" title="Your rental profile" description="These details help rank properties and summarise enquiries. No documents are uploaded.">
        <form onSubmit={submit} className="space-y-4">
          <ProfileCompleteness completeness={completeness} />
          {tenantPlan !== TENANT_PLAN.GAFFLO_PLUS ? (
            <PricingEntryCard
              eyebrow="Upgrade"
              name={gaffloPlus.name}
              priceMonthly={gaffloPlus.priceMonthly}
              tagline="More Smart Match cards, more Interested actions, advanced filters and full application history."
              features={gaffloPlus.features}
              ctaLabel="Explore Gafflo+"
              onExplore={() => setShowGaffloPlus(true)}
            />
          ) : null}
          <Section title="Basics">
            <div className="grid gap-3 min-[430px]:grid-cols-2">
              <FormInput id="tenant-name" label="Name" value={form.name || ''} maxLength={80} error={errors.name} onChange={(event) => update('name', event.target.value)} />
              <SelectInput label="Target city" value={form.targetCity || 'Dublin'} onChange={(event) => update('targetCity', event.target.value)} options={cityOptions.map(option)} />
            </div>
            <PreferredAreasInput
              areaDraft={form.areaDraft || ''}
              areas={form.preferredAreas || []}
              city={form.targetCity || 'Dublin'}
              options={areaOptions}
              onAdd={addPreferredArea}
              onDraft={(value) => update('areaDraft', value)}
              onRemove={removePreferredArea}
            />
          </Section>

          <Section title="Rental needs">
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">Monthly budget</span>
              <div className="grid grid-cols-2 gap-3">
                <SelectInput
                  label="Minimum"
                  value={budgetSelectValue(form.budgetMin)}
                  error={errors.budgetMin}
                  onChange={(event) => update('budgetMin', event.target.value)}
                  options={withCurrentBudgetValue(budgetMinOptions, form.budgetMin)}
                />
                <SelectInput
                  label="Maximum"
                  value={budgetSelectValue(form.budgetMax)}
                  error={errors.budgetMax}
                  onChange={(event) => update('budgetMax', event.target.value)}
                  options={withCurrentBudgetValue(budgetMaxOptions, form.budgetMax)}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">Leave either side as "No minimum/maximum" if you're flexible — it won't count against a match.</p>
            </div>
            <div className="mt-4 grid gap-3 min-[430px]:grid-cols-2 md:grid-cols-3">
              <FormInput id="tenant-move-in" label="Move-in date" type="date" min={today} value={isPastIsoDate(form.moveInDate, today) ? '' : form.moveInDate || ''} error={errors.moveInDate} onChange={(event) => update('moveInDate', event.target.value)} />
              <SelectInput label="Lease length" value={form.leaseLength || '12'} onChange={(event) => update('leaseLength', event.target.value)} options={leasePreferenceOptions} />
              <FormInput id="tenant-household-size" label={form.lookingFor === 'room' ? 'Room applicants' : 'Household size'} type="number" min="1" inputMode="numeric" value={form.householdSize ?? ''} error={errors.householdSize} onChange={(event) => update('householdSize', event.target.value)} />
              <SelectInput label="Furnished" value={form.furnishedPreference || ANY_VALUE} onChange={(event) => update('furnishedPreference', event.target.value)} options={withAny(furnishedOptions)} />
            </div>
            <div className="mt-4 space-y-3">
              <SegmentedControl
                label="Looking for"
                value={form.lookingFor || 'any'}
                onChange={(value) => update('lookingFor', value)}
                options={lookingForChoices}
              />
              {form.lookingFor === 'room' ? (
                <Toggle label="Owner-occupied acceptable" checked={form.ownerOccupiedAcceptable !== false} onChange={() => update('ownerOccupiedAcceptable', form.ownerOccupiedAcceptable === false)} />
              ) : null}
            </div>
            {form.lookingFor === 'room' ? (
              <details className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3" open>
                <summary className="cursor-pointer text-sm font-semibold text-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100">
                  Room preferences
                </summary>
                <div className="mt-3 grid gap-3 min-[430px]:grid-cols-2">
                  <Toggle label="Private bathroom preferred" checked={Boolean(form.privateBathroomPreferred)} onChange={() => toggle('privateBathroomPreferred')} />
                  <Toggle label="Bills included preferred" checked={Boolean(form.billsIncludedPreferred)} onChange={() => toggle('billsIncludedPreferred')} />
                  <Toggle label="Applying as a couple" checked={Boolean(form.applyingAsCouple)} error={errors.applyingAsCouple} onChange={() => setCoupleStatus(!form.applyingAsCouple)} />
                </div>
              </details>
            ) : null}
          </Section>

          <Section title="Application readiness">
            <div className="grid gap-3 min-[430px]:grid-cols-2 md:grid-cols-3">
              <SelectInput label="Employment" value={form.employmentStatus || 'Full-time'} onChange={(event) => update('employmentStatus', event.target.value)} options={employmentOptions.map(option)} />
              <SelectInput label="Student" value={form.studentStatus || 'No'} onChange={(event) => update('studentStatus', event.target.value)} options={['No', 'Yes'].map(option)} />
              <SelectInput label="Pets" value={form.pets || 'none'} onChange={(event) => update('pets', event.target.value)} options={petOptions} />
              <SelectInput label="Smoking" value={form.smoking || 'no'} onChange={(event) => update('smoking', event.target.value)} options={smokingOptions} />
              <SelectInput label="Parking needed" value={form.parkingNeeded || 'no'} onChange={(event) => update('parkingNeeded', event.target.value)} options={parkingNeedOptions} />
            </div>
            <div className="mt-4 grid gap-3 min-[430px]:grid-cols-2 md:grid-cols-3">
              <Toggle label="References ready" checked={Boolean(form.referencesReady)} onChange={() => toggle('referencesReady')} />
              <Toggle label="Proof of income ready" checked={Boolean(form.incomeReady)} onChange={() => toggle('incomeReady')} />
              <Toggle label="ID ready" checked={Boolean(form.idReady)} onChange={() => toggle('idReady')} />
            </div>
          </Section>

          <Section title="Introduction">
            <FormInput id="tenant-bio" textarea rows={5} label="Short bio" maxLength={600} value={form.bio || ''} error={errors.bio} onChange={(event) => update('bio', event.target.value)} />
          </Section>

          <RoleSwitch />
          <AccountSection />
          <LegalLinksSection />
          <ModeratorLinkSection />

          {saveError ? (
            <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {saveError}
            </div>
          ) : null}
          <Button type="submit" className="w-full" isLoading={isSaving} disabled={isSaving}>
            Save tenant profile
          </Button>
        </form>
      </ProfileShell>
      {showGaffloPlus ? <GaffloPlusPreview onClose={() => setShowGaffloPlus(false)} /> : null}
    </>
  )
}

function LandlordProfile() {
  const { landlordPlan } = useAppState()
  const { landlordProfile, updateLandlordProfile } = useAccountProfile()
  const [form, setForm] = useState(landlordProfile)
  const [errors, setErrors] = useState({})
  const [showPlans, setShowPlans] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const landlordPlus = getLandlordPlanConfig(LANDLORD_PLAN.LANDLORD_PLUS)
  const freeListingAllowance = getActiveListingAllowance(LANDLORD_PLAN.FREE)

  const validateField = (field, value) => {
    const validators = {
      displayName: () => {
        const length = String(value || '').trim().length
        if (!length) return 'Add the name tenants will see.'
        if (length > 80) return 'Keep the display name under 80 characters.'
        return ''
      },
      bio: () => (String(value || '').length > 600 ? 'Keep profile information under 600 characters.' : ''),
    }
    return validators[field]?.() || ''
  }

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const next = { ...current }
      const error = validateField(field, value)
      if (error) next[field] = error
      else delete next[field]
      return next
    })
  }

  const submit = async (event) => {
    event.preventDefault()
    const fields = ['displayName', 'bio']
    const nextErrors = fields.reduce((acc, field) => {
      const error = validateField(field, form[field])
      if (error) acc[field] = error
      return acc
    }, {})
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setIsSaving(true)
    setSaveError('')
    const { error } = await updateLandlordProfile({
      displayName: form.displayName.trim(),
      bio: form.bio,
      preferredContactMethod: form.preferredContactMethod,
    })
    setIsSaving(false)
    if (error) {
      setSaveError('Something went wrong saving your profile. Please try again.')
    }
  }

  return (
    <ProfileShell eyebrow="Landlord profile" title="Listing owner profile" description="Shown to tenants when they view your listings.">
      <form onSubmit={submit} className="space-y-4">
        <Section title="Profile">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput id="landlord-display-name" label="Display name" maxLength={80} value={form.displayName || ''} error={errors.displayName} onChange={(event) => update('displayName', event.target.value)} />
            <div className="surface-line rounded-[18px] bg-slate-50 px-4 py-3">
              <div className="text-sm font-medium text-slate-700">Type</div>
              <div className="mt-1 text-sm font-semibold text-slate-950">Private landlord</div>
            </div>
            <SelectInput label="Preferred contact" value={form.preferredContactMethod || 'In-app message'} onChange={(event) => update('preferredContactMethod', event.target.value)} options={contactOptions.map(option)} />
          </div>
        </Section>
        <Section title="About">
          <FormInput id="landlord-bio" textarea rows={5} label="Short profile information" maxLength={600} value={form.bio || ''} error={errors.bio} onChange={(event) => update('bio', event.target.value)} />
        </Section>
        <div className="rounded-[22px] border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          New landlords can create draft listings, but public publishing can require landlord and property review.
        </div>
        {landlordPlan !== LANDLORD_PLAN.LANDLORD_PLUS ? (
          <PricingEntryCard
            eyebrow="Upgrade"
            name={landlordPlus.name}
            priceMonthly={landlordPlus.priceMonthly}
            tagline="More active listings for your properties."
            note={`Free includes ${freeListingAllowance} active listing.`}
            features={landlordPlus.features}
            ctaLabel="Explore plans and add-ons"
            onExplore={() => setShowPlans(true)}
          />
        ) : null}
        <RoleSwitch />
        <AccountSection />
        <LegalLinksSection />
        <ModeratorLinkSection />

        {saveError ? (
          <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {saveError}
          </div>
        ) : null}
        <Button type="submit" className="w-full" isLoading={isSaving} disabled={isSaving}>
          Save landlord profile
        </Button>
      </form>
      {showPlans ? <LandlordPlansPreview onClose={() => setShowPlans(false)} /> : null}
    </ProfileShell>
  )
}

function ProfileShell({ eyebrow, title, description, children }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="card-surface card-shadow rounded-[30px] px-5 py-6 md:px-7">
        <p className="text-sm font-semibold text-emerald-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-[2.2rem]">{title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{description}</p>
      </section>
      {children}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="card-surface card-shadow rounded-[24px] p-4 min-[390px]:rounded-[28px] min-[390px]:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ProfileCompleteness({ completeness }) {
  return (
    <section className="card-surface card-shadow rounded-[24px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Rental profile strength</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Your rental profile is {completeness.percent}% complete.</p>
        </div>
        <span className="rounded-full bg-indigo-950 px-3 py-1.5 text-xs font-semibold text-white">
          {completeness.completed}/{completeness.total}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: `${completeness.percent}%` }} />
      </div>
      {completeness.missing.length ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {completeness.missing.slice(0, 4).map((item) => (
            <span key={item.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              Add {item.label.toLowerCase()}
            </span>
          ))}
          {completeness.missing.length > 4 ? (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              +{completeness.missing.length - 4}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm font-medium text-emerald-700">Your profile has the key details landlords expect.</p>
      )}
    </section>
  )
}

function PreferredAreasInput({ areaDraft, areas, city, onAdd, onDraft, onRemove, options }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 min-[430px]:grid-cols-[1fr_auto]">
        <SelectInput label="Suggested areas" value="" onChange={(event) => event.target.value && onAdd(event.target.value)} options={[{ label: `Choose an area in ${city}`, value: '' }, ...options.map(option)]} />
        <div className="flex items-end">
          <Button type="button" variant="secondary" className="w-full" disabled={!areaDraft.trim()} onClick={() => onAdd(areaDraft)}>
            Add custom
          </Button>
        </div>
      </div>
      <FormInput label="Custom area" value={areaDraft} maxLength={70} onChange={(event) => onDraft(event.target.value)} />
      {areas.length ? (
        <div className="flex flex-wrap gap-2">
          {areas.map((area) => (
            <button key={area} type="button" onClick={() => onRemove(area)} className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-indigo-100">
              {area} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// The real account identity — genuinely signed in via Supabase Auth, distinct from the
// tenant/landlord profile forms above. Shows only what Supabase itself reports (the session
// email) and offers the one real account-level action Stage A provides: signing out.
function AccountSection() {
  const { signOut, user } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  return (
    <section className="surface-line rounded-[24px] bg-white p-4">
      <div className="text-sm font-semibold text-slate-950">Account</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">Signed in as {user?.email}</p>
      <Button
        type="button"
        variant="secondary"
        className="mt-3 w-full"
        isLoading={isSigningOut}
        disabled={isSigningOut}
        onClick={async () => {
          setIsSigningOut(true)
          await signOut()
        }}
      >
        Sign out
      </Button>
    </section>
  )
}

const legalProfileLinks = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/fair-housing', label: 'Fair Housing Policy' },
  { to: '/acceptable-use', label: 'Acceptable Use' },
  { to: '/contact', label: 'Contact' },
]

function LegalLinksSection() {
  return (
    <section className="surface-line rounded-[24px] bg-white p-4">
      <div className="text-sm font-semibold text-slate-950">Legal</div>
      <div className="mt-3 grid gap-1">
        {legalProfileLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-[14px] px-1 py-1.5 text-sm font-medium text-indigo-700 hover:underline"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  )
}

// Stage K — only ever visible to a real moderator/admin account (am_i_moderator(), never a
// broad profiles.platform_role read). Renders nothing for every other account, including while
// the check is still loading, so it never flashes for a non-moderator.
function ModeratorLinkSection() {
  const { isModerator } = useIsModerator()
  if (!isModerator) return null

  return (
    <section className="surface-line rounded-[24px] bg-white p-4">
      <div className="text-sm font-semibold text-slate-950">Moderator workspace</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">Review reports and listing submissions.</p>
      <Link
        to="/moderator"
        className="mt-3 block rounded-[14px] px-1 py-1.5 text-sm font-medium text-indigo-700 hover:underline"
      >
        Open moderator workspace
      </Link>
    </section>
  )
}

// A real account role switcher (Stage B) — no longer the demo-only local toggle it used to be.
// Switching persists profiles.last_active_role for real; it never creates a new account, never
// touches the auth session, and only ever offers the role the user does not currently have as
// "Set up" — App.jsx's own onboarding gate takes it from there.
function RoleSwitch() {
  const navigate = useNavigate()
  const { activeRole, hasLandlordProfile, hasTenantProfile, setActiveRole } = useAccountProfile()
  const [isSwitching, setIsSwitching] = useState(false)
  const [error, setError] = useState('')

  const goTo = async (role) => {
    if (role === activeRole) return
    setIsSwitching(true)
    setError('')
    const { error: switchError } = await setActiveRole(role)
    setIsSwitching(false)
    if (switchError) {
      setError('Something went wrong switching modes. Please try again.')
      return
    }
    navigate(role === 'landlord' ? '/dashboard' : '/discover')
  }

  return (
    <section className="surface-line rounded-[24px] bg-white p-4">
      <div className="text-sm font-semibold text-slate-950">Gafflo roles</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Switch between the tenant and landlord sides of Gafflo, or set up the one you have not used yet.
      </p>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="secondary" isLoading={isSwitching} disabled={isSwitching || activeRole === 'tenant'} onClick={() => goTo('tenant')}>
          {activeRole === 'tenant' ? 'Tenant mode active' : hasTenantProfile ? 'Switch to tenant' : 'Set up tenant'}
        </Button>
        <Button variant="secondary" isLoading={isSwitching} disabled={isSwitching || activeRole === 'landlord'} onClick={() => goTo('landlord')}>
          {activeRole === 'landlord' ? 'Landlord mode active' : hasLandlordProfile ? 'Switch to landlord' : 'Set up landlord'}
        </Button>
      </div>
    </section>
  )
}

function option(value) {
  return { label: value, value }
}
