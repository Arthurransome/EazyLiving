import { api } from "./client"

export const listLeases = () => api.get("/leases")
export const getLease = (id) => api.get(`/leases/${id}`)
export const createLease = (body) => api.post("/leases", body)
export const updateLease = (id, body) => api.put(`/leases/${id}`, body)
