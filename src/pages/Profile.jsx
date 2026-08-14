import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import SelectInput from '../components/SelectInput'
import { getTenantProfileCompleteness } from '../config/rentalJourney'
import useAppState from '../context/useAppState'
import { getTodayIsoDate, isPastIsoDate } from '../utils/dateUtils'

const areas = ['Rathmines', 'Ranelagh', 'Portobello', 'Smithfield', 'Drumcondra', 'Phibsborough', 'Ballsbridge', 'Dublin 2']
const employmentOptions = ['Full-time', 'Part-time', 'Student', 'Remote worker', 'Self-employed']
const leaseOptions = ['6 months', '6-12 months', '12 months', '12+ months']
const contactOptions = ['In-app message', 'Email', 'Phone']

export default function Profile() {
  const { role } = useAppState()
  return role === 'landlord' ? <LandlordProfile /> : <TenantProfile />
}

function TenantProfile() {
  const navigate = useNavigate()
  const { switchRole, tenantProfile, saveTenantProfile } = useAppState()
  const today = getTodayIsoDate()
  const [form, setForm] = useState(() => ({
    ...tenantProfile,
    preferredAreas: tenantProfile.preferredAreas?.join(', ') || '',
  }))
  const [errors, setErrors] = useState(() =>
    isPastIsoDate(tenantProfile.moveInDate, today) ? { moveInDate: 'Move-in date cannot be in the past.' } : {},
  )
  const areaHelp = useMemo(() => areas.join(' · '), [])
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
    }
    return validators[field]?.() || ''
  }

  const update = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value }
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
        return nextErrors
      })
      return next
    })
  }
  const toggle = (field) => update(field, !form[field])

  const submit = (event) => {
    event.preventDefault()
    const fields = ['name', 'budgetMin', 'budgetMax', 'moveInDate', 'householdSize', 'bio']
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
      preferredAreas: String(form.preferredAreas || '').split(',').map((item) => item.trim()).filter(Boolean),
    })
    navigate('/discover')
  }

  return (
    <ProfileShell eyebrow="Tenant profile" title="Your rental profile" description="These details help rank properties and summarise enquiries. No documents are uploaded.">
      <form onSubmit={submit} className="space-y-4">
        <ProfileCompleteness completeness={completeness} />
        <Section title="Basics">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput id="tenant-name" label="Name" value={form.name || ''} maxLength={80} error={errors.name} onChange={(event) => update('name', event.target.value)} />
            <SelectInput label="Target city" value={form.targetCity || 'Dublin'} onChange={(event) => update('targetCity', event.target.value)} options={['Dublin', 'Cork', 'Galway'].map(option)} />
            <FormInput label="Preferred areas" value={form.preferredAreas || ''} onChange={(event) => update('preferredAreas', event.target.value)} />
            <SelectInput label="Notifications" value={form.notifications || 'Email and app'} onChange={(event) => update('notifications', event.target.value)} options={['Email and app', 'Email only', 'App only'].map(option)} />
          </div>
          <p className="mt-3 text-xs leading-6 text-slate-500">Dublin examples: {areaHelp}</p>
        </Section>

        <Section title="Rental needs">
          <div className="grid gap-4 md:grid-cols-3">
            <FormInput id="tenant-budget-min" label="Budget min (€)" type="number" min="0" inputMode="numeric" value={form.budgetMin || ''} error={errors.budgetMin} onChange={(event) => update('budgetMin', event.target.value)} />
            <FormInput id="tenant-budget-max" label="Budget max (€)" type="number" min="0" inputMode="numeric" value={form.budgetMax || ''} error={errors.budgetMax} onChange={(event) => update('budgetMax', event.target.value)} />
            <FormInput id="tenant-move-in" label="Move-in date" type="date" min={today} value={isPastIsoDate(form.moveInDate, today) ? '' : form.moveInDate || ''} error={errors.moveInDate} onChange={(event) => update('moveInDate', event.target.value)} />
            <SelectInput label="Lease length" value={form.leaseLength || '12 months'} onChange={(event) => update('leaseLength', event.target.value)} options={leaseOptions.map(option)} />
            <FormInput id="tenant-household-size" label="Household size" type="number" min="1" inputMode="numeric" value={form.householdSize || 1} error={errors.householdSize} onChange={(event) => update('householdSize', event.target.value)} />
            <SelectInput label="Furnished" value={form.furnishedPreference || 'Any'} onChange={(event) => update('furnishedPreference', event.target.value)} options={['Any', 'Furnished', 'Part-furnished', 'Unfurnished'].map(option)} />
          </div>
        </Section>

        <Section title="Application readiness">
          <div className="grid gap-4 md:grid-cols-3">
            <SelectInput label="Employment" value={form.employmentStatus || 'Full-time'} onChange={(event) => update('employmentStatus', event.target.value)} options={employmentOptions.map(option)} />
            <SelectInput label="Student" value={form.studentStatus || 'No'} onChange={(event) => update('studentStatus', event.target.value)} options={['No', 'Yes'].map(option)} />
            <SelectInput label="Pets" value={form.pets || 'No pets'} onChange={(event) => update('pets', event.target.value)} options={['No pets', 'Cat', 'Dog', 'Other pet'].map(option)} />
            <SelectInput label="Smoking" value={form.smoking || 'No'} onChange={(event) => update('smoking', event.target.value)} options={['No', 'Outside only', 'Yes'].map(option)} />
            <SelectInput label="Parking needed" value={form.parkingNeeded || 'No'} onChange={(event) => update('parkingNeeded', event.target.value)} options={['No', 'Yes'].map(option)} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Check label="References ready" checked={Boolean(form.referencesReady)} onChange={() => toggle('referencesReady')} />
            <Check label="Proof of income ready" checked={Boolean(form.incomeReady)} onChange={() => toggle('incomeReady')} />
            <Check label="ID ready" checked={Boolean(form.idReady)} onChange={() => toggle('idReady')} />
          </div>
        </Section>

        <Section title="Introduction">
          <FormInput id="tenant-bio" textarea rows={5} label="Short bio" maxLength={600} value={form.bio || ''} error={errors.bio} onChange={(event) => update('bio', event.target.value)} />
        </Section>

        <RoleSwitch onTenant={() => switchRole('tenant')} onLandlord={() => switchRole('landlord', 'private_landlord')} />
        <Button type="submit" className="w-full">Save tenant profile</Button>
      </form>
    </ProfileShell>
  )
}

function LandlordProfile() {
  const { landlordProfile, saveLandlordProfile, switchRole } = useAppState()
  const [form, setForm] = useState(landlordProfile)
  const [errors, setErrors] = useState({})

  const validateField = (field, value) => {
    const validators = {
      displayName: () => {
        const length = String(value || '').trim().length
        if (!length) return 'Add the name tenants will see.'
        if (length > 80) return 'Keep the display name under 80 characters.'
        return ''
      },
      companyName: () => (String(value || '').length > 90 ? 'Keep the company name under 90 characters.' : ''),
      propertyCount: () => (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0) ? 'Property count cannot be negative.' : ''),
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
    const fields = ['displayName', 'companyName', 'propertyCount', 'email', 'phone', 'bio']
    const nextErrors = fields.reduce((acc, field) => {
      const error = validateField(field, form[field])
      if (error) acc[field] = error
      return acc
    }, {})
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    saveLandlordProfile(form)
  }

  return (
    <ProfileShell eyebrow="Landlord / agent profile" title="Listing owner profile" description="Verification status is tracked separately from choosing the landlord role.">
      <form onSubmit={submit} className="space-y-4">
        <Section title="Profile">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput id="landlord-display-name" label="Display name" maxLength={80} value={form.displayName || ''} error={errors.displayName} onChange={(event) => update('displayName', event.target.value)} />
            <SelectInput label="Type" value={form.landlordType || 'private_landlord'} onChange={(event) => update('landlordType', event.target.value)} options={[{ label: 'Private landlord', value: 'private_landlord' }, { label: 'Letting agent', value: 'agent' }]} />
            <FormInput id="landlord-company" label="Company / agency" maxLength={90} value={form.companyName || ''} error={errors.companyName} onChange={(event) => update('companyName', event.target.value)} />
            <FormInput id="landlord-property-count" label="Number of properties" type="number" min="0" inputMode="numeric" value={form.propertyCount || ''} error={errors.propertyCount} onChange={(event) => update('propertyCount', event.target.value)} />
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
        <RoleSwitch onTenant={() => switchRole('tenant')} onLandlord={() => switchRole('landlord', form.landlordType)} />
        <Button type="submit" className="w-full">Save landlord profile</Button>
      </form>
    </ProfileShell>
  )
}

function ProfileShell({ eyebrow, title, description, children }) {
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
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
    <section className="card-surface card-shadow rounded-[28px] p-5">
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
        <div className="mt-4 flex flex-wrap gap-2">
          {completeness.missing.map((item) => (
            <span key={item.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              Add {item.label.toLowerCase()}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm font-medium text-emerald-700">Your profile has the key details landlords expect.</p>
      )}
    </section>
  )
}

function Check({ label, checked, onChange }) {
  return (
    <label className="surface-line flex min-h-12 items-center justify-between rounded-[18px] bg-white px-4 py-3 text-sm font-semibold text-slate-700">
      {label}
      <input type="checkbox" checked={checked} onChange={onChange} className="h-5 w-5 accent-emerald-500" />
    </label>
  )
}

function RoleSwitch({ onTenant, onLandlord }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-950">Switch Gafflo view</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">Preview the tenant or landlord side from this device.</p>
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
