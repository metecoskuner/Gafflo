import { BrandMark } from './BrandLogo'

export default function EmptyState({ eyebrow, title, description, actions }) {
  return (
    <section className="card-surface card-shadow overflow-hidden rounded-[28px] p-6 text-center md:p-8">
      <BrandMark size="lg" className="mx-auto" />
      {eyebrow ? <p className="mt-4 text-sm font-semibold text-emerald-600">{eyebrow}</p> : null}
      <h2 className="text-balance mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-slate-600">{description}</p>
      {actions ? <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">{actions}</div> : null}
    </section>
  )
}
