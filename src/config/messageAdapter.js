// Stage E — translates real conversations/messages rows into the shape components consume.
// `listing`/`counterpart` are resolved by the provider (already-loaded real listings + a batched
// get_public_profile_summaries() call — see context/MessagingProvider.jsx) and passed in here,
// never re-fetched per conversation. A missing `listing` (e.g. the landlord since paused it, so
// it fell out of the tenant's real publicListings) is left null rather than fabricated — matches
// the same "historical" limitation already accepted in Stage C/D's own property lookups.

export function mapMessageRowToMessage(row, currentUserId) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    isOutgoing: row.sender_id === currentUserId,
  }
}

export function mapConversationRowToConversation(row, ctx) {
  const isTenant = row.tenant_id === ctx.userId
  const counterpartId = isTenant ? row.landlord_id : row.tenant_id
  const myState = (row.conversation_participant_state || []).find((state) => state.user_id === ctx.userId) || {}
  const messages = (ctx.messagesByConversationId[row.id] || []).map((message) => mapMessageRowToMessage(message, ctx.userId))
  const lastMessage = messages.length ? messages[messages.length - 1] : null
  const lastReadAt = myState.last_read_at ? new Date(myState.last_read_at).getTime() : null

  return {
    id: row.id,
    listingId: row.listing_id,
    listing: ctx.listingsById[row.listing_id] || null,
    tenantId: row.tenant_id,
    landlordId: row.landlord_id,
    isTenant,
    counterpartId,
    counterpart: ctx.profileSummaries[counterpartId] || { displayName: '', avatarUrl: null },
    messages,
    lastMessage,
    archived: Boolean(myState.archived_at),
    muted: Boolean(myState.muted),
    // No last_read_at at all means "never opened" — always unread as long as any message exists
    // (including the tenant's own first message, matching the old mock's own semantics for "new").
    unread: messages.length > 0 && (lastReadAt === null || messages.some((message) => new Date(message.createdAt).getTime() > lastReadAt)),
    blockedByMe: ctx.blockedUserIds.has(counterpartId),
    createdAt: row.created_at,
    updatedAt: row.last_message_at || row.updated_at,
  }
}

// Presentation-only scoping for a dual-role account (tenant_profile + landlord_profile): the
// backend has one real identity (auth.uid()) and never duplicates a conversation per role, so a
// user's tenant-side and landlord-side threads must be separated here, by which side of the real
// conversation they're actually on (isTenant), not by any second identity. Matches the
// role === 'landlord' ? ... : ... convention already used throughout Messages.jsx/Dashboard.jsx.
export function filterConversationsByRole(conversations, activeRole) {
  const wantsTenantSide = activeRole !== 'landlord'
  return conversations.filter((conversation) => conversation.isTenant === wantsTenantSide)
}

// The one and only anti-spam signal Stage E is allowed to use (see the Stage E task's canonical
// rule): a real landlord-authored message existing in THIS conversation — never application
// status, never a mock enquiry field. Mirrors send_message()'s own SQL exactly: `not
// v_landlord_has_replied and tenant_message_count >= 1`.
export function isTenantWaitingForLandlordReply(conversation) {
  if (!conversation.isTenant) return false
  const landlordHasReplied = conversation.messages.some((message) => message.senderId === conversation.landlordId)
  if (landlordHasReplied) return false
  const tenantMessageCount = conversation.messages.filter((message) => message.senderId === conversation.tenantId).length
  return tenantMessageCount >= 1
}
