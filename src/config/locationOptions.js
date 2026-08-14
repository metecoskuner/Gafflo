export const cityOptions = ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford']

export const areaOptionsByCity = {
  Dublin: ['Rathmines', 'Ranelagh', 'Portobello', 'Smithfield', 'Drumcondra', 'Phibsborough', 'Ballsbridge', 'Dublin 2', 'Grand Canal Dock'],
  Cork: ['City Centre', 'Blackrock', 'Douglas'],
  Galway: ['City Centre', 'Salthill'],
  Limerick: ['City Centre'],
  Waterford: ['City Centre'],
}

function canonicalKey(value) {
  return String(value || '').trim().toLowerCase()
}

export function getAreaOptionsForCity(city) {
  return areaOptionsByCity[city] || []
}

export function normalizeAreaName(value, city = '') {
  const trimmed = String(value || '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  const match = getAreaOptionsForCity(city).find((area) => canonicalKey(area) === canonicalKey(trimmed))
  return match || trimmed
}

export function normalizePreferredAreas(areas = [], city = '') {
  const values = Array.isArray(areas) ? areas : String(areas || '').split(',')
  const seen = new Set()
  return values
    .map((area) => normalizeAreaName(area, city))
    .filter((area) => {
      const key = canonicalKey(area)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function resetAreasForCityChange(currentCity, nextCity) {
  return currentCity === nextCity ? null : { targetCity: nextCity, preferredAreas: [], areaDraft: '' }
}
