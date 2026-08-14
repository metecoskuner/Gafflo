import BrandLogo from './BrandLogo'

export default function Footer() {
  return (
    <footer className="mt-6 border-t border-indigo-100/80 pt-5 md:mt-8 md:pt-6">
      <div className="flex flex-col gap-2 text-sm text-slate-500 md:flex-row md:items-end md:justify-between">
        <div>
          <BrandLogo size="sm" />
          <p className="mt-1">Property matching for renters in Ireland</p>
        </div>
        <p className="max-w-md text-sm leading-6">Property matching, applicant review and viewing coordination for Ireland.</p>
      </div>
    </footer>
  )
}
