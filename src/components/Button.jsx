export default function Button({
  children,
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}) {
  const variants = {
    primary: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-soft',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
    dark: 'bg-slate-900 text-white hover:bg-slate-800',
    ghost: 'bg-transparent text-slate-700 hover:bg-white/80',
  }

  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-300 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
