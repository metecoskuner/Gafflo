import { useEffect, useState } from 'react'
import { TENANT_PLAN, getTenantPlanConfig } from '../config/pricingPlans'

// Presentation only — there is no payment provider connected yet. The CTA must never claim a
// purchase can be completed (no "Subscribe" / "Buy" / "Payment successful"), and this screen
// must never imply Gafflo+ changes Rental Fit or application ordering. See pricingPlans.js for
// the single source of truth on every number rendered below.
//
// Two-step flow, both steps inside the same sheet: a short "plan" pitch (price + a quick
// Free-vs-Plus glance), then a "benefits" detail screen (full benefit list, full comparison,
// trust statement, CTA). Step resets to "plan" on every fresh open since the component unmounts
// on close.
export default function GaffloPlusPreview({ onClose }) {
  const [step, setStep] = useState('plan')

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const freePlan = getTenantPlanConfig(TENANT_PLAN.FREE)
  const plusPlan = getTenantPlanConfig(TENANT_PLAN.GAFFLO_PLUS)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close Gafflo+ preview"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gafflo-plus-title"
        className="card-shadow relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-t-[28px] bg-white md:max-h-[85vh] md:max-w-lg md:rounded-[28px]"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-200 md:hidden" />

        {step === 'plan' ? (
          <PlanScreen
            freePlan={freePlan}
            plusPlan={plusPlan}
            onClose={onClose}
            onSeeBenefits={() => setStep('benefits')}
          />
        ) : (
          <BenefitsScreen
            freePlan={freePlan}
            plusPlan={plusPlan}
            onBack={() => setStep('plan')}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

function PlanScreen({ freePlan, plusPlan, onClose, onSeeBenefits }) {
  const freeFeatures = [
    'Browse & Save',
    'Rental Fit',
    `${freePlan.smartMatchCardsPerDay} Smart Match/day`,
    `${freePlan.interestsPerDay} Interested/day`,
    'Standard history',
  ]

  return (
    <>
      <div className="flex shrink-0 justify-end px-5 pt-4 min-[390px]:px-6">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-semibold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 pt-1 text-center min-[390px]:px-6">
        <div>
          <h2 id="gafflo-plus-title" className="text-3xl font-semibold tracking-tight text-slate-950">Gafflo+</h2>
          <p className="mt-2 text-base leading-6 text-slate-600">Get ahead in your rental search.</p>
        </div>

        <div>
          <div className="inline-flex items-baseline gap-1.5 rounded-full bg-[var(--gafflo-brand-ink)] px-5 py-2.5 text-white">
            <span className="text-lg font-semibold tracking-tight">€{plusPlan.priceMonthly.toFixed(2)}</span>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-200">/ month</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Planned Gafflo+ pricing — not available to purchase yet.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-left">
          <PlanSummaryCard
            label="Free"
            price="€0"
            priceNote="forever"
            description="All the basics to find a place."
            features={freeFeatures}
          />
          <PlanSummaryCard
            label="Gafflo+"
            price={`€${plusPlan.priceMonthly.toFixed(2)}`}
            priceNote="per month"
            description="More power, better results."
            badge="Recommended"
            highlight
          >
            Everything in Free + premium benefits
          </PlanSummaryCard>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 min-[390px]:px-6">
        <button
          type="button"
          onClick={onSeeBenefits}
          className="shadow-pressable flex min-h-12 w-full items-center justify-center rounded-2xl bg-indigo-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-900 active:scale-[0.985] focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          See all benefits
        </button>
        <button
          type="button"
          onClick={onSeeBenefits}
          className="mt-2 w-full text-center text-sm font-semibold text-indigo-600 focus:outline-none focus-visible:underline"
        >
          Compare plans
        </button>
      </div>
    </>
  )
}

function PlanSummaryCard({ label, price, priceNote, description, features, highlight = false, badge, children }) {
  return (
    <div className={`relative rounded-[20px] p-4 ${highlight ? 'border-2 border-indigo-300 bg-indigo-50/70' : 'surface-line bg-slate-50/80'}`}>
      {badge ? (
        <span className="absolute -top-2.5 right-4 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-white shadow-soft">
          {badge}
        </span>
      ) : null}
      <div className={`text-sm font-semibold ${highlight ? 'text-indigo-700' : 'text-slate-700'}`}>{label}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-3">
        <span className="text-xl font-semibold tracking-tight text-slate-950">{price}</span>
        <span className="ml-1 text-[11px] text-slate-500">{priceNote}</span>
      </div>
      {features ? (
        <ul className="mt-3 space-y-1.5 text-xs leading-5 text-slate-700">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-1.5">
              <span aria-hidden="true" className="text-emerald-600">✓</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs font-medium leading-5 text-indigo-800">{children}</p>
      )}
    </div>
  )
}

// Every entry here must correspond to real, wired UI behaviour — see entitlements.js and
// config/pricingPlans.js. Rewind, instant/high-fit/saved-search alerts, listing compare and the
// 48h follow-up are deliberately not listed: none has real UI behind it yet, so none is shown
// as a current benefit here.
function BenefitsScreen({ freePlan, plusPlan, onBack, onClose }) {
  const benefits = [
    { icon: '☷', title: 'Advanced filters', description: 'Narrow the property deck by more of what matters to you.' },
    { icon: '▤', title: 'Full application history', description: 'See every enquiry you have sent, not just recent activity.' },
    {
      icon: '⌁',
      title: `${plusPlan.smartMatchCardsPerDay} Smart Match cards a day`,
      description: `More daily cards than the Free plan's ${freePlan.smartMatchCardsPerDay}.`,
    },
    {
      icon: '✦',
      title: `${plusPlan.interestsPerDay} Interested actions a day`,
      description: `More daily actions than the Free plan's ${freePlan.interestsPerDay}.`,
    },
  ]

  const freeFeatures = [
    'Browse & Save',
    'Rental Fit',
    `${freePlan.smartMatchCardsPerDay} Smart Match/day`,
    `${freePlan.interestsPerDay} Interested/day`,
    'Standard application history',
    'Normal messaging after landlord engagement',
  ]

  const plusFeatures = [
    'Everything in Free',
    'Advanced filters',
    'Full history',
    `${plusPlan.smartMatchCardsPerDay} Smart Match/day`,
    `${plusPlan.interestsPerDay} Interested/day`,
  ]

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4 min-[390px]:px-6">
        <button
          type="button"
          aria-label="Back to Gafflo+ plan"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
        >
          ‹
        </button>
        <div className="min-w-0 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Gafflo+</p>
          <h2 id="gafflo-plus-title" className="text-lg font-semibold tracking-tight text-slate-950">All the advantages</h2>
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

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 pt-4 min-[390px]:px-6">
        <ul className="space-y-3">
          {benefits.map((benefit) => (
            <li key={benefit.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-base text-indigo-700"
              >
                {benefit.icon}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-950">{benefit.title}</div>
                <p className="mt-0.5 text-sm leading-6 text-slate-600">{benefit.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="grid gap-3 md:grid-cols-2">
          <PlanColumn label="Free" features={freeFeatures} />
          <PlanColumn label="Gafflo+" features={plusFeatures} highlight />
        </div>

        <p className="rounded-[18px] border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs leading-5 text-indigo-900">
          Gafflo+ never changes your Rental Fit score or moves your application ahead of other renters.
        </p>
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 min-[390px]:px-6">
        <button
          type="button"
          disabled
          aria-label={`Gafflo+ coming soon — €${plusPlan.priceMonthly.toFixed(2)} per month`}
          className="flex min-h-12 w-full cursor-not-allowed items-center justify-between rounded-2xl bg-[var(--gafflo-brand-ink)] px-5 py-3 text-white opacity-60"
        >
          <span className="text-sm font-semibold">€{plusPlan.priceMonthly.toFixed(2)} / month</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.06em]">Coming soon</span>
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">Payments aren&rsquo;t available in this preview yet.</p>
      </div>
    </>
  )
}

function PlanColumn({ label, features, highlight = false }) {
  return (
    <div
      className={`rounded-[20px] p-4 ${
        highlight ? 'border border-indigo-200 bg-indigo-50/70' : 'surface-line bg-slate-50/80'
      }`}
    >
      <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${highlight ? 'text-indigo-700' : 'text-slate-500'}`}>
        {label}
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span aria-hidden="true" className={`mt-0.5 ${highlight ? 'text-indigo-600' : 'text-emerald-600'}`}>✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
