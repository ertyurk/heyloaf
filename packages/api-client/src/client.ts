import openapiClient from "openapi-fetch"
import type { paths } from "./schema.gen"

export function createClient(baseUrl: string, token?: string) {
  return openapiClient<paths>({
    baseUrl,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}
