function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

export function getVisibleMvpMockProperties(properties = []) {
  return properties.filter((property) => normalize(property.ownerType) !== 'letting agent' && !normalize(property.features?.join(' ')).includes('managed by agent'))
}
