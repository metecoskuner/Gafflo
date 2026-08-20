// Stage H — the ONLY module that issues supabase.from('notifications') / supabase.rpc(
// 'mark_notification_read'|'mark_all_notifications_read') calls. Pages call
// NotificationsProvider's actions, which call these functions — never the client directly
// (mirrors engagementService.js/viewingsService.js's role from Stage F/G). RLS + the guarded
// SECURITY DEFINER functions are the actual authorization boundary; there is no client INSERT
// path for notifications at all — every row is created server-side by create_notification(),
// called only from within the real event-producing RPCs (see the Stage H migration).
import { supabase } from '../lib/supabase'

const NOTIFICATION_COLUMNS =
  'id, type, title, body, listing_id, application_id, conversation_id, viewing_proposal_id, read_at, created_at'

function raise(error, fallbackMessage) {
  const wrapped = new Error(error?.message || fallbackMessage)
  wrapped.code = error?.code
  throw wrapped
}

// RLS (notifications_select_own) already returns exactly the caller's own rows — one unfiltered
// select, ordered newest-first, is both correct and sufficient. Capped at a defensive 50 rows —
// pagination is a later concern this stage deliberately does not build (see the Stage H report).
export async function fetchMyNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) raise(error, 'Could not load notifications.')
  return data || []
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: notificationId })
  if (error) raise(error, 'Could not update this notification.')
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc('mark_all_notifications_read')
  if (error) raise(error, 'Could not update notifications.')
}
