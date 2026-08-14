export function getValidApplicantPropertyId(propertyId, landlordProperties = []) {
  if (!propertyId) return ''
  return landlordProperties.some((property) => property.id === propertyId) ? propertyId : ''
}

export function filterApplicantsByProperty(enquiries = [], propertyId = '') {
  return propertyId ? enquiries.filter((enquiry) => enquiry.propertyId === propertyId) : enquiries
}
