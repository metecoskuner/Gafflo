// Stage H — translates real notifications rows into the shape components consume.

export function mapNotificationRowToNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    listingId: row.listing_id,
    applicationId: row.application_id,
    conversationId: row.conversation_id,
    viewingProposalId: row.viewing_proposal_id,
    read: Boolean(row.read_at),
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

export function getUnreadCount(notifications) {
  return notifications.filter((notification) => !notification.read).length
}

export function filterUnreadNotifications(notifications) {
  return notifications.filter((notification) => !notification.read)
}

// Resolves a sensible navigation target from whichever real related id a notification actually
// carries — a conversation is the most specific/actionable destination when present (messaging
// notifications), otherwise the listing itself (application/viewing/moderation notifications).
// Returns null rather than guessing when neither id is present.
export function getNotificationRoute(notification) {
  if (notification.conversationId) return `/messages/${notification.conversationId}`
  if (notification.listingId) return `/properties/${notification.listingId}`
  return null
}
