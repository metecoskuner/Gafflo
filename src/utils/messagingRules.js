export function sanitizeMessageBody(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 1200)
}

export function hasDuplicateRecentMessage(conversation, sender, body, now) {
  const lastMessage = (conversation.messages || [])[conversation.messages?.length - 1]
  if (!lastMessage || lastMessage.sender !== sender || lastMessage.body !== body) return false
  const lastSentAt = new Date(lastMessage.createdAt).getTime()
  if (Number.isNaN(lastSentAt)) return false
  return now - lastSentAt < 5000
}

export function hasDuplicateEnquiry(enquiries, propertyId, tenantId) {
  return enquiries.some((enquiry) => enquiry.propertyId === propertyId && enquiry.tenantId === tenantId)
}
