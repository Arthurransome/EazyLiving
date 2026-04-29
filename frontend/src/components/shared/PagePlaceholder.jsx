import { Construction } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Reusable stub for routes that haven't been built yet.
 * Replaces itself one task at a time as we implement each role's pages.
 */
export function PagePlaceholder({ title, description, role }) {
  return (
    <div className="p-8">
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-muted grid place-items-center">
              <Construction className="size-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              {role && (
                <CardDescription className="capitalize">
                  {role} role
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {description ||
              "This page is not yet implemented. It will be built in an upcoming task."}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
