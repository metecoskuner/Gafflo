import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import useAccountProfile from '../context/useAccountProfile'

// landlord_profiles.display_name is NOT NULL with no default, and it is deliberately distinct
// from the account identity name (see Phase 1A / AccountProfileProvider) — it's the one real,
// required fact nothing else in the app already knows truthfully, so it has to be asked before
// a landlord_profiles row can exist at all. Mirrors TenantOnboarding's "ask only what's
// genuinely required" shape: one field, nothing invented.
export default function LandlordOnboarding() {
  const navigate = useNavigate()
  const { createLandlordProfile } = useAccountProfile()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed) {
      setError('Add the name tenants will see.')
      return
    }
    if (trimmed.length > 80) {
      setError('Keep the display name under 80 characters.')
      return
    }
    setIsSaving(true)
    const { error: saveError } = await createLandlordProfile({ displayName: trimmed })
    setIsSaving(false)
    if (saveError) {
      setError('Something went wrong saving your landlord profile. Please try again.')
      return
    }
    navigate('/dashboard')
  }

  return (
    <div className="page-shell mx-auto flex min-h-screen w-full max-w-[560px] items-center px-4 py-4">
      <section className="card-surface card-shadow w-full overflow-hidden rounded-[28px] md:rounded-[34px]">
        <div className="bg-[var(--gafflo-brand-ink)] px-5 py-5 text-white md:px-8 md:py-6">
          <BrandLogo size="sm" theme="dark" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Quick setup</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">What should tenants see as your name?</h1>
          <p className="mt-1.5 text-sm leading-6 text-indigo-100">
            Shown on your listings — you can change it any time in your profile.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4 min-[390px]:p-5 md:p-6">
          <FormInput
            id="landlord-onboarding-name"
            label="Display name"
            maxLength={80}
            value={displayName}
            error={error}
            onChange={(event) => {
              setDisplayName(event.target.value)
              if (error) setError('')
            }}
          />
          <Button type="submit" className="w-full" isLoading={isSaving} disabled={isSaving}>
            Continue to dashboard
          </Button>
        </form>
      </section>
    </div>
  )
}
