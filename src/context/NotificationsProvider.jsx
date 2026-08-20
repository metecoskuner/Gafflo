import { useCallback, useEffect, useState } from 'react'
import { getUnreadCount, mapNotificationRowToNotification } from '../config/notificationAdapter'
import {
  fetchMyNotifications,
  markAllNotificationsRead as markAllNotificationsReadRequest,
  markNotificationRead as markNotificationReadRequest,
} from '../services/notificationsService'
import useAuth from './useAuth'
import NotificationsContext from './NotificationsContext'

const emptyState = { notifications: [], loading: true, error: null }

async function loadNotificationsState() {
  const rows = await fetchMyNotifications()
  return { notifications: rows.map(mapNotificationRowToNotification), loading: false, error: null }
}

// The single real, Supabase-backed source of truth for notifications — see
// services/notificationsService.js and config/notificationAdapter.js. Every notification read or
// write in the app goes through the actions this exposes, never the client directly (mirrors
// EngagementProvider/ViewingsProvider's own "centralize data access" role). Never reads or
// writes localStorage — a stale local notification can never appear as real (see the Stage H
// report's own adversarial test).
export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState(emptyState)

  const refreshNotifications = useCallback(async () => {
    try {
      const next = await loadNotificationsState()
      setState(next)
    } catch {
      setState((current) => ({ ...current, loading: false, error: 'Could not load notifications.' }))
    }
  }, [])

  // NotificationsProvider only ever mounts inside AuthGate's authenticated branch (see App.jsx)
  // — `user` is non-null for this component's entire lifetime, matching every other Stage
  // provider's own guarantee. Under the local dev-auth bypass there is no real Supabase session:
  // this fetch still runs for real, hits RLS as a genuinely unauthenticated request, and fails
  // honestly (caught below) rather than faking a result.
  useEffect(() => {
    let cancelled = false
    loadNotificationsState()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: 'Could not load notifications.' }))
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // Confirmed-success-then-update, never speculative-then-rollback (matches EngagementProvider's
  // own setSaved()): the local row is only ever mutated after the real RPC call succeeds.
  const markRead = useCallback(async (notificationId) => {
    try {
      await markNotificationReadRequest(notificationId)
      setState((current) => ({
        ...current,
        notifications: current.notifications.map((notification) =>
          notification.id === notificationId && !notification.read
            ? { ...notification, read: true, readAt: new Date().toISOString() }
            : notification,
        ),
      }))
      return { error: null }
    } catch {
      return { error: 'Could not update this notification.' }
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsReadRequest()
      setState((current) => ({
        ...current,
        notifications: current.notifications.map((notification) =>
          notification.read ? notification : { ...notification, read: true, readAt: new Date().toISOString() },
        ),
      }))
      return { error: null }
    } catch {
      return { error: 'Could not update notifications.' }
    }
  }, [])

  const value = {
    notifications: state.notifications,
    unreadCount: getUnreadCount(state.notifications),
    loading: state.loading,
    error: state.error,
    refreshNotifications,
    markRead,
    markAllRead,
  }

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
