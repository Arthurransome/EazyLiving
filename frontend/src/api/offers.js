import { api } from "./client"

/**
 * Management offers — the owner-to-manager engagement workflow.
 *
 * Status lifecycle:
 *   pending -> accepted | declined | withdrawn
 *
 * Owners create offers (POST). Managers accept (with fee + signature) or
 * decline; owners can withdraw a still-pending offer.
 */
export const listOffers = () => api.get("/management-offers")
export const getOffer = (id) => api.get(`/management-offers/${id}`)
export const createOffer = (body) => api.post("/management-offers", body)

export const acceptOffer = (id, body) =>
  api.put(`/management-offers/${id}`, { event: "accept", ...body })

export const declineOffer = (id, reason) =>
  api.put(`/management-offers/${id}`, { event: "decline", reason })

export const withdrawOffer = (id) =>
  api.put(`/management-offers/${id}`, { event: "withdraw" })
