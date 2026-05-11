export default function SwipeActions({
  className = '',
  onPass,
  onSave,
  isSaved,
  swipeDirection = null,
  swipeProgress = 0,
  disabled = false,
}) {
  const passActive = swipeDirection === 'pass'
  const saveActive = swipeDirection === 'save'
  const passScale = passActive ? 1 + swipeProgress * 0.1 : 1
  const saveScale = saveActive ? 1 + swipeProgress * 0.12 : 1

  return (
    <div className={`flex items-center justify-center gap-5 ${className}`}>
      <button
        type="button"
        onClick={onPass}
        disabled={disabled}
        aria-label="Pass this room"
        className={`shadow-soft flex h-15 w-15 items-center justify-center rounded-full border text-[1.7rem] transition duration-200 hover:-translate-y-0.5 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-60 ${
          passActive
            ? 'border-rose-100 bg-rose-50 text-rose-600 shadow-[0_18px_34px_-20px_rgba(244,63,94,0.45)]'
            : 'border-white bg-white text-slate-700 hover:bg-slate-50'
        }`}
        style={{ transform: `scale(${passScale})` }}
      >
        <span aria-hidden="true">✕</span>
      </button>

      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        aria-label={isSaved ? 'Room saved' : 'Save this room'}
        className={`flex h-[4.7rem] w-[4.7rem] items-center justify-center rounded-full border text-[2rem] transition duration-200 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-60 ${
          isSaved
            ? 'border-emerald-100 bg-emerald-100 text-emerald-700 shadow-[0_18px_34px_-20px_rgba(16,185,129,0.45)]'
            : saveActive
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700 shadow-[0_18px_34px_-18px_rgba(16,185,129,0.52)]'
              : 'shadow-pressable border-emerald-300 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white hover:-translate-y-0.5 hover:from-emerald-500 hover:to-emerald-600'
        }`}
        style={{ transform: `scale(${saveScale})` }}
      >
        <span aria-hidden="true">{isSaved ? '✓' : '♥'}</span>
      </button>
    </div>
  )
}
