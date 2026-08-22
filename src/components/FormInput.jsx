export default function FormInput({
  label,
  error,
  hint,
  required = false,
  className = '',
  textarea = false,
  ...props
}) {
  const describedBy = error && props.id ? `${props.id}-error` : undefined
  const baseClassName = `min-h-12 w-full rounded-[18px] border px-4 py-3 text-base text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-emerald-50/20 focus:ring-4 focus:ring-emerald-100 md:text-sm ${
    error ? 'border-rose-300 bg-rose-50/40 focus:border-rose-300 focus:ring-rose-100' : 'border-indigo-100 bg-white'
  } ${className}`

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span> : null}
      </span>
      {hint ? <span className="mb-2 block text-xs leading-5 text-slate-500">{hint}</span> : null}
      {textarea ? (
        <textarea className={baseClassName} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} aria-required={required || undefined} {...props} />
      ) : (
        <input className={baseClassName} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} aria-required={required || undefined} {...props} />
      )}
      {error ? <span id={describedBy} className="mt-2 block text-xs font-medium text-rose-500">{error}</span> : null}
    </label>
  )
}
