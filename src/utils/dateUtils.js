export function formatDate(value) {
  if (!value) return 'Flexible'

  return new Intl.DateTimeFormat('en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function differenceInDaysSafe(dateA, dateB) {
  if (!dateA || !dateB) return 999

  const first = new Date(dateA).getTime()
  const second = new Date(dateB).getTime()

  if (Number.isNaN(first) || Number.isNaN(second)) return 999

  return Math.abs(Math.round((second - first) / (1000 * 60 * 60 * 24)))
}
