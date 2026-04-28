import { api } from "./client"

export const listNotifications = () => api.get("/notifications")
export const markRead = (id) => api.post(`/notifications/${id}/read`)
export const markAllRead = () => api.post("/notifications/read-all")
