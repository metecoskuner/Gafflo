import Button from './Button'

export default function SwipeActions({ onPass, onSave, onDetails, isSaved }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Button variant="secondary" onClick={onPass} className="gap-2 active:scale-[0.98]" aria-label="Pass this room">
        <span aria-hidden="true">✕</span>
        Pass
      </Button>
      <Button variant="dark" onClick={onDetails} className="gap-2 active:scale-[0.98]" aria-label="Open room details">
        <span aria-hidden="true">→</span>
        Details
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
  )
}
