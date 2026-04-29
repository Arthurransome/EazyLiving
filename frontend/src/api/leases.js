import { api } from "./client"

export const listLeases = () => api.get("/leases")
export const getLease = (id) => api.get(`/leases/${id}`)
export const createLease = (body) => api.post("/leases", body)
export const updateLease = (id, body) => api.put(`/leases/${id}`, body)

/**
 * Sign a lease. Role is inferred from the auth token:
 *   - manager: draft -> pending_tenant
 *   - tenant : pending_tenant -> active (creates the first rent invoice)
 */
export const signLease = (id, signature) =>
  api.post(`/leases/${id}/sign`, { signature })
