export function belongsToViewer(record, role, tenantId, ownerId) {
  if (!record) return false
  return role === 'landlord' ? record.ownerId === ownerId : record.tenantId === tenantId
}
