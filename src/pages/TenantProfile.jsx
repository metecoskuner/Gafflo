import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import SelectInput from '../components/SelectInput'
import useAppState from '../context/useAppState'

const cities = ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford']
const allAreas = [
  'Rathmines',
  'Drumcondra',
  'Dublin 1',
  'Dublin 2',
  'Dublin 6',
  'Phibsborough',
  'Ranelagh',
  'Smithfield',
  'Clontarf',
  'Tallaght',
]

const lifestyleOptions = ['Quiet', 'Balanced', 'Social']
const cleanlinessOptions = ['Relaxed', 'Average', 'Very clean']
const smokingOptions = ['No', 'Outside only', 'Yes']
const petOptions = ['Comfortable', 'Not comfortable']
const workStatusOptions = ['Full-time', 'Part-time', 'Student', 'Remote worker']

function createInitialForm(profile) {
  return {
    name: profile?.name || '',
    city: profile?.city || 'Dublin',
    preferredAreas: profile?.preferredAreas?.join(', ') || '',
    budgetMin: profile?.budgetMin ? String(profile.budgetMin) : '',
    budgetMax: profile?.budgetMax ? String(profile.budgetMax) : '',
    moveInDate: profile?.moveInDate || '',
    lifestyle: profile?.lifestyle || 'Balanced',
    cleanliness: profile?.cleanliness || 'Average',
    smoking: profile?.smoking || 'No',
    pets: profile?.pets || 'Comfortable',
    workStatus: profile?.workStatus || 'Full-time',
    about: profile?.about || '',
  }
}

export default function TenantProfile() {
  const navigate = useNavigate()
  const { tenantProfile, saveTenantProfile } = useAppState()
  const [form, setForm] = useState(() => createInitialForm(tenantProfile))
  const [errors, setErrors] = useState({})

  const helperAreas = useMemo(() => allAreas.join(' · '), [])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const nextErrors = {}

    if (!form.name.trim()) nextErrors.name = 'Name is required.'
    if (!form.city) nextErrors.city = 'City is required.'
    if (!form.budgetMin) nextErrors.budgetMin = 'Minimum budget is required.'
    if (!form.budgetMax) nextErrors.budgetMax = 'Maximum budget is required.'
    if (!form.moveInDate) nextErrors.moveInDate = 'Move-in date is required.'
    if (!form.lifestyle) nextErrors.lifestyle = 'Lifestyle is required.'

    const budgetMin = Number(form.budgetMin)
    const budgetMax = Number(form.budgetMax)

    if (form.budgetMin && form.budgetMax && budgetMax <= budgetMin) {
      nextErrors.budgetMax = 'Maximum budget must be greater than minimum budget.'
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    const payload = {
      ...form,
      budgetMin,
      budgetMax,
      preferredAreas: form.preferredAreas
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    }

    saveTenantProfile(payload)
    navigate('/rooms')
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
      <aside className="card-surface card-shadow rounded-[28px] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">Tenant profile</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Tell Gafflo how you want to live.</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Keep it practical. We only ask for room-matching preferences, not sensitive personal documents or exact current address details.
        </p>
        <div className="mt-5 space-y-3">
          <InfoChip label="No ID documents" />
          <InfoChip label="No payslips or bank statements" />
          <InfoChip label="No profile photo required" />
        </div>
      </aside>

      <form onSubmit={handleSubmit} className="card-surface card-shadow space-y-5 rounded-[28px] p-5">
        <section className="grid gap-4 md:grid-cols-2">
          <FormInput
            label="Name"
            placeholder="Your first name"
            value={form.name}
            error={errors.name}
            onChange={(event) => updateField('name', event.target.value)}
          />
          <SelectInput
            label="City"
            value={form.city}
            error={errors.city}
            onChange={(event) => updateField('city', event.target.value)}
            options={cities.map((city) => ({ label: city, value: city }))}
          />
          <FormInput
            label="Budget min (€)"
            type="number"
            placeholder="800"
            value={form.budgetMin}
            error={errors.budgetMin}
            onChange={(event) => updateField('budgetMin', event.target.value)}
          />
          <FormInput
            label="Budget max (€)"
            type="number"
            placeholder="1300"
            value={form.budgetMax}
            error={errors.budgetMax}
            onChange={(event) => updateField('budgetMax', event.target.value)}
          />
          <FormInput
            label="Move-in date"
            type="date"
            value={form.moveInDate}
            error={errors.moveInDate}
            onChange={(event) => updateField('moveInDate', event.target.value)}
          />
          <FormInput
            label="Preferred areas"
            placeholder="Rathmines, Ranelagh, Smithfield"
            value={form.preferredAreas}
            onChange={(event) => updateField('preferredAreas', event.target.value)}
          />
        </section>

        <p className="text-xs leading-6 text-slate-500">Dublin examples: {helperAreas}</p>

        <section className="grid gap-4 md:grid-cols-2">
          <SelectInput
            label="Lifestyle"
            value={form.lifestyle}
            error={errors.lifestyle}
            onChange={(event) => updateField('lifestyle', event.target.value)}
            options={lifestyleOptions.map((option) => ({ label: option, value: option }))}
          />
          <SelectInput
            label="Cleanliness"
            value={form.cleanliness}
            onChange={(event) => updateField('cleanliness', event.target.value)}
            options={cleanlinessOptions.map((option) => ({ label: option, value: option }))}
          />
          <SelectInput
            label="Smoking"
            value={form.smoking}
            onChange={(event) => updateField('smoking', event.target.value)}
            options={smokingOptions.map((option) => ({ label: option, value: option }))}
          />
          <SelectInput
            label="Pets"
            value={form.pets}
            onChange={(event) => updateField('pets', event.target.value)}
            options={petOptions.map((option) => ({ label: option, value: option }))}
          />
          <SelectInput
            label="Work status"
            value={form.workStatus}
            onChange={(event) => updateField('workStatus', event.target.value)}
            options={workStatusOptions.map((option) => ({ label: option, value: option }))}
          />
        </section>

        <FormInput
          textarea
          rows={5}
          label="About"
          placeholder="What matters to you in a shared home?"
          value={form.about}
          onChange={(event) => updateField('about', event.target.value)}
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" className="sm:flex-1">
            Save profile
          </Button>
          <Button variant="secondary" onClick={() => navigate('/rooms')} className="sm:flex-1">
            Skip to rooms
          </Button>
        </div>
      </form>
    </div>
  )
}

function InfoChip({ label }) {
  return <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">{label}</div>
}
