import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { DataTable } from "@heyloaf/ui/components/data-table"
import { DropdownMenuItem, DropdownMenuSeparator } from "@heyloaf/ui/components/dropdown-menu"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@heyloaf/ui/components/sheet"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/production")({
  component: ProductionPage,
})

function ProductionPage() {
  const client = useApi()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["production-sessions"],
    queryFn: async () => {
      const res = await client.GET("/api/production/sessions")
      return res.data
    },
  })

  const createSession = useMutation({
    mutationFn: async (name?: string) => {
      const res = await client.POST(
        "/api/production/sessions" as never,
        {
          body: { name },
        } as never
      )
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-sessions"] })
      toast.success("Session created")
      setCreateOpen(false)
      setNewSessionName("")
    },
    onError: () => {
      toast.error("Failed to create session")
    },
  })

  const completeSession = useMutation({
    mutationFn: async (id: string) => {
      await client.POST(`/api/production/sessions/${id}/complete` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-sessions"] })
      toast.success("Session completed")
    },
    onError: () => {
      toast.error("Failed to complete session")
    },
  })

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE(`/api/production/sessions/${id}` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-sessions"] })
      toast.success("Session deleted")
    },
    onError: () => {
      toast.error("Failed to delete session")
    },
  })

  const sessions = data?.data ?? []

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter((s) => s.name?.toLowerCase().includes(q))
  }, [sessions, search])

  type Session = (typeof sessions)[number]

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: "Session Name",
        cell: (row: Session) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: (row: Session) => (
          <Badge
            variant={row.status === "completed" ? "default" : "secondary"}
            className={
              row.status === "completed"
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : row.status === "in_progress"
                  ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
                  : undefined
            }
          >
            {row.status.replace(/_/g, " ")}
          </Badge>
        ),
      },
      {
        id: "started",
        header: "Started",
        cell: (row: Session) => (
          <span className="text-muted-foreground">
            {new Date(row.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "items_count",
        header: "Items Count",
        cell: (row: Session) => (
          <span className="text-muted-foreground">
            {((row as Record<string, unknown>).items_count as number) ?? "\u2014"}
          </span>
        ),
      },
    ],
    []
  )

  return (
    <>
      <PageHeader title="Production" description="Manage production sessions">
        <Button onClick={() => setCreateOpen(true)}>New Session</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-4">
          <div className="relative max-w-sm flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              placeholder="Search by session name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredSessions}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No production sessions found."
          rowActions={(row) => (
            <>
              {row.status === "in_progress" && (
                <DropdownMenuItem onClick={() => completeSession.mutate(row.id)}>
                  Complete
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => deleteSession.mutate(row.id)}>
                Delete
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New Production Session</SheetTitle>
            <SheetDescription>
              Create a new production session to track your output.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createSession.mutate(newSessionName || undefined)
            }}
          >
            <SheetBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="session-name">Name (optional)</Label>
                <Input
                  id="session-name"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="Session name"
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSession.isPending}>
                {createSession.isPending ? "Creating..." : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
