import { createClient } from "@heyloaf/api-client"

const API_BASE_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8083`
    : "http://localhost:8083"

export function getApiClient(token?: string) {
  return createClient(API_BASE_URL, token)
}
