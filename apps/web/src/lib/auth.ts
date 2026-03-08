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

  setAuth: (data: { token: string; refreshToken: string; user: User; company: Company }) => void
  setToken: (token: string) => void
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

      setAuth: (data) =>
        set({
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user,
          company: data.company,
        }),

      setToken: (token) => set({ token }),

      clearAuth: () => set({ token: null, refreshToken: null, user: null, company: null }),

      isAuthenticated: () => get().token !== null,
    }),
    {
      name: "heyloaf-auth",
    }
  )
)
