import { api } from "./client"

export const listLeases = () => api.get("/leases")
export const getLease = (id) => api.get(`/leases/${id}`)
export const createLease = (body) => api.post("/leases", body)
export const activateLease = (id) => api.post(`/leases/${id}/activate`)
export const terminateLease = (id) => api.post(`/leases/${id}/terminate`)
