import { Link } from "react-router-dom"
import { ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function Forbidden() {
  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="size-16 mx-auto rounded-full bg-amber-100 grid place-items-center">
          <ShieldAlert className="size-8 text-amber-700" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          403 — Access denied
        </h1>
        <p className="text-muted-foreground">
          You’re signed in, but your role doesn’t have permission to view this
          page.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back to safety</Link>
        </Button>
      </div>
    </div>
  )
}
