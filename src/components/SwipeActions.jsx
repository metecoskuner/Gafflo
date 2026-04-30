export default function SwipeActions({ onPass, onSave, isSaved }) {
  return (
    <div className="flex items-center justify-center gap-5">
      <button
        type="button"
        onClick={onPass}
        aria-label="Pass this room"
        className="shadow-soft flex h-15 w-15 items-center justify-center rounded-full bg-white text-[1.7rem] text-slate-700 transition duration-200 hover:-translate-y-0.5 hover:bg-slate-50 active:scale-[0.96]"
      >
        <span aria-hidden="true">✕</span>
      </button>

      <button
        type="button"
        onClick={onSave}
        aria-label={isSaved ? 'Room saved' : 'Save this room'}
        className={`flex h-[4.7rem] w-[4.7rem] items-center justify-center rounded-full text-[2rem] transition duration-200 active:scale-[0.96] ${
          isSaved
            ? 'bg-emerald-100 text-emerald-700 shadow-[0_18px_34px_-20px_rgba(16,185,129,0.45)]'
            : 'shadow-pressable bg-gradient-to-br from-emerald-400 to-emerald-600 text-white hover:-translate-y-0.5 hover:from-emerald-500 hover:to-emerald-600'
        }`}
      >
        <span aria-hidden="true">{isSaved ? '✓' : '♥'}</span>
      </button>
    </div>
  )
}
