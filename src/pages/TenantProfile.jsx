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
  'Stoneybatter',
  'Ballsbridge',
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
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const helperAreas = useMemo(() => allAreas.join(' · '), [])
  const isUpdate = Boolean(tenantProfile)

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const nextErrors = {}

    if (!form.name.trim()) nextErrors.name = 'Please add your name so we can personalise your matches.'
    if (!form.city) nextErrors.city = 'Choose the city you want to search in.'
    if (!form.budgetMin) nextErrors.budgetMin = 'Add your minimum monthly budget.'
    if (!form.budgetMax) nextErrors.budgetMax = 'Add your maximum monthly budget.'
    if (!form.moveInDate) nextErrors.moveInDate = 'Choose your target move-in date.'
    if (!form.lifestyle) nextErrors.lifestyle = 'Pick the house vibe that suits you best.'

    const budgetMin = Number(form.budgetMin)
    const budgetMax = Number(form.budgetMax)

    if (form.budgetMin && form.budgetMax && budgetMax <= budgetMin) {
      nextErrors.budgetMax = 'Your maximum budget should be higher than your minimum budget.'
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      setSaveMessage('')
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

    setIsSaving(true)
    setSaveMessage(isUpdate ? 'Updating your profile...' : 'Saving your profile...')

    window.setTimeout(() => {
      saveTenantProfile(payload)
      setSaveMessage('Profile saved. Opening your room matches...')
      setIsSaving(false)
      navigate('/rooms')
    }, 250)
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <section className="card-surface card-shadow rounded-[30px] px-5 py-6 md:px-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">Tenant profile</p>
        <h1 className="text-balance mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-[2.2rem]">
          Create your renter profile
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Tell Gafflo what you’re looking for so we can match you with better rooms.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="card-surface card-shadow space-y-5 rounded-[30px] p-5 md:p-6">
        <FormSection
          title="Basics"
          description="Start with the essentials so the app knows who this search is for."
        >
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>
        </FormSection>

        <FormSection
          title="Budget & move-in"
          description="Keep it practical. These details drive the strongest room matches."
        >
          <div className="grid gap-4 md:grid-cols-3">
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
          </div>
        </FormSection>

        <FormSection
          title="Preferences"
          description="Set the kind of home and area that actually fits your day-to-day life."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              label="Preferred areas"
              placeholder="Rathmines, Ranelagh, Smithfield"
              value={form.preferredAreas}
              onChange={(event) => updateField('preferredAreas', event.target.value)}
            />
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
              label="Work status"
              value={form.workStatus}
              onChange={(event) => updateField('workStatus', event.target.value)}
              options={workStatusOptions.map((option) => ({ label: option, value: option }))}
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
          </div>
          <p className="mt-3 text-xs leading-6 text-slate-500">Dublin examples: {helperAreas}</p>
        </FormSection>

        <FormSection
          title="About you"
          description="Optional, but useful. Add a quick note about what matters in a shared home."
        >
          <FormInput
            textarea
            rows={5}
            label="About"
            placeholder="What matters to you in a shared home?"
            value={form.about}
            onChange={(event) => updateField('about', event.target.value)}
          />
        </FormSection>

        {saveMessage ? (
          <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-900">
            {saveMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" className="sm:flex-1" disabled={isSaving}>
            {isSaving ? 'Saving...' : isUpdate ? 'Update profile' : 'Save profile'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/rooms')} className="sm:flex-1">
            Browse rooms
          </Button>
        </div>

        <p className="text-sm leading-6 text-slate-500">
          Gafflo does not ask for PPS numbers, passports, payslips or bank statements in this demo.
        </p>
      </form>
    </div>
  )
}

function FormSection({ title, description, children }) {
  return (
    <section className="surface-line rounded-[26px] bg-white/70 p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  )
}
