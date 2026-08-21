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
//
// Two moderation outcomes get their own real destination rather than falling through to the
// generic listing-detail route: a rejected listing's actual next step is editing and
// resubmitting it (request_listing_review() only ever accepts 'draft'/'rejected' — a landlord
// looking at the read-only detail page has nowhere to act from there), and a removed listing has
// no edit path at all (moderator_remove_listing() is terminal), so its own listing detail page is
// not where the reason is ever shown — the landlord's properties list is, so that is the real
// destination.
export function getNotificationRoute(notification) {
  if (notification.conversationId) return `/messages/${notification.conversationId}`
  if (notification.type === 'listing_rejected' && notification.listingId) return `/listings/${notification.listingId}/edit`
  if (notification.type === 'listing_removed') return '/properties'
  if (notification.listingId) return `/properties/${notification.listingId}`
  return null
}
