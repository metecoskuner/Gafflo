// Consistent interaction pattern for a small, high-frequency choice (2-3 options) — used
// instead of a dropdown when the decision is common enough to deserve one-tap access. Extracted
// from TenantOnboarding's original "Looking for" picker so the same decision (Any / Entire
// property / Room) looks and behaves identically wherever it's asked.
export default function SegmentedControl({ label, value, onChange, options, error }) {
  return (
    <div>
      {label ? <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span> : null}
      <div className="grid gap-1.5 rounded-2xl bg-slate-100 p-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`min-h-12 rounded-xl px-2 text-xs font-semibold leading-4 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 ${
              value === option.value ? 'card-shadow bg-white text-slate-950' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-rose-500">{error}</p> : null}
    </div>
  )
}
