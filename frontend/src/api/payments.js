import { api } from "./client"

export const listPayments = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return api.get(`/payments${qs ? `?${qs}` : ""}`)
}
export const getPayment = (id) => api.get(`/payments/${id}`)
// method: "credit_card" | "bank_transfer" | "balance"
export const processPayment = (id, { method, simulate_failure = false }) =>
  api.post(`/payments/${id}/process`, { method, simulate_failure })
