import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import "./index.css"
import App from "./App.jsx"
import { AuthProvider } from "@/contexts/AuthContext"

async function enableMocking() {
  if (!import.meta.env.DEV) return
  const { worker } = await import("./mocks/browser")
  // 'bypass' so requests we haven't mocked still hit the network (none do
  // right now, but it keeps the dev experience friendly when we add real
  // endpoints later).
  return worker.start({
    onUnhandledRequest: "bypass",
    quiet: false,
  })
}

enableMocking().then(() => {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  )
})
