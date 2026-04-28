export default function EmptyState({ eyebrow, title, description, actions }) {
  return (
    <section className="card-surface card-shadow rounded-[28px] p-6 text-center">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">{eyebrow}</p> : null}
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">{description}</p>
      {actions ? <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">{actions}</div> : null}
    </section>
  )
}
