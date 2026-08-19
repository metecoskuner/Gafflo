import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import SegmentedControl from '../components/SegmentedControl'
import SelectInput from '../components/SelectInput'
import { LISTING_CATEGORIES } from '../config/listingCategories'
import { cityOptions } from '../config/locationOptions'
import useAccountProfile from '../context/useAccountProfile'

const lookingForChoices = [
  { value: LISTING_CATEGORIES.ENTIRE_PROPERTY, label: 'Entire property' },
  { value: 'room', label: 'A room' },
  { value: 'any', label: 'Either' },
]

// The absolute minimum Rental Fit needs to start ranking listings meaningfully: where, and
// what kind of place. Budget, move-in date and household size are real, useful signals, but
// they are not required to see a first set of matches, so they are not asked here. Nothing is
// pre-filled with an invented number — those fields stay unknown (null) until the tenant
// chooses to add them later in their profile. See calculatePropertyMatch.js for how matching
// treats "unknown" as unscored, never as a mismatch, and Dashboard.jsx for the later, optional
// nudge to fill them in.
export default function TenantOnboarding() {
  const navigate = useNavigate()
  const { createTenantProfile } = useAccountProfile()
  const [form, setForm] = useState({ targetCity: '', lookingFor: '' })
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

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
    if (!form.targetCity) nextErrors.targetCity = 'Choose a target city.'
    if (!form.lookingFor) nextErrors.lookingFor = 'Choose what you are looking for.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!validate()) return
    setIsSaving(true)
    setSaveError('')
    // Only the two genuinely required facts are sent — budget/move-in/household stay unset
    // (real database NULL, not an invented 0/1/date) until the tenant chooses to add them later
    // in Profile, exactly as onboarding has always promised.
    const { error } = await createTenantProfile({
      targetCity: form.targetCity,
      lookingFor: form.lookingFor,
    })
    setIsSaving(false)
    if (error) {
      setSaveError('Something went wrong saving your profile. Please try again.')
      return
    }
    navigate('/discover')
  }

  return (
    <div className="page-shell mx-auto flex min-h-screen w-full max-w-[560px] items-center px-4 py-4">
      <section className="card-surface card-shadow w-full overflow-hidden rounded-[28px] md:rounded-[34px]">
        <div className="bg-[var(--gafflo-brand-ink)] px-5 py-5 text-white md:px-8 md:py-6">
          <BrandLogo size="sm" theme="dark" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Quick setup</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Let&rsquo;s find your matches</h1>
          <p className="mt-1.5 text-sm leading-6 text-indigo-100">
            Two quick questions — everything else can wait.
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

          <SegmentedControl
            label="Looking for"
            value={form.lookingFor}
            onChange={(value) => update('lookingFor', value)}
            options={lookingForChoices}
            error={errors.lookingFor}
          />

          {saveError ? (
            <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {saveError}
            </div>
          ) : null}

          <Button type="submit" className="w-full" isLoading={isSaving} disabled={isSaving}>
            See my matches
          </Button>
        </form>
      </section>
    </div>
  )
}
