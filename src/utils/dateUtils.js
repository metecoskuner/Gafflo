export function formatDate(value) {
  if (!value) return 'Flexible'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date to confirm'

  return new Intl.DateTimeFormat('en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function isPastIsoDate(value, today = getTodayIsoDate()) {
  if (!value) return false
  return value < today
}

export function getFutureViewingSlots(now = new Date()) {
  const base = new Date(now)
  base.setHours(0, 0, 0, 0)

  const build = (daysFromNow, time) => {
    const date = new Date(base)
    date.setDate(base.getDate() + daysFromNow)
    return `${formatDate(date.toISOString().slice(0, 10))}, ${time}`
  }

  return [build(2, '11:00'), build(2, '12:30'), build(4, '18:00')]
}

export function differenceInDaysSafe(dateA, dateB) {
  if (!dateA || !dateB) return 999

  const first = new Date(dateA).getTime()
  const second = new Date(dateB).getTime()

  if (Number.isNaN(first) || Number.isNaN(second)) return 999

  return Math.abs(Math.round((second - first) / (1000 * 60 * 60 * 24)))
}
