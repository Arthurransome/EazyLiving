import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/shared/PageHeader"

import { createMaintenance } from "@/api/maintenance"
import { PRIORITY_OPTIONS } from "@/lib/maintenance"

const TITLE_MAX = 120
const DESC_MAX = 2000

export default function TenantMaintenanceNew() {
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const titleTooLong = title.length > TITLE_MAX
  const descTooLong = description.length > DESC_MAX
  const canSubmit =
    title.trim().length > 0 &&
    !titleTooLong &&
    !descTooLong &&
    !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createMaintenance({
        title: title.trim(),
        description: description.trim(),
        priority,
      })
      navigate(`/tenant/maintenance/${created.request_id}`, { replace: true })
    } catch (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/tenant/maintenance">
          <ArrowLeft /> Back to maintenance
        </Link>
      </Button>

      <PageHeader
        eyebrow="Tenant"
        title="New maintenance request"
        description="Tell us what's wrong. The property manager will be notified once you submit."
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Couldn&apos;t submit your request</AlertTitle>
          <AlertDescription>
            {error.message || "Please try again."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Request details</CardTitle>
          <CardDescription>
            For emergencies (no heat, flooding, gas) please also call the
            building&apos;s emergency line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="maint-title">Summary</Label>
              <Input
                id="maint-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Kitchen sink dripping under cabinet"
                maxLength={TITLE_MAX + 20}
                required
                autoFocus
              />
              <div
                className={`text-xs ${
                  titleTooLong ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {title.length}/{TITLE_MAX} characters
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maint-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="maint-priority">
                  <SelectValue placeholder="Choose priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maint-desc">Description</Label>
              <Textarea
                id="maint-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When did it start? Any pictures attached? Where exactly is the issue?"
                rows={6}
              />
              <div
                className={`text-xs ${
                  descTooLong ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {description.length}/{DESC_MAX} characters
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={() => navigate("/tenant/maintenance")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitting && <Loader2 className="animate-spin" />}
                Submit request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
