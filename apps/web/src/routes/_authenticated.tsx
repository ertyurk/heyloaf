import { createFileRoute, redirect } from "@tanstack/react-router"
import { AppLayout } from "@/components/app-layout"
import { useAuthStore } from "@/lib/auth"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: () => {
    const { token } = useAuthStore.getState()
    if (!token) {
      throw redirect({ to: "/login" })
    }
  },
  component: AppLayout,
})
