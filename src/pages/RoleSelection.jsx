import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import useAppState from '../context/useAppState'

export default function RoleSelection() {
  const { selectRole } = useAppState()
  const navigate = useNavigate()

  const chooseRole = (role, landlordType = null) => {
    selectRole(role, landlordType)
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

        <div className="grid gap-3 p-4 md:grid-cols-2 md:p-6">
          <article className="surface-line rounded-[22px] bg-white p-4 min-[390px]:p-5 md:rounded-[28px]">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Tenant</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 min-[390px]:text-2xl">I’m looking for a place</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Find an entire home or a room that fits your needs.</p>
            <Button className="mt-4 w-full" onClick={() => chooseRole('tenant')}>
              Continue as tenant
            </Button>
          </article>

          <article className="surface-line rounded-[22px] bg-white p-4 min-[390px]:p-5 md:rounded-[28px]">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Landlord</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 min-[390px]:text-2xl">I have a place to rent</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">List an entire property or a room and manage enquiries.</p>
            <Button className="mt-4 w-full" onClick={() => chooseRole('landlord', 'private_landlord')}>
              Continue as landlord
            </Button>
          </article>
        </div>
      </section>
    </div>
  )
}
