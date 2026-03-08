import { getApiClient } from "@/lib/api"
import { useAuthStore } from "@/lib/auth"

export function useApi() {
  const token = useAuthStore((s) => s.token)
  return getApiClient(token ?? undefined)
}
