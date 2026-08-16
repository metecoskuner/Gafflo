import { useState } from 'react'
import Button from './Button'

// Informational only — there is no purchase flow behind this yet. Wording stays
// exploratory ("Explore benefits") and never implies a payment can be completed.
// When `onExplore` is passed (e.g. the tenant Gafflo+ entry point), the CTA opens that
// dedicated presentation instead of expanding the inline feature list.
export default function PricingEntryCard({ eyebrow, name, priceMonthly, tagline, features, note, ctaLabel, onExplore }) {
  const [expanded, setExpanded] = useState(false)
  const opensExternalPresentation = typeof onExplore === 'function'
  const label = ctaLabel || (expanded ? 'Hide benefits' : 'Explore benefits')

  const handleClick = () => {
    if (opensExternalPresentation) {
      onExplore()
      return
    }
    setExpanded((current) => !current)
  }

  return (
    <section className="card-surface card-shadow rounded-[26px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{name}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{tagline}</p>
        </div>
        <div className="shrink-0 rounded-2xl bg-slate-50 px-3 py-2 text-right">
          <div className="text-lg font-semibold tracking-tight text-slate-950">€{priceMonthly.toFixed(2)}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">per month</div>
        </div>
      </div>

      {note ? <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p> : null}

      {!opensExternalPresentation && expanded ? (
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 text-emerald-600">✓</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        className="mt-4 w-full"
        aria-expanded={opensExternalPresentation ? undefined : expanded}
        onClick={handleClick}
      >
        {label}
      </Button>
    </section>
  )
}
