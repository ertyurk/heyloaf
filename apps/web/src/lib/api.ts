import { createClient } from "@heyloaf/api-client"

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8083"

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
    if (!res.ok) return null

    const body = (await res.json()) as {
      data?: { access_token?: string }
    }
    return body.data?.access_token ?? null
  } catch {
    return null
  }
}

/**
 * Ensures only one refresh request is in-flight at a time.
 * Concurrent 401s will share the same promise.
 */
function doRefresh(): Promise<string | null> {
  if (!isRefreshing) {
    isRefreshing = true
    refreshPromise = refreshAccessToken().finally(() => {
      isRefreshing = false
      refreshPromise = null
    })
  }
  return refreshPromise as Promise<string | null>
}

export function getApiClient(token?: string) {
  const client = createClient(API_BASE_URL, token)

  client.use({
    // Ensure cookies are sent with every request
    async onRequest({ request }) {
      const updated = new Request(request, { credentials: "include" })
      return updated
    },

    // Intercept 401 responses and attempt token refresh
    async onResponse({ response, request }) {
      if (response.status !== 401) return response

      // Lazy-import to avoid circular dependency at module init
      const { useAuthStore } = await import("./auth")

      const newToken = await doRefresh()
      if (!newToken) {
        useAuthStore.getState().clearAuth()
        if (typeof window !== "undefined") {
          window.location.href = "/login"
        }
        return response
      }

      // Update stored token
      useAuthStore.getState().setToken(newToken)

      // Retry the original request with the new token
      const retryHeaders = new Headers(request.headers)
      retryHeaders.set("Authorization", `Bearer ${newToken}`)

      const retryResponse = await fetch(request.url, {
        method: request.method,
        headers: retryHeaders,
        body: request.body,
        credentials: "include",
      })

      return retryResponse
    },
  })

  return client
}
