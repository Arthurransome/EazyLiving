import { useCallback, useEffect, useState } from "react"

import * as notificationsApi from "@/api/notifications"
import { useAuth } from "@/contexts/AuthContext"

/**
 * Tiny notifications hook — used by the topbar bell and the notifications page.
 *
 * Fetches the current user's notifications from the API and exposes:
 *   - notifications: full list, newest first
 *   - unreadCount: derived
 *   - loading: initial load state
 *   - error: last fetch error (if any)
 *   - refresh(): re-fetch from server
 *   - markRead(id): optimistic flip + server call
 *   - markAllRead(): optimistic flip-all + server call
 */
export function useNotifications({ pollMs } = {}) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const list = await notificationsApi.listNotifications()
      setNotifications(list)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setNotifications([])
      setLoading(false)
      return undefined
    }
    setLoading(true)
    refresh()
    if (!pollMs) return undefined
    const id = setInterval(refresh, pollMs)
    return () => clearInterval(id)
  }, [user, refresh, pollMs])

  const markRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n)),
    )
    try {
      await notificationsApi.markRead(id)
    } catch {
      // Roll back if the server rejected it.
      refresh()
    }
  }, [refresh])

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try {
      await notificationsApi.markAllRead()
    } catch {
      refresh()
    }
  }, [refresh])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
  }
}
