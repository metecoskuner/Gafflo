import { formatViewingSlotDateTime } from '../utils/dateUtils'

export const MAX_VIEWING_PROPOSALS = 3

function buildSlotId(startsAt) {
  return `slot-${startsAt.replace(/[^0-9a-z]/gi, '')}`
}

export function makeViewingSlot(startsAt) {
  const date = new Date(startsAt)
  if (Number.isNaN(date.getTime())) return null
  const iso = date.toISOString()
  return {
    id: buildSlotId(iso),
    startsAt: iso,
    label: formatViewingSlotDateTime(iso),
  }
}

export function normalizeViewingSlot(slot, fallbackDate = new Date()) {
  if (!slot) return null
  if (typeof slot === 'object' && slot.startsAt) return makeViewingSlot(slot.startsAt)

  const text = String(slot)
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return makeViewingSlot(parsed.toISOString())

  const timeMatch = text.match(/(\d{1,2}):(\d{2})/)
  if (!timeMatch) return null
  const dayOffsets = {
    today: 0,
    tomorrow: 1,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  }
  const lower = text.toLowerCase()
  const matchedDay = Object.keys(dayOffsets).find((day) => lower.includes(day))
  const base = new Date(fallbackDate)
  base.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0)
  base.setDate(base.getDate() + (matchedDay ? dayOffsets[matchedDay] : 2))
  if (base.getTime() <= Date.now()) base.setDate(base.getDate() + 7)
  return makeViewingSlot(base.toISOString())
}

export function normalizeViewingSlots(slots, fallbackDate) {
  const seen = new Set()
  return (Array.isArray(slots) ? slots : [])
    .map((slot) => normalizeViewingSlot(slot, fallbackDate))
    .filter(Boolean)
    .filter((slot) => {
      if (seen.has(slot.startsAt)) return false
      seen.add(slot.startsAt)
      return true
    })
    .slice(0, MAX_VIEWING_PROPOSALS)
}

export function validateViewingProposal(slots, now = new Date()) {
  const normalized = normalizeViewingSlots(slots, now)
  if (!Array.isArray(slots) || !slots.length) return { valid: false, reason: 'Add at least one viewing time.', slots: [] }
  if (slots.length > MAX_VIEWING_PROPOSALS) return { valid: false, reason: `Propose up to ${MAX_VIEWING_PROPOSALS} times.`, slots: normalized }
  if (normalized.length !== slots.length) return { valid: false, reason: 'Viewing times must be valid and unique.', slots: normalized }
  const nowTime = new Date(now).getTime()
  if (normalized.some((slot) => new Date(slot.startsAt).getTime() <= nowTime)) return { valid: false, reason: 'Viewing times must be in the future.', slots: normalized }
  return { valid: true, reason: '', slots: normalized }
}

export function validateViewingChoice(viewing, slotId, now = new Date()) {
  if (!viewing || viewing.status !== 'viewing proposed') return { valid: false, reason: 'No active viewing proposal.' }
  const proposedSlots = normalizeViewingSlots(viewing.proposedSlots, now)
  const slot = proposedSlots.find((item) => item.id === slotId || item.startsAt === slotId)
  if (!slot) return { valid: false, reason: 'Choose one of the current proposed times.' }
  if (new Date(slot.startsAt).getTime() <= new Date(now).getTime()) return { valid: false, reason: 'That viewing time has expired.' }
  if (viewing.status === 'viewing confirmed' && viewing.selectedSlot?.id === slot.id) return { valid: false, reason: 'That viewing is already confirmed.' }
  return { valid: true, reason: '', slot }
}
