import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { useAuthStore } from "@/lib/auth"

export const Route = createFileRoute("/_authenticated")({
  component: AuthGuard,
})

function AuthGuard() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  useEffect(() => {
    if (hasHydrated && !token) {
      navigate({ to: "/login" })
    }
  }, [hasHydrated, token, navigate])

  if (!hasHydrated || !token) return null

  return <AppLayout />
}
