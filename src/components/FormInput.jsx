export default function FormInput({
  label,
  error,
  className = '',
  textarea = false,
  ...props
}) {
  const baseClassName = `w-full rounded-2xl border px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 ${
    error ? 'border-rose-300 bg-rose-50/40' : 'border-orange-100 bg-white'
  } ${className}`

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {textarea ? <textarea className={baseClassName} {...props} /> : <input className={baseClassName} {...props} />}
      {error ? <span className="mt-2 block text-xs font-medium text-rose-500">{error}</span> : null}
    </label>
  )
}
