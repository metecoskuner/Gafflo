export default function EmptyState({ eyebrow, title, description, actions }) {
  return (
    <section className="card-surface card-shadow overflow-hidden rounded-[30px] p-6 text-center md:p-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-semibold text-white shadow-pressable">
        G
      </div>
      {eyebrow ? <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">{eyebrow}</p> : null}
      <h2 className="text-balance mt-3 text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-slate-600">{description}</p>
      {actions ? <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">{actions}</div> : null}
    </section>
  )
}
