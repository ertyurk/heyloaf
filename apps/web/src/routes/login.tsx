import { Button } from "@heyloaf/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@heyloaf/ui/components/card"
import { Input } from "@heyloaf/ui/components/input"
import { Label } from "@heyloaf/ui/components/label"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { type FormEvent, useEffect, useState } from "react"
import { getApiClient } from "@/lib/api"
import { useAuthStore } from "@/lib/auth"

export const Route = createFileRoute("/login")({
  component: LoginGuard,
})

function LoginGuard() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  useEffect(() => {
    if (hasHydrated && token) {
      navigate({ to: "/dashboard" })
    }
  }, [hasHydrated, token, navigate])

  if (!hasHydrated || token) return null

  return <LoginPage />
}

function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const client = getApiClient()
      const { data, error: apiError } = await client.POST("/auth/login", {
        body: { email, password },
      })

      if (apiError || !data) {
        setError("Invalid email or password")
        return
      }

      const loginData = data as {
        data: {
          access_token: string
          user: { id: string; name: string; email: string }
          company: { id: string; name: string }
          role?: string | null
          permissions?: Record<string, string>
          is_super_admin?: boolean
        }
      }

      setAuth({
        token: loginData.data.access_token,
        user: loginData.data.user,
        company: loginData.data.company,
        role: loginData.data.role,
        permissions: loginData.data.permissions,
        isSuperAdmin: loginData.data.is_super_admin,
      })

      navigate({ to: "/dashboard" })
    } catch {
      setError("Failed to connect to server")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Heyloaf</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@heyloaf.com"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
