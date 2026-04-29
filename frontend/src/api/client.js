/**
 * Tiny fetch wrapper.
 *
 * - Prefixes every URL with /api/v1 (matches design doc).
 * - Pulls the JWT from sessionStorage and sends it as Bearer.
 * - Throws an ApiError with parsed body on non-2xx so React components can
 *   render meaningful messages.
 */
const API_BASE = "/api/v1"
const TOKEN_KEY = "eazy.token"

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
    this.name = "ApiError"
  }
}

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* SSR / private mode */
  }
}

export function clearToken() {
  setToken(null)
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = new Headers(options.headers || {})
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`
  const body =
    options.body && typeof options.body === "object" && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body

  const res = await fetch(url, { ...options, headers, body })
  let parsed = null
  const text = await res.text()
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  if (!res.ok) {
    const message =
      (parsed && (parsed.detail || parsed.message)) ||
      `Request failed with status ${res.status}`
    throw new ApiError(message, res.status, parsed)
  }
  return parsed
}

// Convenience helpers.
export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: "POST", body }),
  put: (path, body) => apiFetch(path, { method: "PUT", body }),
  patch: (path, body) => apiFetch(path, { method: "PATCH", body }),
  del: (path) => apiFetch(path, { method: "DELETE" }),
}
