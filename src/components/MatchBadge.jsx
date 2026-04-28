export default function MatchBadge({ score }) {
  const tone =
    score >= 85
      ? 'bg-emerald-500 text-white'
      : score >= 70
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-100 text-slate-700'

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {score}% match
    </span>
  )
}
