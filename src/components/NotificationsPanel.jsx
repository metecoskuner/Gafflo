import { useEffect } from 'react'
import { getNotificationRoute } from '../config/notificationAdapter'
import useNotifications from '../context/useNotifications'
import { formatViewingSlotDateTime } from '../utils/dateUtils'

// Bottom-sheet overlay, mirrors App.jsx's own FilterSheet pattern exactly (same backdrop/handle/
// close-button/rounded-card structure) so this fits the existing visual language rather than
// introducing a new one. Mobile-first by construction (max-width container, safe-area padding),
// which is also correct on desktop since AppHeader/the whole app-shell is the same responsive
// container at every viewport width.
export default function NotificationsPanel({ onClose, onNavigate }) {
  const { notifications, unreadCount, loading, error, refreshNotifications, markRead, markAllRead } = useNotifications()

  // Refresh on open so a notification created since the provider's initial load is not missed —
  // this is the "refresh after actions" the panel itself is responsible for, not a poll.
  useEffect(() => {
    refreshNotifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleNotificationClick = async (notification) => {
    if (!notification.read) await markRead(notification.id)
    const route = getNotificationRoute(notification)
    if (route) onNavigate(route)
  }

  return (
    <div className="absolute inset-0 z-50">
      <button type="button" aria-label="Close notifications" className="absolute inset-0 bg-slate-950/28 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-0.75rem)] justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] min-[390px]:px-4 md:px-6">
        <div className="card-surface card-shadow flex w-full max-h-[80dvh] flex-col overflow-hidden rounded-[32px]">
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-slate-200" />
          <div className="flex shrink-0 items-start justify-between gap-4 px-4 pb-3 pt-4 min-[390px]:px-5">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-slate-950">Notifications</div>
              {unreadCount > 0 ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">{unreadCount} unread</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="min-h-9 rounded-full px-3 text-xs font-semibold text-indigo-900 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
                >
                  Mark all read
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Close notifications"
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl font-semibold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
              >
                ×
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] min-[390px]:px-5">
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
            ) : error ? (
              <p className="py-8 text-center text-sm text-slate-500">{error}</p>
            ) : !notifications.length ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">You&rsquo;re all caught up</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Real activity on your applications, messages and viewings will show up here.
                </p>
              </div>
            ) : (
              <ul className="space-y-2 pb-2">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 ${
                        notification.read ? 'bg-white hover:bg-slate-50' : 'bg-indigo-50/70 hover:bg-indigo-50'
                      }`}
                    >
                      {notification.read ? (
                        <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0" />
                      ) : (
                        <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-950" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-950">{notification.title}</span>
                        {notification.body ? (
                          <span className="mt-0.5 block text-sm leading-5 text-slate-600">{notification.body}</span>
                        ) : null}
                        <span className="mt-1 block text-xs text-slate-400">{formatViewingSlotDateTime(notification.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
