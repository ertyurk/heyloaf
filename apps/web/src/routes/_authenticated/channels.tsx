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
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useApi } from "@/hooks/use-api"

export const Route = createFileRoute("/_authenticated/channels")({
  component: ChannelsPage,
})

function ChannelsPage() {
  const { t } = useTranslation()
  const client = useApi()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editChannel, setEditChannel] = useState<{
    id: string
    code: string
    name: string
  } | null>(null)

  const [formCode, setFormCode] = useState("")
  const [formName, setFormName] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["marketplace-channels"],
    queryFn: async () => {
      const res = await client.GET("/api/marketplace-channels")
      return res.data
    },
  })

  const createChannelMutation = useMutation({
    mutationFn: async (body: { code: string; name: string }) => {
      const res = await client.POST(
        "/api/marketplace-channels" as never,
        {
          body,
        } as never
      )
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-channels"] })
      toast.success(t("channels.channelCreated"))
      closeSheet()
    },
    onError: () => {
      toast.error(t("channels.failedToCreateChannel"))
    },
  })

  const editChannelMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: { code: string; name: string } }) => {
      const res = await client.PUT(`/api/marketplace-channels/${id}` as never, { body } as never)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-channels"] })
      toast.success(t("channels.channelUpdated"))
      closeSheet()
    },
    onError: () => {
      toast.error(t("channels.failedToUpdateChannel"))
    },
  })

  const deleteChannelMutation = useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE(`/api/marketplace-channels/${id}` as never)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-channels"] })
      toast.success(t("channels.channelDeleted"))
    },
    onError: () => {
      toast.error(t("channels.failedToDeleteChannel"))
    },
  })

  const channels = data?.data ?? []

  const filteredChannels = useMemo(() => {
    if (!search.trim()) return channels
    const q = search.toLowerCase()
    return channels.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    )
  }, [channels, search])

  type Channel = (typeof channels)[number]

  const columns = useMemo(
    () => [
      {
        id: "code",
        header: t("common.code"),
        cell: (row: Channel) => <span className="text-muted-foreground">{row.code}</span>,
      },
      {
        id: "name",
        header: t("common.name"),
        cell: (row: Channel) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "active",
        header: t("common.status"),
        cell: (row: Channel) => (
          <Badge
            variant={row.is_active ? "default" : "secondary"}
            className={row.is_active ? "bg-green-100 text-green-800 hover:bg-green-100" : undefined}
          >
            {row.is_active ? t("common.active") : t("common.inactive")}
          </Badge>
        ),
      },
    ],
    [t]
  )

  function openCreate() {
    setEditChannel(null)
    setFormCode("")
    setFormName("")
    setSheetOpen(true)
  }

  function openEdit(channel: Channel) {
    setEditChannel({ id: channel.id, code: channel.code, name: channel.name })
    setFormCode(channel.code)
    setFormName(channel.name)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditChannel(null)
    setFormCode("")
    setFormName("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editChannel) {
      editChannelMutation.mutate({
        id: editChannel.id,
        body: { code: formCode, name: formName },
      })
    } else {
      createChannelMutation.mutate({ code: formCode, name: formName })
    }
  }

  const isPending = editChannel ? editChannelMutation.isPending : createChannelMutation.isPending

  return (
    <>
      <PageHeader title={t("channels.title")} description={t("channels.description")}>
        <Button onClick={openCreate}>{t("channels.addChannel")}</Button>
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
              placeholder={t("channels.searchByNameOrCode")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredChannels}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={t("channels.noChannelsFound")}
          onRowClick={openEdit}
          rowActions={(row) => (
            <>
              <DropdownMenuItem onClick={() => openEdit(row)}>{t("common.edit")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => deleteChannelMutation.mutate(row.id)}
              >
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        />
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet()
          else setSheetOpen(true)
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editChannel ? t("channels.editChannel") : t("channels.addChannel")}
            </SheetTitle>
            <SheetDescription>
              {editChannel ? t("channels.updateDescription") : t("channels.createDescription")}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit}>
            <SheetBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="channel-code">{t("common.code")}</Label>
                <Input
                  id="channel-code"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder={t("channels.channelCode")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel-name">{t("common.name")}</Label>
                <Input
                  id="channel-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t("channels.channelName")}
                  required
                />
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" type="button" onClick={closeSheet}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? editChannel
                    ? t("common.saving")
                    : t("common.creating")
                  : editChannel
                    ? t("common.save")
                    : t("common.create")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
