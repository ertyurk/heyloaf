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

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  company: Company | null
  companies: Company[]

  setAuth: (data: {
    token: string
    refreshToken: string
    user: User
    company: Company
    companies?: Company[]
  }) => void
  setToken: (token: string) => void
  setCompany: (company: Company) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      company: null,
      companies: [],

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
        }),

      setToken: (token) => set({ token }),

      setCompany: (company) => set({ company }),

      clearAuth: () =>
        set({ token: null, refreshToken: null, user: null, company: null, companies: [] }),

      isAuthenticated: () => get().token !== null,
    }),
    {
      name: "heyloaf-auth",
    }
  )
)
