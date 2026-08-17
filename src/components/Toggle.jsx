// The one Gafflo pill-switch control. Previously duplicated almost verbatim as Profile.jsx's
// local `Check` and CreateListing.jsx's local `Toggle` — same visual switch, two copies to keep
// in sync. onChange receives the next boolean value directly.
export default function Toggle({ label, checked, error, onChange }) {
  return (
    <div>
      <label className="surface-line flex min-h-12 items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-3 text-sm font-semibold text-slate-700">
        <span>{label}</span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft transition ${checked ? 'left-6' : 'left-1'}`} />
        </span>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      </label>
      {error ? <p className="mt-1 text-xs font-medium text-rose-500">{error}</p> : null}
    </div>
  )
}
