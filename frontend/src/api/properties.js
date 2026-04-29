import { api } from "./client"

export const listProperties = () => api.get("/properties")
export const getProperty = (id) => api.get(`/properties/${id}`)
export const createProperty = (body) => api.post("/properties", body)
export const updateProperty = (id, body) => api.put(`/properties/${id}`, body)
export const listUnits = (propertyId) =>
  api.get(`/properties/${propertyId}/units`)
export const createUnit = (propertyId, body) =>
  api.post(`/properties/${propertyId}/units`, body)
