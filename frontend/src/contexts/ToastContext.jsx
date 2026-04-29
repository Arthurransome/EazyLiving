import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Hand-rolled toast system. We didn't want to pull in a full toast lib —
 * this is a tiny queue + viewport with auto-dismiss timers. The viewport
 * is a fixed-position stack in the bottom-right of the screen.
 *
 * Usage:
 *   const toast = useToast()
 *   toast.success("Saved")
 *   toast.error("Couldn't save", "Try again in a moment.")
 *
 * Each variant maps to an icon + accent color. The optional second argument
 * is a longer description rendered under the title.
 */

const ToastContext = createContext(null)

const VARIANT_META = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
    ring: "ring-emerald-200",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    ring: "ring-destructive/30",
  },
  warning: {
    icon: TriangleAlert,
    iconClass: "text-amber-600",
    ring: "ring-amber-200",
  },
  info: {
    icon: Info,
    iconClass: "text-blue-600",
    ring: "ring-blue-200",
  },
}

const DEFAULT_DURATION = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const handle = timers.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (variant, title, description, options) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random()}`
      const duration = options?.duration ?? DEFAULT_DURATION
      setToasts((prev) => [
        ...prev,
        { id, variant, title, description },
      ])
      if (duration > 0) {
        const handle = setTimeout(() => dismiss(id), duration)
        timers.current.set(id, handle)
      }
      return id
    },
    [dismiss],
  )

  // Stable API — toast.success / .error / etc. always reference the same
  // function objects so consumers can put `toast` in dependency arrays.
  const api = useMemo(
    () => ({
      success: (title, description, options) =>
        push("success", title, description, options),
      error: (title, description, options) =>
        push("error", title, description, options),
      warning: (title, description, options) =>
        push("warning", title, description, options),
      info: (title, description, options) =>
        push("info", title, description, options),
      dismiss,
    }),
    [push, dismiss],
  )

  // Clear all timers when the provider unmounts to avoid setState-after-unmount.
  useEffect(() => {
    const mapAtMount = timers.current
    return () => {
      mapAtMount.forEach((handle) => clearTimeout(handle))
      mapAtMount.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>")
  }
  return ctx
}

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }) {
  const meta = VARIANT_META[toast.variant] || VARIANT_META.info
  const Icon = meta.icon
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border bg-background p-3 shadow-lg ring-1 ring-black/5",
        "animate-in fade-in slide-in-from-right-4 duration-200",
        meta.ring,
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", meta.iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
