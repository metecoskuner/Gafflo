import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import SelectInput from '../components/SelectInput'
import { LISTING_CATEGORIES } from '../config/listingCategories'
import { cityOptions } from '../config/locationOptions'
import useAppState from '../context/useAppState'
import { getTodayIsoDate, isPastIsoDate } from '../utils/dateUtils'

const lookingForChoices = [
  { value: LISTING_CATEGORIES.ENTIRE_PROPERTY, label: 'Entire property', description: 'A full apartment or house' },
  { value: 'room', label: 'A room', description: 'A room in a shared or owner-occupied home' },
  { value: 'any', label: 'Either', description: 'Show me both' },
]

// The minimum set of facts Rental Fit actually needs to rank listings meaningfully. Nothing
// here is pre-filled with an invented number — a tenant sees their own real answers reflected
// back in Smart Match, not a stranger's default budget.
export default function TenantOnboarding() {
  const navigate = useNavigate()
  const { completeTenantOnboarding } = useAppState()
  const today = getTodayIsoDate()
  const [form, setForm] = useState({
    targetCity: '',
    budgetMin: '',
    budgetMax: '',
    moveInDate: '',
    lookingFor: '',
    householdSize: 1,
  })
  const [errors, setErrors] = useState({})

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const validate = () => {
    const nextErrors = {}
    const min = Number(form.budgetMin)
    const max = Number(form.budgetMax)
    if (!form.targetCity) nextErrors.targetCity = 'Choose a target city.'
    if (form.budgetMin === '' || !Number.isFinite(min) || min < 0) nextErrors.budgetMin = 'Add a minimum budget.'
    if (form.budgetMax === '' || !Number.isFinite(max) || max <= 0) nextErrors.budgetMax = 'Add a maximum budget.'
    if (!nextErrors.budgetMin && !nextErrors.budgetMax && min > max) nextErrors.budgetMax = 'Maximum budget must be at least the minimum.'
    if (!form.moveInDate) nextErrors.moveInDate = 'Choose a move-in date.'
    else if (isPastIsoDate(form.moveInDate, today)) nextErrors.moveInDate = 'Move-in date cannot be in the past.'
    if (!form.lookingFor) nextErrors.lookingFor = 'Choose what you are looking for.'
    if (!Number.isFinite(Number(form.householdSize)) || Number(form.householdSize) < 1) nextErrors.householdSize = 'Add at least 1 person.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = (event) => {
    event.preventDefault()
    if (!validate()) return
    completeTenantOnboarding({
      targetCity: form.targetCity,
      budgetMin: Math.max(0, Number(form.budgetMin)),
      budgetMax: Math.max(0, Number(form.budgetMax)),
      moveInDate: form.moveInDate,
      lookingFor: form.lookingFor,
      householdSize: Math.max(1, Number(form.householdSize)),
    })
    navigate('/discover')
  }

  return (
    <div className="page-shell mx-auto min-h-screen w-full max-w-[560px] px-4 py-4 md:py-8">
      <section className="card-surface card-shadow w-full overflow-hidden rounded-[28px] md:rounded-[34px]">
        <div className="bg-[var(--gafflo-brand-ink)] px-5 py-5 text-white md:px-8 md:py-7">
          <BrandLogo size="sm" theme="dark" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Quick setup</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Let&rsquo;s find your matches</h1>
          <p className="mt-2 text-sm leading-6 text-indigo-100">
            Just the essentials — you can add more detail in your profile anytime.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4 min-[390px]:p-5 md:p-6">
          <SelectInput
            label="Target city"
            value={form.targetCity}
            error={errors.targetCity}
            onChange={(event) => update('targetCity', event.target.value)}
            options={[{ label: 'Choose a city', value: '' }, ...cityOptions.map((city) => ({ label: city, value: city }))]}
          />

          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">Monthly budget (€)</span>
            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label="Min"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="800"
                value={form.budgetMin}
                error={errors.budgetMin}
                onChange={(event) => update('budgetMin', event.target.value)}
              />
              <FormInput
                label="Max"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="1400"
                value={form.budgetMax}
                error={errors.budgetMax}
                onChange={(event) => update('budgetMax', event.target.value)}
              />
            </div>
          </div>

          <FormInput
            label="Move-in date"
            type="date"
            min={today}
            value={form.moveInDate}
            error={errors.moveInDate}
            onChange={(event) => update('moveInDate', event.target.value)}
          />

          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">Looking for</span>
            <div className="grid gap-2 min-[430px]:grid-cols-3">
              {lookingForChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => update('lookingFor', choice.value)}
                  aria-pressed={form.lookingFor === choice.value}
                  className={`min-h-20 rounded-[18px] border p-3 text-left transition ${
                    form.lookingFor === choice.value
                      ? 'border-emerald-300 bg-emerald-50 ring-4 ring-emerald-100'
                      : 'border-indigo-100 bg-white hover:border-emerald-200'
                  }`}
                >
                  <span className="flex items-center justify-between text-sm font-semibold text-slate-950">
                    {choice.label}
                    {form.lookingFor === choice.value ? <span className="text-emerald-600" aria-hidden="true">✓</span> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{choice.description}</span>
                </button>
              ))}
            </div>
            {errors.lookingFor ? <p className="mt-2 text-xs font-medium text-rose-500">{errors.lookingFor}</p> : null}
          </div>

          <FormInput
            label={form.lookingFor === 'room' ? 'Room applicants (including you)' : 'Household size (including you)'}
            type="number"
            min="1"
            inputMode="numeric"
            value={form.householdSize}
            error={errors.householdSize}
            onChange={(event) => update('householdSize', event.target.value)}
          />

          <Button type="submit" className="w-full">See my matches</Button>
        </form>
      </section>
    </div>
  )
}
