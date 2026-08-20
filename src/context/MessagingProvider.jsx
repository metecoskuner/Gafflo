import { useCallback, useEffect, useMemo, useState } from 'react'
import { mapConversationRowToConversation } from '../config/messageAdapter'
import { describeMessagingError } from '../config/messagingErrors'
import { fetchPublicProfileSummaries } from '../services/listingsService'
import {
  blockUserRequest,
  fetchMessagesForConversations,
  fetchMyBlocks,
  fetchMyConversations,
  markConversationRead as markConversationReadRequest,
  sendMessage as sendMessageRequest,
  setConversationArchived as setConversationArchivedRequest,
  setConversationMuted as setConversationMutedRequest,
  startConversation as startConversationRequest,
  unblockUserRequest,
} from '../services/messagingService'
import useAuth from './useAuth'
import useListings from './useListings'
import MessagingContext from './MessagingContext'

const emptyState = { conversations: [], blockedUserIds: new Set(), loading: true, error: null }

function groupMessagesByConversation(messages) {
  const map = {}
  messages.forEach((message) => {
    const list = map[message.conversation_id] || []
    list.push(message)
    map[message.conversation_id] = list
  })
  return map
}

async function loadMessagingState(userId, listingsById) {
  const rows = await fetchMyConversations()
  const conversationIds = rows.map((row) => row.id)
  const [messages, blockedUserIds] = await Promise.all([
    fetchMessagesForConversations(conversationIds),
    fetchMyBlocks(userId).then((ids) => new Set(ids)),
  ])
  const messagesByConversationId = groupMessagesByConversation(messages)

  const counterpartIds = rows.map((row) => (row.tenant_id === userId ? row.landlord_id : row.tenant_id))
  const profileSummaries = await fetchPublicProfileSummaries(counterpartIds)

  const conversations = rows.map((row) =>
    mapConversationRowToConversation(row, { userId, listingsById, messagesByConversationId, profileSummaries, blockedUserIds }),
  )

  return { conversations, blockedUserIds, loading: false, error: null }
}

// The single real, Supabase-backed source of truth for conversations/conversation_participant_state/
// messages/blocks — see services/messagingService.js and config/messageAdapter.js. Every
// conversation read or write in the app goes through the actions this exposes, never the client
// directly (mirrors ApplicationsProvider/ListingsProvider's own "centralize data access" role).
// Depends on useListings() (a sibling/ancestor provider, see App.jsx) purely to resolve real
// listing context for each conversation without a second listing fetch — never on
// AppStateProvider/the mock marketplace layer, which Stage E retires as authoritative for
// messaging entirely.
export function MessagingProvider({ children }) {
  const { user } = useAuth()
  const { publicListings, myListings } = useListings()
  const [state, setState] = useState(emptyState)

  const listingsById = useMemo(() => {
    const map = {}
    // Own-listing data (fuller: exact_address/eircode) takes precedence over the narrower public
    // projection of the same row, matching MarketplaceState.jsx's own properties merge — a
    // landlord reading their own conversation's listing should see their own full listing.
    ;[...publicListings, ...myListings].forEach((property) => {
      map[property.id] = property
    })
    return map
  }, [publicListings, myListings])

  const refreshMessaging = useCallback(async () => {
    try {
      const next = await loadMessagingState(user.id, listingsById)
      setState(next)
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: describeMessagingError(error) }))
    }
  }, [user, listingsById])

  // MessagingProvider only ever mounts inside AuthGate's authenticated branch (see App.jsx) —
  // `user` is non-null for this component's entire lifetime, matching every other Stage
  // provider's own guarantee. Under the local dev-auth bypass there is no real Supabase session:
  // this fetch still runs for real, hits RLS as a genuinely unauthenticated request, and fails
  // honestly (caught below) rather than faking a result — see config/devAuthBypass.js.
  useEffect(() => {
    let cancelled = false
    loadMessagingState(user.id, listingsById)
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch((error) => {
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: describeMessagingError(error) }))
      })
    return () => {
      cancelled = true
    }
    // listingsById is intentionally excluded: it changes whenever ListingsProvider refreshes
    // (e.g. after any unrelated listing edit) and re-fetching every conversation/message on that
    // is unnecessary — the conversations themselves haven't changed, only which already-loaded
    // listing object they resolve to, which the memo below reconciles without a network call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Re-attaches (already-loaded, no fetch) listing context whenever ListingsProvider's own data
  // changes, without re-fetching conversations/messages/blocks — e.g. a listing getting paused
  // mid-conversation should be reflected without a spurious messaging refresh.
  const conversations = useMemo(
    () => state.conversations.map((conversation) => ({ ...conversation, listing: listingsById[conversation.listingId] || null })),
    [state.conversations, listingsById],
  )

  // Correct for a tenant's own view: the real unique(listing_id, tenant_id) constraint means a
  // tenant can only ever have one conversation for a given listing.
  const getConversationForListing = useCallback(
    (listingId) => conversations.find((conversation) => conversation.listingId === listingId) || null,
    [conversations],
  )

  // For a landlord's view, the same listing can have many conversations (one per applicant) —
  // this disambiguates by which tenant, e.g. for an Applicants.jsx card's "Open conversation"
  // link to that specific applicant's real thread, if one exists.
  const getConversationForListingAndTenant = useCallback(
    (listingId, tenantId) =>
      conversations.find((conversation) => conversation.listingId === listingId && conversation.tenantId === tenantId) || null,
    [conversations],
  )

  // For surfaces outside an open conversation thread (e.g. a listing's own Safety section) that
  // need to know "have I blocked this person" without one existing yet — same blockedUserIds set
  // each conversation's own blockedByMe is already derived from, just keyed by any user id.
  const isUserBlocked = useCallback((userId) => state.blockedUserIds.has(userId), [state.blockedUserIds])

  const startConversation = useCallback(
    async (listingId, initialMessage) => {
      try {
        const clientMessageId = crypto.randomUUID()
        const conversationId = await startConversationRequest(listingId, initialMessage, clientMessageId)
        await refreshMessaging()
        return { conversationId, error: null }
      } catch (error) {
        return { conversationId: null, error: describeMessagingError(error) }
      }
    },
    [refreshMessaging],
  )

  const sendMessage = useCallback(
    async (conversationId, body) => {
      try {
        const clientMessageId = crypto.randomUUID()
        await sendMessageRequest(conversationId, body, clientMessageId)
        await refreshMessaging()
        return { error: null }
      } catch (error) {
        return { error: describeMessagingError(error) }
      }
    },
    [refreshMessaging],
  )

  const markRead = useCallback(
    async (conversationId) => {
      try {
        await markConversationReadRequest(conversationId)
        await refreshMessaging()
        return { error: null }
      } catch (error) {
        return { error: describeMessagingError(error) }
      }
    },
    [refreshMessaging],
  )

  const setArchived = useCallback(
    async (conversationId, archived) => {
      try {
        await setConversationArchivedRequest(conversationId, archived)
        await refreshMessaging()
        return { error: null }
      } catch (error) {
        return { error: describeMessagingError(error) }
      }
    },
    [refreshMessaging],
  )

  const setMuted = useCallback(
    async (conversationId, muted) => {
      try {
        await setConversationMutedRequest(conversationId, muted)
        await refreshMessaging()
        return { error: null }
      } catch (error) {
        return { error: describeMessagingError(error) }
      }
    },
    [refreshMessaging],
  )

  const blockUser = useCallback(
    async (userId) => {
      try {
        await blockUserRequest(userId)
        await refreshMessaging()
        return { error: null }
      } catch (error) {
        return { error: describeMessagingError(error) }
      }
    },
    [refreshMessaging],
  )

  const unblockUser = useCallback(
    async (userId) => {
      try {
        await unblockUserRequest(userId)
        await refreshMessaging()
        return { error: null }
      } catch (error) {
        return { error: describeMessagingError(error) }
      }
    },
    [refreshMessaging],
  )

  const value = {
    conversations,
    loading: state.loading,
    error: state.error,
    refreshMessaging,
    getConversationForListing,
    getConversationForListingAndTenant,
    isUserBlocked,
    startConversation,
    sendMessage,
    markRead,
    setArchived,
    setMuted,
    blockUser,
    unblockUser,
  }

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>
}
