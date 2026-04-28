import { api } from "./client"

export const listMaintenance = () => api.get("/maintenance-requests")
export const getMaintenance = (id) => api.get(`/maintenance-requests/${id}`)
export const createMaintenance = (body) =>
  api.post("/maintenance-requests", body)
// Send { event } or { status } — handler accepts either.
export const updateMaintenance = (id, body) =>
  api.put(`/maintenance-requests/${id}`, body)
