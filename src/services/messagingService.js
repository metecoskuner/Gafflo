// Stage E — the ONLY module that issues supabase.from('conversations'|'conversation_participant_state'|
// 'messages'|'blocks') / supabase.rpc('start_conversation'|'send_message'|'mark_conversation_read'|
// 'set_conversation_archived'|'set_conversation_muted'|'block_user'|'unblock_user') calls. Pages
// call MessagingProvider's actions, which call these functions — never the client directly
// (mirrors listingsService.js/applicationsService.js's role from Stage C/D). RLS + the guarded
// SECURITY DEFINER functions on the real tables are the actual authorization boundary.
import { supabase } from '../lib/supabase'

// Embeds this caller's own conversation_participant_state row — the child table's own RLS
// (`user_id = auth.uid()`) still applies even when embedded, so this never returns the
// counterpart's archive/mute/read state, only the caller's, in one round trip.
const CONVERSATION_COLUMNS =
  'id, listing_id, tenant_id, landlord_id, last_message_at, created_at, updated_at, ' +
  'conversation_participant_state(archived_at, muted, last_read_at, user_id)'

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, body, client_message_id, created_at'

function raise(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage)
  wrapped.code = error?.code
  throw wrapped
}

// RLS already returns exactly the caller's own conversations (as tenant OR landlord) — one
// unfiltered select is both correct and sufficient, matching applicationsService.js's own
// fetchMyApplications() precedent.
export async function fetchMyConversations() {
  const { data, error } = await supabase.from('conversations').select(CONVERSATION_COLUMNS)
  if (error) raise(error, 'Could not load conversations.')
  return data || []
}

// Batched across every conversation at once (never per-conversation) — same "fetch once, group
// client-side" pattern as listingsService.js's fetchListingImagesForListings().
export async function fetchMessagesForConversations(conversationIds) {
  if (!conversationIds.length) return []
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true })
  if (error) raise(error, 'Could not load messages.')
  return data || []
}

export async function fetchMyBlocks(userId) {
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId)
  if (error) raise(error, 'Could not load block state.')
  return (data || []).map((row) => row.blocked_id)
}

// The only INSERT path for conversations. tenant/landlord identity, and the first message's
// sender, are all server-derived — the only client input is the listing and the message text.
// On a duplicate (including a real concurrent race) the backend returns the EXISTING
// conversation's id without creating a second message — never retried/forked client-side.
export async function startConversation(listingId, initialMessage, clientMessageId) {
  const { data, error } = await supabase.rpc('start_conversation', {
    p_listing_id: listingId,
    p_initial_message: initialMessage,
    p_client_message_id: clientMessageId,
  })
  if (error) raise(error, 'Could not start this conversation.')
  return data
}

export async function sendMessage(conversationId, body, clientMessageId) {
  const { data, error } = await supabase.rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_client_message_id: clientMessageId,
  })
  if (error) raise(error, 'Could not send this message.')
  return data
}

export async function markConversationRead(conversationId) {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
  if (error) raise(error, 'Could not update this conversation.')
}

export async function setConversationArchived(conversationId, archived) {
  const { error } = await supabase.rpc('set_conversation_archived', { p_conversation_id: conversationId, p_archived: archived })
  if (error) raise(error, 'Could not update this conversation.')
}

export async function setConversationMuted(conversationId, muted) {
  const { error } = await supabase.rpc('set_conversation_muted', { p_conversation_id: conversationId, p_muted: muted })
  if (error) raise(error, 'Could not update this conversation.')
}

export async function blockUserRequest(userId) {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId })
  if (error) raise(error, 'Could not block this user.')
}

export async function unblockUserRequest(userId) {
  const { error } = await supabase.rpc('unblock_user', { p_user_id: userId })
  if (error) raise(error, 'Could not unblock this user.')
}
