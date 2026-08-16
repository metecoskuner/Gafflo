import { useEffect } from 'react'
import Button from './Button'
import { TENANT_PLAN, getTenantPlanConfig, pricingPlans } from '../config/pricingPlans'

// Presentation only — there is no payment provider connected yet. The CTA must never claim a
// purchase can be completed (no "Subscribe" / "Buy" / "Payment successful"), and this screen
// must never imply Gafflo+ changes Rental Fit or application ordering. See pricingPlans.js for
// the single source of truth on every number rendered below.
export default function GaffloPlusPreview({ onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const freePlan = getTenantPlanConfig(TENANT_PLAN.FREE)
  const plusPlan = getTenantPlanConfig(TENANT_PLAN.GAFFLO_PLUS)
  const waitingPeriodHours = pricingPlans.followUp.waitingPeriodHours

  const benefits = [
    { title: 'Instant listing alerts', description: 'Know when a matching place appears.' },
    { title: 'High-fit alerts', description: 'Get notified when a strong Rental Fit is listed.' },
    { title: 'Saved-search alerts', description: 'Price and status alerts for the searches and listings you follow.' },
    { title: 'Full application history', description: 'See every enquiry you have sent, not just recent activity.' },
    { title: 'Compare listings', description: 'Line up shortlisted properties side by side.' },
    { title: 'Advanced filters', description: 'Narrow the property deck by more of what matters to you.' },
    {
      title: `One follow-up after ${waitingPeriodHours}h`,
      description: `If a landlord hasn't responded after ${waitingPeriodHours} hours, you can send one follow-up message, subject to Gafflo's normal messaging limits.`,
    },
    { title: 'Rewind', description: 'Undo your last Smart Match pass.' },
    {
      title: `${plusPlan.smartMatchCardsPerDay} Smart Match cards a day`,
      description: `More daily cards than the Free plan's ${freePlan.smartMatchCardsPerDay}.`,
    },
    {
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
    'Instant & high-fit alerts',
    'Advanced filters',
    'Full history',
    'Listing comparison',
    'Rewind',
    `One follow-up after ${waitingPeriodHours}h`,
    `${plusPlan.smartMatchCardsPerDay} Smart Match/day`,
    `${plusPlan.interestsPerDay} Interested/day`,
  ]

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

        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-4 min-[390px]:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Gafflo+</p>
            <h2 id="gafflo-plus-title" className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Get ahead in your rental search.
            </h2>
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
          <div className="flex items-end justify-between gap-3 rounded-[22px] bg-[var(--gafflo-brand-ink)] px-4 py-4 text-white">
            <div>
              <div className="text-3xl font-semibold tracking-tight">€{plusPlan.priceMonthly.toFixed(2)}</div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">per month</div>
            </div>
            <p className="max-w-[9.5rem] text-right text-xs leading-5 text-indigo-100">Cancel anytime. No commitment.</p>
          </div>

          <ul className="space-y-3">
            {benefits.map((benefit, index) => (
              <li key={benefit.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700"
                >
                  {index + 1}
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
          <Button type="button" disabled className="w-full">
            Gafflo+ coming soon
          </Button>
          <p className="mt-2 text-center text-xs text-slate-500">Payments aren&rsquo;t available in this preview yet.</p>
        </div>
      </div>
    </div>
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
