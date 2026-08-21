import { useNavigate } from 'react-router-dom'
import Button from './Button'

// Stage J1 — shared shell for the four static legal pages. Plain prose content, no Supabase call
// of any kind: these pages are pure static content, so they deliberately skip the service/
// adapter/context/provider pattern used everywhere else in this app — there is no live backend
// state to centralize.
export default function LegalPageLayout({ eyebrow, title, updated, children }) {
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-4">
      <Button variant="secondary" onClick={() => navigate(-1)}>
        Back
      </Button>
      <section className="card-surface card-shadow rounded-[30px] p-5 md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-500">{eyebrow}</p>
        <h1 className="text-balance mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{title}</h1>
        <p className="mt-1 text-xs font-medium text-slate-400">Last updated {updated}</p>
        <div className="mt-5 space-y-5">{children}</div>
      </section>
    </div>
  )
}

export function LegalSection({ title, children }) {
  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight text-slate-950">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  )
}
