import { create } from "zustand"
import { persist } from "zustand/middleware"

interface User {
  id: string
  name: string
  email: string
}

interface Company {
  id: string
  name: string
}

type Permissions = Record<string, string>

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  company: Company | null
  companies: Company[]
  role: string | null
  permissions: Permissions

  setAuth: (data: {
    token: string
    refreshToken: string
    user: User
    company: Company
    companies?: Company[]
    role?: string | null
    permissions?: Permissions
  }) => void
  setToken: (token: string) => void
  setCompany: (company: Company) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
  /** Check whether the current user can view a given module. */
  canViewModule: (module: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      company: null,
      companies: [],
      role: null,
      permissions: {},

      setAuth: (data) =>
        set({
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user,
          company: data.company,
          companies:
            data.companies && data.companies.length > 0
              ? data.companies
              : data.company
                ? [data.company]
                : [],
          role: data.role ?? null,
          permissions: data.permissions ?? {},
        }),

      setToken: (token) => set({ token }),

      setCompany: (company) => set({ company }),

      clearAuth: () =>
        set({
          token: null,
          refreshToken: null,
          user: null,
          company: null,
          companies: [],
          role: null,
          permissions: {},
        }),

      isAuthenticated: () => get().token !== null,

      canViewModule: (module: string) => {
        const { role, permissions } = get()
        if (role === "admin") return true
        const level = permissions[module]
        if (level && level !== "none") return true
        // Fallback: if no module-level perm is set, use role heuristic
        if (!level) {
          return role === "manager" || role === "user" || role === "cashier"
        }
        return false
      },
    }),
    {
      name: "heyloaf-auth",
    }
  )
)
