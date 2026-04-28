import { api } from "./client"

export const listUsers = () => api.get("/users")
export const getUser = (id) => api.get(`/users/${id}`)
export const updateUser = (id, body) => api.put(`/users/${id}`, body)
