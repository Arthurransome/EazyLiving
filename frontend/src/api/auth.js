import { api, setToken, clearToken } from "./client"

export async function login({ email, password }) {
  const res = await api.post("/auth/login", { email, password })
  setToken(res.access_token)
  return api.get("/users/me")
}

export async function register({ email, password, name, role, phone }) {
  await api.post("/auth/register", { email, password, name, role, phone })
  const res = await api.post("/auth/login", { email, password })
  setToken(res.access_token)
  return api.get("/users/me")
}

export async function me() {
  return api.get("/users/me")
}

export async function logout() {
  try {
    await api.post("/auth/logout")
  } finally {
    clearToken()
  }
}
