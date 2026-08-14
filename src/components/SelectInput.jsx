export default function SelectInput({ label, error, options, ...props }) {
  const describedBy = error && props.id ? `${props.id}-error` : undefined

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <select
        className={`min-h-12 w-full rounded-[18px] border px-4 py-3 text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-emerald-50/20 focus:ring-4 focus:ring-emerald-100 md:text-sm ${
          error ? 'border-rose-300 bg-rose-50/40 focus:border-rose-300 focus:ring-rose-100' : 'border-indigo-100 bg-white'
        }`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span id={describedBy} className="mt-2 block text-xs font-medium text-rose-500">{error}</span> : null}
    </label>
  )
}
