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
    // The main product CTA — the forward-moving action in a group (e.g. "Interested", "Applicants").
    primary:
      'shadow-pressable bg-indigo-950 text-white hover:bg-indigo-900 active:scale-[0.985]',
    // Lower-emphasis outlined/surface action — everything that isn't the one primary action.
    secondary:
      'surface-line bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.985] active:bg-slate-100',
    // Reserved for the affirming side of a confirm/cancel prompt (e.g. "Confirm block", "Archive",
    // "Not suitable") — intentionally not used as a general CTA so it never competes with `primary`.
    dark:
      'shadow-soft bg-indigo-950 text-white hover:bg-indigo-900 active:scale-[0.985]',
    ghost:
      'bg-transparent text-slate-700 hover:bg-white/80 active:scale-[0.985] active:bg-white',
    // The primary action on a dark surface (e.g. a hero section), where `primary`/`dark` would blend in.
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
