import { create } from "zustand"
import { persist } from "zustand/middleware"
import { API_BASE_URL } from "./api"

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
  user: User | null
  company: Company | null
  companies: Company[]
  role: string | null
  permissions: Permissions
  isSuperAdmin: boolean
  /** Runtime-only flag — true once zustand persist has rehydrated from localStorage. */
  _hasHydrated: boolean

  setAuth: (data: {
    token: string
    user: User
    company: Company
    companies?: Company[]
    role?: string | null
    permissions?: Permissions
    isSuperAdmin?: boolean
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
      user: null,
      company: null,
      companies: [],
      role: null,
      permissions: {},
      isSuperAdmin: false,
      _hasHydrated: false,

      setAuth: (data) =>
        set({
          token: data.token,
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
          isSuperAdmin: data.isSuperAdmin ?? false,
        }),

      setToken: (token) => set({ token }),

      setCompany: (company) => set({ company }),

      clearAuth: () => {
        // Fire-and-forget logout to clear the httpOnly refresh cookie
        fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {
          // Ignore errors — we're clearing local state regardless
        })

        set({
          token: null,
          user: null,
          company: null,
          companies: [],
          role: null,
          permissions: {},
          isSuperAdmin: false,
        })
      },

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
      partialize: (state) => {
        const { _hasHydrated, ...rest } = state
        return rest
      },
    }
  )
)

// Register hydration callback AFTER store is defined to avoid TDZ
if (typeof window !== "undefined") {
  const setHydrated = () => useAuthStore.setState({ _hasHydrated: true })
  if (useAuthStore.persist.hasHydrated()) {
    setHydrated()
  } else {
    useAuthStore.persist.onFinishHydration(setHydrated)
  }
}
