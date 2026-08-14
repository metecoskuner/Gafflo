import { compareLocalDates, differenceInLocalDays, getLocalDateKey, isValidLocalDate, parseLocalDate } from './localDate'

export function formatDate(value) {
  if (!value) return 'Flexible'
  const localDate = parseLocalDate(value)
  const date = localDate || new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date to confirm'

  return new Intl.DateTimeFormat('en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function getTodayIsoDate() {
  return getLocalDateKey()
}

export function isPastIsoDate(value, today = getTodayIsoDate()) {
  if (!value) return false
  const comparison = compareLocalDates(value, today)
  return comparison === null ? false : comparison < 0
}

export function getFutureViewingSlots(now = new Date()) {
  const base = new Date(now)
  base.setHours(0, 0, 0, 0)

  const build = (daysFromNow, time) => {
    const date = new Date(base)
    date.setDate(base.getDate() + daysFromNow)
    const [hours, minutes] = time.split(':').map(Number)
    date.setHours(hours, minutes, 0, 0)
    return {
      id: `slot-${date.toISOString().replace(/[^0-9a-z]/gi, '')}`,
      startsAt: date.toISOString(),
      label: formatViewingSlotDateTime(date.toISOString()),
    }
  }

  return [build(2, '11:00'), build(2, '12:30'), build(4, '18:00')]
}

export function differenceInDaysSafe(dateA, dateB) {
  if (!dateA || !dateB) return 999

  const localDiff = isValidLocalDate(dateA) && isValidLocalDate(dateB) ? differenceInLocalDays(dateA, dateB) : null
  if (localDiff !== null) return Math.abs(localDiff)

  const first = new Date(dateA).getTime()
  const second = new Date(dateB).getTime()
  if (Number.isNaN(first) || Number.isNaN(second)) return 999

  return Math.abs(Math.round((second - first) / (1000 * 60 * 60 * 24)))
}

export function directionalDayGap(dateA, dateB) {
  const diff = differenceInLocalDays(dateA, dateB)
  if (diff !== null) return diff
  if (!dateA || !dateB) return null
  const first = new Date(dateA).getTime()
  const second = new Date(dateB).getTime()
  if (Number.isNaN(first) || Number.isNaN(second)) return null
  return Math.round((second - first) / 86400000)
}

export function formatViewingSlotDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time to confirm'
  return new Intl.DateTimeFormat('en-IE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
