import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { api, tokenStore } from '@/services/api'
import type { UserMe } from '@/lib/types'

interface AuthState {
  user: UserMe | null
  loading: boolean
  login: (identifier: string, password: string) => Promise<UserMe>
  signup: (data: Parameters<typeof api.signup>[0]) => Promise<UserMe>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => (tokenStore.get() ? api.me().catch(() => null) : Promise.resolve(null)),
    staleTime: Infinity,
  })

  const finish = useCallback(
    (token: string, u: UserMe) => {
      tokenStore.set(token)
      qc.setQueryData(['me'], u)
      // Viewer-specific fields (starred/bookmarked) change with identity.
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      return u
    },
    [qc],
  )

  const value = useMemo<AuthState>(
    () => ({
      user: user ?? null,
      loading: isLoading,
      login: async (identifier, password) => {
        const res = await api.login(identifier, password)
        return finish(res.access_token, res.user)
      },
      signup: async (data) => {
        const res = await api.signup(data)
        return finish(res.access_token, res.user)
      },
      logout: () => {
        tokenStore.clear()
        qc.setQueryData(['me'], null)
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      },
    }),
    [user, isLoading, finish, qc],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
