import Button from './Button'

export default function SwipeActions({ onPass, onSave, onDetails, isSaved }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Button variant="secondary" onClick={onPass}>
        Pass
      </Button>
      <Button variant="dark" onClick={onDetails}>
        Details
      </Button>
      <Button onClick={onSave} className={isSaved ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : ''}>
        {isSaved ? 'Saved' : 'Save'}
      </Button>
    </div>
  )
}
