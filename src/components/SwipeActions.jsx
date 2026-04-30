import Button from './Button'

export default function SwipeActions({ onPass, onSave, isSaved }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onPass} className="gap-2 active:scale-[0.98]" aria-label="Pass this room">
          <span aria-hidden="true">✕</span>
          Pass
        </Button>
        <Button
          onClick={onSave}
          className={`gap-2 active:scale-[0.98] ${isSaved ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 hover:from-emerald-100 hover:to-emerald-200' : ''}`}
          aria-label={isSaved ? 'Room saved' : 'Save this room'}
        >
          <span aria-hidden="true">{isSaved ? '✓' : '♥'}</span>
          {isSaved ? 'Saved' : 'Save'}
        </Button>
      </div>
      <p className="text-center text-xs font-medium text-slate-500">
        Swipe left to pass, swipe right to save, or scroll inside the card for details.
      </p>
    </div>
  )
}
