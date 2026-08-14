export function getLocalDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

export function isValidLocalDate(value) {
  return Boolean(parseLocalDate(value))
}

export function compareLocalDates(a, b) {
  const first = parseLocalDate(a)
  const second = parseLocalDate(b)
  if (!first || !second) return null
  if (first.getTime() === second.getTime()) return 0
  return first.getTime() < second.getTime() ? -1 : 1
}

export function differenceInLocalDays(dateA, dateB) {
  const first = parseLocalDate(dateA)
  const second = parseLocalDate(dateB)
  if (!first || !second) return null
  first.setHours(12, 0, 0, 0)
  second.setHours(12, 0, 0, 0)
  return Math.round((second.getTime() - first.getTime()) / 86400000)
}
