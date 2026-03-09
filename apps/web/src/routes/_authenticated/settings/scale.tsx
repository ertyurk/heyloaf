import { Badge } from "@heyloaf/ui/components/badge"
import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@heyloaf/ui/components/select"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { availableProtocols, ScaleConnection, type ScaleReading } from "@/lib/scale"

export const Route = createFileRoute("/_authenticated/settings/scale")({
  component: ScaleSettingsPage,
})

function ScaleSettingsPage() {
  const { t } = useTranslation()
  const connectionRef = useRef<ScaleConnection | null>(null)

  const [connected, setConnected] = useState(false)
  const [reading, setReading] = useState<ScaleReading | null>(null)
  const [protocolName, setProtocolName] = useState(availableProtocols[0].name)
  const [baudRate, setBaudRate] = useState("9600")
  const [dataBits, setDataBits] = useState("8")
  const [parity, setParity] = useState("none")
  const [stopBits, setStopBits] = useState("1")

  const supported = ScaleConnection.isSupported()

  const handleConnect = useCallback(async () => {
    try {
      const protocol = availableProtocols.find((p) => p.name === protocolName)
      const conn = new ScaleConnection(protocol)
      conn.onWeight((r) => setReading(r))
      await conn.connect({
        baudRate: Number(baudRate),
        dataBits: Number(dataBits) as 7 | 8,
        parity: parity as "none" | "even" | "odd",
        stopBits: Number(stopBits) as 1 | 2,
      })
      connectionRef.current = conn
      setConnected(true)
      toast.success(t("scale.connected"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed")
    }
  }, [protocolName, baudRate, dataBits, parity, stopBits, t])

  const handleDisconnect = useCallback(async () => {
    if (connectionRef.current) {
      await connectionRef.current.disconnect()
      connectionRef.current = null
    }
    setConnected(false)
    setReading(null)
    toast.success(t("scale.disconnected"))
  }, [t])

  return (
    <>
      <PageHeader title={t("scale.title")} description={t("scale.configuration")} />

      <div className="space-y-4 p-6">
        {!supported && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">{t("scale.unsupported")}</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Configuration */}
          <Card className="mx-auto w-full max-w-lg">
            <CardHeader>
              <CardTitle>{t("scale.configuration")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>{t("scale.protocol")}</Label>
                <Select
                  value={protocolName}
                  onValueChange={(v) => v && setProtocolName(v)}
                  disabled={connected}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProtocols.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="baudRate">{t("scale.baudRate")}</Label>
                  <Input
                    id="baudRate"
                    type="number"
                    value={baudRate}
                    onChange={(e) => setBaudRate(e.target.value)}
                    disabled={connected}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Data Bits</Label>
                  <Select
                    value={dataBits}
                    onValueChange={(v) => v && setDataBits(v)}
                    disabled={connected}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7</SelectItem>
                      <SelectItem value="8">8</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Parity</Label>
                  <Select
                    value={parity}
                    onValueChange={(v) => v && setParity(v)}
                    disabled={connected}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="even">Even</SelectItem>
                      <SelectItem value="odd">Odd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Stop Bits</Label>
                  <Select
                    value={stopBits}
                    onValueChange={(v) => v && setStopBits(v)}
                    disabled={connected}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {connected ? (
                  <Button variant="destructive" onClick={handleDisconnect}>
                    {t("scale.disconnect")}
                  </Button>
                ) : (
                  <Button onClick={handleConnect} disabled={!supported}>
                    {t("scale.connect")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Live Reading */}
          <Card className="mx-auto w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("scale.weight")}</CardTitle>
                <Badge variant={connected ? "default" : "outline"}>
                  {connected ? t("scale.connected") : t("scale.disconnected")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-5xl font-bold tabular-nums">
                  {reading ? reading.weight.toFixed(3) : "0.000"}
                </p>
                <p className="text-lg text-muted-foreground mt-2">{reading?.unit ?? "kg"}</p>
                {reading && (
                  <Badge variant={reading.stable ? "default" : "secondary"} className="mt-4">
                    {reading.stable ? t("scale.stable") : t("scale.unstable")}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
