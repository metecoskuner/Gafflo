export default function Button({
  children,
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}) {
  const variants = {
    primary:
      'shadow-pressable bg-gradient-to-br from-emerald-400 to-emerald-600 text-white hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.99]',
    secondary:
      'surface-line bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100',
    dark:
      'shadow-soft bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.99]',
    ghost:
      'bg-transparent text-slate-700 hover:bg-white/80 active:bg-white',
  }

  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center rounded-[18px] px-4 py-3 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
