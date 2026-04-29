import { api } from "./client"

/**
 * Tenant invites — a manager creates a tenant account + links them to a unit.
 *
 * The POST returns: { invite, user, temp_password }. Surface the temp
 * password to the manager so they can share it (real backend would email
 * the tenant a magic link).
 */
export const listInvites = () => api.get("/tenant-invites")
export const inviteTenant = (body) => api.post("/tenant-invites", body)
