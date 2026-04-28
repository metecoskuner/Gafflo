export default function SelectInput({ label, error, options, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <select
        className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-700 outline-none transition ${
          error ? 'border-rose-300 bg-rose-50/40' : 'border-orange-100 bg-white'
        }`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-2 block text-xs font-medium text-rose-500">{error}</span> : null}
    </label>
  )
}
