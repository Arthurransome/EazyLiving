import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import * as authApi from "@/api/auth"
import { getToken, clearToken } from "@/api/client"

const AuthContext = createContext(null)

const STATUS = {
  LOADING: "loading",
  AUTHENTICATED: "authenticated",
  UNAUTHENTICATED: "unauthenticated",
}

/**
 * AuthProvider — the single source of truth for "who is logged in".
 *
 * On mount:
 *   - if a token exists in sessionStorage, hydrate the user via /auth/me
 *   - otherwise mark the session as unauthenticated
 *
 * Exposes: { user, status, login, register, logout }
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(STATUS.LOADING)

  // Hydrate session on mount.
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const token = getToken()
      if (!token) {
        if (!cancelled) setStatus(STATUS.UNAUTHENTICATED)
        return
      }
      try {
        const me = await authApi.me()
        if (cancelled) return
        setUser(me)
        setStatus(STATUS.AUTHENTICATED)
      } catch {
        // Token expired or invalid — start clean.
        clearToken()
        if (cancelled) return
        setUser(null)
        setStatus(STATUS.UNAUTHENTICATED)
      }
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const u = await authApi.login(credentials)
    setUser(u)
    setStatus(STATUS.AUTHENTICATED)
    return u
  }, [])

  const register = useCallback(async (data) => {
    const u = await authApi.register(data)
    setUser(u)
    setStatus(STATUS.AUTHENTICATED)
    return u
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
    setStatus(STATUS.UNAUTHENTICATED)
  }, [])

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>")
  }
  return ctx
}

/**
 * Where to send the user after login, based on their role.
 */
export function landingPathFor(user) {
  if (!user) return "/login"
  switch (user.role) {
    case "tenant":
      return "/tenant/dashboard"
    case "manager":
      return "/manager/dashboard"
    case "owner":
      return "/owner/dashboard"
    case "admin":
      return "/manager/dashboard"
    default:
      return "/"
  }
}

export { STATUS as AuthStatus }
