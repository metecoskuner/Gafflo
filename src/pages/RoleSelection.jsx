import { useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/Button'
import useAppState from '../context/useAppState'

export default function RoleSelection() {
  const { selectRole } = useAppState()
  const [landlordType, setLandlordType] = useState('private_landlord')

  return (
    <div className="page-shell mx-auto flex min-h-screen w-full max-w-[920px] items-center px-4 py-8 md:px-6">
      <section className="card-surface card-shadow w-full overflow-hidden rounded-[34px]">
        <div className="bg-indigo-950 px-5 py-6 text-white md:px-8 md:py-8">
          <BrandLogo
            size="lg"
            textClassName="text-white"
            taglineClassName="text-indigo-100"
            showTagline
            tagline="Property matching for renters, landlords and agents"
          />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Welcome to Gafflo</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">Choose how you want to use Gafflo</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
            Gafflo connects tenants with rental properties, private landlords and letting agents. This choice controls
            the tools you see and can be changed later in Profile.
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
          <article className="surface-line rounded-[28px] bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Tenant</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">I’m looking for a home</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Discover rental-fit properties, save favourites, send enquiries, message listing owners and confirm viewing times.
            </p>
            <Button className="mt-5 w-full" onClick={() => selectRole('tenant')}>
              Continue as tenant
            </Button>
          </article>

          <article className="surface-line rounded-[28px] bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Landlord / Agent</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">I have a property</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Manage listings, review applicants, shortlist suitable tenants, message enquiries and propose viewings.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ['private_landlord', 'Private landlord'],
                ['agent', 'Letting agent'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLandlordType(value)}
                  className={`min-h-12 rounded-[18px] border px-3 text-sm font-semibold transition ${
                    landlordType === value
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-soft'
                      : 'border-indigo-100 bg-white text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button className="mt-5 w-full" onClick={() => selectRole('landlord', landlordType)}>
              Continue with property tools
            </Button>
          </article>
        </div>
      </section>
    </div>
  )
}
