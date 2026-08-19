export default function MatchBadge({ score, compact = false }) {
  const isUnscored = score === null || score === undefined
  const tone = isUnscored
    ? 'border border-slate-200 bg-white/92 text-slate-500'
    : score >= 85
      ? 'shadow-soft bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
      : score >= 70
        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border border-slate-200 bg-white/92 text-slate-700'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} ${tone}`}>
      <span className={`${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'} inline-block rounded-full bg-current opacity-70`} />
      {isUnscored ? 'Unscored' : `${score}%${compact ? '' : ' rental fit'}`}
    </span>
  )
}
