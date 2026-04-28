import { api, setToken, clearToken } from "./client"

export async function login({ email, password }) {
  const res = await api.post("/auth/login", { email, password })
  setToken(res.token)
  return res.user
}

export async function register({ email, password, name, role, phone }) {
  const res = await api.post("/auth/register", {
    email,
    password,
    name,
    role,
    phone,
  })
  setToken(res.token)
  return res.user
}

export async function me() {
  return api.get("/auth/me")
}

export async function logout() {
  try {
    await api.post("/auth/logout")
  } finally {
    clearToken()
  }
}
