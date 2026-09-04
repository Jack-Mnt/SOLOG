import type { Session, User } from '@supabase/supabase-js'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../../lib/supabase'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  initializationError: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    supabase ? 'loading' : 'unauthenticated',
  )
  const [session, setSession] = useState<Session | null>(null)
  const [initializationError, setInitializationError] = useState<string | null>(
    supabase ? null : 'La conexión con Supabase no está configurada.',
  )

  useEffect(() => {
    const client = supabase

    if (!client) return

    let active = true
    let authEventReceived = false

    const applySession = (nextSession: Session | null) => {
      if (!active) return
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'unauthenticated')
      setInitializationError(null)
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true
      applySession(nextSession)
    })

    void client.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return

      if (error) {
        setInitializationError('No se pudo recuperar la sesión de Supabase.')
        setStatus('unauthenticated')
        return
      }

      applySession(data.session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      initializationError,
      login: async (email, password) => {
        if (!supabase) {
          throw new Error('La conexión con Supabase no está configurada.')
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error
      },
      logout: async () => {
        if (!supabase) return
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [initializationError, session, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider.')
  }

  return context
}
