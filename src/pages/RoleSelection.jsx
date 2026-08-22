import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import useAccountProfile from '../context/useAccountProfile'
import useAuth from '../context/useAuth'

// Which Gafflo marketplace role the signed-in account wants to set up/use next — not a second
// signup. The real account already exists (Supabase Auth, Stage A); this only sets
// profiles.last_active_role. It never creates the role's actual profile row itself — App.jsx's
// own onboarding gate (role === 'tenant' && !hasTenantProfile -> TenantOnboarding, symmetrically
// for landlord) takes over from here, since target_city/looking_for and display_name are
// genuinely required fields this screen has no truthful value for yet.
export default function RoleSelection() {
  const { setActiveRole } = useAccountProfile()
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const [isChoosing, setIsChoosing] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState('')

  const chooseRole = async (role) => {
    setIsChoosing(true)
    setError('')
    const { error: saveError } = await setActiveRole(role)
    setIsChoosing(false)
    if (saveError) {
      setError('Something went wrong saving your choice. Please try again.')
      return
    }
    navigate(role === 'landlord' ? '/dashboard' : '/discover', { replace: true })
  }

  return (
    <div className="page-shell mx-auto min-h-screen w-full max-w-[920px] px-4 py-4 md:px-6 md:py-8">
      <section className="card-surface card-shadow w-full overflow-hidden rounded-[28px] md:rounded-[34px]">
        <div className="bg-[var(--gafflo-brand-ink)] px-5 py-5 text-white md:px-8 md:py-8">
          <BrandLogo size="lg" theme="dark" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Welcome to Gafflo</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-5xl">Choose how you want to use Gafflo</h1>
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 md:mx-6">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 p-4 md:grid-cols-2 md:p-6">
          <article className="surface-line rounded-[22px] bg-white p-4 min-[390px]:p-5 md:rounded-[28px]">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Tenant</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 min-[390px]:text-2xl">I&rsquo;m looking for a place</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Find an entire home or a room that fits your needs.</p>
            <Button className="mt-4 w-full" isLoading={isChoosing} disabled={isChoosing} onClick={() => chooseRole('tenant')}>
              Continue as tenant
            </Button>
          </article>

          <article className="surface-line rounded-[22px] bg-white p-4 min-[390px]:p-5 md:rounded-[28px]">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Landlord</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 min-[390px]:text-2xl">I have a place to rent</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">List an entire property or a room and manage enquiries.</p>
            <Button className="mt-4 w-full" isLoading={isChoosing} disabled={isChoosing} onClick={() => chooseRole('landlord')}>
              Continue as landlord
            </Button>
          </article>
        </div>

        <div className="border-t border-slate-100 px-4 py-4 text-center md:px-6">
          <p className="text-xs leading-5 text-slate-500">
            Signed in as {user?.email}.{' '}
            <button
              type="button"
              disabled={isSigningOut}
              onClick={async () => {
                setIsSigningOut(true)
                await signOut()
              }}
              className="font-semibold text-indigo-700 underline hover:text-indigo-800 disabled:opacity-60"
            >
              Not you? Sign out
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}
