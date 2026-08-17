import { useEffect } from 'react'
import { getLandlordPlanConfig, getListingProductConfig, LANDLORD_PLAN, LISTING_PRODUCT } from '../config/pricingPlans'

// Presentation only — no payment provider connected yet. Every feature listed here must map to
// something the frontend actually does today; nothing is invented ahead of the implementation.
// Mirrors the honesty rules already established for GaffloPlusPreview (tenant side).
export default function LandlordPlansPreview({ onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const free = getLandlordPlanConfig(LANDLORD_PLAN.FREE)
  const landlordPlus = getLandlordPlanConfig(LANDLORD_PLAN.LANDLORD_PLUS)
  const singleListingPlus = getListingProductConfig(LISTING_PRODUCT.SINGLE_LISTING_PLUS)
  const boost = getListingProductConfig(LISTING_PRODUCT.BOOST)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close landlord plans"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="landlord-plans-title"
        className="card-shadow relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-t-[28px] bg-white md:max-h-[85vh] md:max-w-lg md:rounded-[28px]"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-200 md:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4 min-[390px]:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Gafflo for landlords</p>
            <h2 id="landlord-plans-title" className="text-lg font-semibold tracking-tight text-slate-950">Plans and add-ons</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-semibold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-4 min-[390px]:px-6">
          <PlanRow
            eyebrow="Included"
            name={free.name}
            price="€0"
            priceNote="forever"
            features={free.features}
          />
          <PlanRow
            eyebrow="One vacancy"
            name={singleListingPlus.name}
            price={`€${singleListingPlus.price.toFixed(2)}`}
            priceNote={`per ${singleListingPlus.unit}`}
            features={singleListingPlus.features}
          />
          <PlanRow
            eyebrow="Ongoing, multiple listings"
            name={landlordPlus.name}
            price={`€${landlordPlus.priceMonthly.toFixed(2)}`}
            priceNote="per month"
            features={landlordPlus.features}
            highlight
          />
          <PlanRow
            eyebrow="Add-on"
            name={boost.name}
            price={`€${boost.price.toFixed(2)}`}
            priceNote={`per ${boost.unit}`}
            features={boost.features}
          />

          <p className="rounded-[18px] border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs leading-5 text-indigo-900">
            You can pay for exposure. You cannot pay for compatibility. Boost only affects Browse visibility — it
            never changes Rental Fit or Smart Match, and never bypasses a tenant&rsquo;s filters.
          </p>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 min-[390px]:px-6">
          <button
            type="button"
            disabled
            aria-label="Upgrades coming soon"
            className="flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-2xl bg-[var(--gafflo-brand-ink)] px-5 py-3 text-sm font-semibold text-white opacity-60"
          >
            Coming soon
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">Payments aren&rsquo;t available in this preview yet.</p>
        </div>
      </div>
    </div>
  )
}

function PlanRow({ eyebrow, name, price, priceNote, features, highlight = false }) {
  return (
    <div className={`rounded-[20px] p-4 ${highlight ? 'border-2 border-indigo-300 bg-indigo-50/70' : 'surface-line bg-slate-50/80'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${highlight ? 'text-indigo-700' : 'text-slate-500'}`}>{eyebrow}</p>
          <h3 className="mt-0.5 text-base font-semibold text-slate-950">{name}</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-semibold tracking-tight text-slate-950">{price}</div>
          <div className="text-[11px] text-slate-500">{priceNote}</div>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-xs leading-5 text-slate-700">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-1.5">
            <span aria-hidden="true" className="text-emerald-600">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
