import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import PricingEntryCard from '../components/PricingEntryCard'
import SelectInput from '../components/SelectInput'
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
import useAppState from '../context/useAppState'
import { getTodayIsoDate, isPastIsoDate } from '../utils/dateUtils'

const employmentOptions = ['Full-time', 'Part-time', 'Student', 'Remote worker', 'Self-employed']
const contactOptions = ['In-app message', 'Email', 'Phone']

export default function Profile() {
  const { role } = useAppState()
  return role === 'landlord' ? <LandlordProfile /> : <TenantProfile />
}

function TenantProfile() {
  const navigate = useNavigate()
  const { switchRole, tenantPlan, tenantProfile, saveTenantProfile } = useAppState()
  const gaffloPlus = getTenantPlanConfig(TENANT_PLAN.GAFFLO_PLUS)
  const today = getTodayIsoDate()
  const [form, setForm] = useState(() => ({
    ...tenantProfile,
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

  const validateField = (field, value, nextForm = form) => {
    const minBudget = Number(field === 'budgetMin' ? value : nextForm.budgetMin)
    const maxBudget = Number(field === 'budgetMax' ? value : nextForm.budgetMax)
    const validators = {
      name: () => (String(value || '').length > 80 ? 'Keep your name under 80 characters.' : ''),
      budgetMin: () => {
        if (value !== '' && (!Number.isFinite(minBudget) || minBudget < 0)) return 'Minimum budget cannot be negative.'
        if (nextForm.budgetMax !== '' && value !== '' && minBudget > maxBudget) return 'Minimum budget cannot be higher than maximum budget.'
        return ''
      },
      budgetMax: () => {
        if (value !== '' && (!Number.isFinite(maxBudget) || maxBudget < 0)) return 'Maximum budget cannot be negative.'
        if (nextForm.budgetMin !== '' && value !== '' && minBudget > maxBudget) return 'Maximum budget must be at least the minimum budget.'
        return ''
      },
      moveInDate: () => (isPastIsoDate(value, today) ? 'Move-in date cannot be in the past.' : ''),
      householdSize: () => (!Number.isFinite(Number(value)) || Number(value) < 1 ? 'Household size must be at least 1.' : ''),
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
  const addPreferredArea = (area) => {
    const nextAreas = normalizePreferredAreas([...(form.preferredAreas || []), area], form.targetCity)
    update('preferredAreas', nextAreas)
    update('areaDraft', '')
  }
  const removePreferredArea = (area) => {
    update('preferredAreas', (form.preferredAreas || []).filter((item) => item !== area))
  }

  const submit = (event) => {
    event.preventDefault()
    const fields = ['name', 'budgetMin', 'budgetMax', 'moveInDate', 'householdSize', 'applyingAsCouple', 'bio']
    const nextErrors = fields.reduce((acc, field) => {
      const error = validateField(field, form[field], form)
      if (error) acc[field] = error
      return acc
    }, {})
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    saveTenantProfile({
      ...form,
      budgetMin: Math.max(0, Number(form.budgetMin || 0)),
      budgetMax: Math.max(0, Number(form.budgetMax || 0)),
      householdSize: Math.max(1, Number(form.householdSize || 1)),
      preferredAreas: normalizePreferredAreas(form.preferredAreas, form.targetCity),
      notifications: undefined,
      areaDraft: undefined,
    })
    navigate('/discover')
  }

  return (
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
          <div className="grid gap-3 min-[430px]:grid-cols-2 md:grid-cols-3">
            <FormInput id="tenant-budget-min" label="Budget min (€)" type="number" min="0" inputMode="numeric" value={form.budgetMin || ''} error={errors.budgetMin} onChange={(event) => update('budgetMin', event.target.value)} />
            <FormInput id="tenant-budget-max" label="Budget max (€)" type="number" min="0" inputMode="numeric" value={form.budgetMax || ''} error={errors.budgetMax} onChange={(event) => update('budgetMax', event.target.value)} />
            <FormInput id="tenant-move-in" label="Move-in date" type="date" min={today} value={isPastIsoDate(form.moveInDate, today) ? '' : form.moveInDate || ''} error={errors.moveInDate} onChange={(event) => update('moveInDate', event.target.value)} />
            <SelectInput label="Lease length" value={form.leaseLength || '12'} onChange={(event) => update('leaseLength', event.target.value)} options={leasePreferenceOptions} />
            <FormInput id="tenant-household-size" label={form.lookingFor === 'room' ? 'Room applicants' : 'Household size'} type="number" min="1" inputMode="numeric" value={form.householdSize || 1} error={errors.householdSize} onChange={(event) => update('householdSize', event.target.value)} />
            <SelectInput label="Furnished" value={form.furnishedPreference || ANY_VALUE} onChange={(event) => update('furnishedPreference', event.target.value)} options={withAny(furnishedOptions)} />
          </div>
          <div className="mt-4 grid gap-3 min-[430px]:grid-cols-2">
            <SelectInput
              label="Looking for"
              value={form.lookingFor || 'any'}
              onChange={(event) => update('lookingFor', event.target.value)}
              options={[
                { label: 'Any', value: 'any' },
                { label: 'Entire property', value: LISTING_CATEGORIES.ENTIRE_PROPERTY },
                { label: 'Room', value: 'room' },
              ]}
            />
            {form.lookingFor === 'room' ? (
              <Check label="Owner-occupied acceptable" checked={form.ownerOccupiedAcceptable !== false} onChange={() => update('ownerOccupiedAcceptable', form.ownerOccupiedAcceptable === false)} />
            ) : null}
          </div>
          {form.lookingFor === 'room' ? (
            <details className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3" open>
              <summary className="cursor-pointer text-sm font-semibold text-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100">
                Room preferences
              </summary>
              <div className="mt-3 grid gap-3 min-[430px]:grid-cols-2">
                <Check label="Private bathroom preferred" checked={Boolean(form.privateBathroomPreferred)} onChange={() => toggle('privateBathroomPreferred')} />
                <Check label="Bills included preferred" checked={Boolean(form.billsIncludedPreferred)} onChange={() => toggle('billsIncludedPreferred')} />
                <Check label="Applying as a couple" checked={Boolean(form.applyingAsCouple)} error={errors.applyingAsCouple} onChange={() => toggle('applyingAsCouple')} />
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
            <Check label="References ready" checked={Boolean(form.referencesReady)} onChange={() => toggle('referencesReady')} />
            <Check label="Proof of income ready" checked={Boolean(form.incomeReady)} onChange={() => toggle('incomeReady')} />
            <Check label="ID ready" checked={Boolean(form.idReady)} onChange={() => toggle('idReady')} />
          </div>
        </Section>

        <Section title="Introduction">
          <FormInput id="tenant-bio" textarea rows={5} label="Short bio" maxLength={600} value={form.bio || ''} error={errors.bio} onChange={(event) => update('bio', event.target.value)} />
        </Section>

        <RoleSwitch
          onTenant={() => {
            switchRole('tenant')
            navigate('/discover')
          }}
          onLandlord={() => {
            switchRole('landlord', 'private_landlord')
            navigate('/dashboard')
          }}
        />
        <Button type="submit" className="w-full">Save tenant profile</Button>
      </form>
    </ProfileShell>
  )
}

function LandlordProfile() {
  const navigate = useNavigate()
  const { landlordPlan, landlordProfile, saveLandlordProfile, switchRole } = useAppState()
  const [form, setForm] = useState(landlordProfile)
  const [errors, setErrors] = useState({})
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
      email: () => (value && !/^\S+@\S+\.\S+$/.test(value) ? 'Enter a valid email address.' : ''),
      phone: () => (String(value || '').length > 30 ? 'Keep the phone number under 30 characters.' : ''),
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

  const submit = (event) => {
    event.preventDefault()
    const fields = ['displayName', 'email', 'phone', 'bio']
    const nextErrors = fields.reduce((acc, field) => {
      const error = validateField(field, form[field])
      if (error) acc[field] = error
      return acc
    }, {})
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    saveLandlordProfile({ ...form, landlordType: 'private_landlord', companyName: '', propertyCount: undefined })
  }

  return (
    <ProfileShell eyebrow="Landlord profile" title="Listing owner profile" description="Verification status is tracked separately from choosing the landlord role.">
      <form onSubmit={submit} className="space-y-4">
        <Section title="Profile">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput id="landlord-display-name" label="Display name" maxLength={80} value={form.displayName || ''} error={errors.displayName} onChange={(event) => update('displayName', event.target.value)} />
            <div className="surface-line rounded-[18px] bg-slate-50 px-4 py-3">
              <div className="text-sm font-medium text-slate-700">Type</div>
              <div className="mt-1 text-sm font-semibold text-slate-950">Private landlord</div>
            </div>
            <FormInput id="landlord-phone" label="Phone" inputMode="tel" maxLength={30} value={form.phone || ''} error={errors.phone} onChange={(event) => update('phone', event.target.value)} />
            <FormInput id="landlord-email" label="Email" type="email" inputMode="email" value={form.email || ''} error={errors.email} onChange={(event) => update('email', event.target.value)} />
            <SelectInput label="Preferred contact" value={form.preferredContactMethod || 'In-app message'} onChange={(event) => update('preferredContactMethod', event.target.value)} options={contactOptions.map(option)} />
            <div className="surface-line rounded-[18px] bg-slate-50 px-4 py-3">
              <div className="text-sm font-medium text-slate-700">Verification status</div>
              <div className="mt-1 text-sm font-semibold text-slate-950">{form.verificationStatus || 'Verification pending'}</div>
            </div>
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
          />
        ) : null}
        <RoleSwitch
          onTenant={() => {
            switchRole('tenant')
            navigate('/discover')
          }}
          onLandlord={() => {
            switchRole('landlord', 'private_landlord')
            navigate('/dashboard')
          }}
        />
        <Button type="submit" className="w-full">Save landlord profile</Button>
      </form>
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

function Check({ label, checked, error, onChange }) {
  return (
    <div>
      <label className="surface-line flex min-h-12 items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-3 text-sm font-semibold text-slate-700">
        <span>{label}</span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft transition ${checked ? 'left-6' : 'left-1'}`} />
        </span>
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      </label>
      {error ? <p className="mt-1 text-xs font-medium text-rose-500">{error}</p> : null}
    </div>
  )
}

// Demo/local-QA tool only — there is no auth yet, so this is how both sides of the product
// get previewed on one device. Deliberately styled apart from the real profile sections above
// (dashed border, warning tone, explicit "Demo tool" label) so it never reads as a normal
// account feature. Remove once real accounts exist — do not carry this forward as a feature.
function RoleSwitch({ onTenant, onLandlord }) {
  return (
    <section className="rounded-[24px] border border-dashed border-amber-300 bg-amber-50/60 p-4">
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-800">
        Demo tool
      </span>
      <div className="mt-2 text-sm font-semibold text-slate-950">Switch Gafflo view</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Local-only preview of both sides of Gafflo before accounts exist. Not part of the real product.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onTenant}>Tenant mode</Button>
        <Button variant="secondary" onClick={onLandlord}>Landlord mode</Button>
      </div>
    </section>
  )
}

function option(value) {
  return { label: value, value }
}
