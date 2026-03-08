import { createFileRoute, redirect } from "@tanstack/react-router"
import { useAuthStore } from "@/lib/auth"

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const { token } = useAuthStore.getState()
    if (token) {
      throw redirect({ to: "/dashboard" })
    }
    throw redirect({ to: "/login" })
  },
})
