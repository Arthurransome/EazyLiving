import { Link } from "react-router-dom"
import { Frown } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="size-16 mx-auto rounded-full bg-muted grid place-items-center">
          <Frown className="size-8 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          404 — Page not found
        </h1>
        <p className="text-muted-foreground">
          The page you’re looking for doesn’t exist or has been moved.
        </p>
        <Button asChild>
          <Link to="/">Take me home</Link>
        </Button>
      </div>
    </div>
  )
}
