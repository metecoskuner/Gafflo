export default function Footer() {
  return (
    <footer className="mt-6 border-t border-orange-100/80 pt-5 md:mt-8 md:pt-6">
      <div className="flex flex-col gap-2 text-sm text-slate-500 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-900">Gafflo</div>
          <p className="mt-1">Room matching for renters in Ireland</p>
        </div>
        <p className="max-w-md text-sm leading-6">
          Portfolio demo using mock data only. No real rental listings or sensitive tenant documents are collected.
        </p>
      </div>
    </footer>
  )
}
