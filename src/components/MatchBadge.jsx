export default function MatchBadge({ score }) {
  const tone =
    score >= 85
      ? 'shadow-soft bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
      : score >= 70
        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border border-slate-200 bg-white/92 text-slate-700'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${tone}`}>
      <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
      {score}% match
    </span>
  )
}
