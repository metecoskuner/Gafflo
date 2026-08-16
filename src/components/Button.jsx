export default function Button({
  children,
  className = '',
  isLoading = false,
  success = false,
  variant = 'primary',
  type = 'button',
  disabled,
  ...props
}) {
  const variants = {
    primary:
      'shadow-pressable bg-indigo-950 text-white hover:bg-indigo-900 active:scale-[0.985]',
    secondary:
      'surface-line bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.985] active:bg-slate-100',
    dark:
      'shadow-soft bg-indigo-950 text-white hover:bg-indigo-900 active:scale-[0.985]',
    ghost:
      'bg-transparent text-slate-700 hover:bg-white/80 active:scale-[0.985] active:bg-white',
    // For the primary action on a dark surface (e.g. a hero section), where the default
    // primary/dark variants would blend into the background.
    light:
      'shadow-soft bg-white text-indigo-950 hover:bg-slate-100 active:scale-[0.985]',
  }
  const stateClass = success ? 'is-success-pulse ring-2 ring-emerald-100' : ''

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition-[background,border-color,box-shadow,color,opacity,transform] duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${stateClass} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  )
}
