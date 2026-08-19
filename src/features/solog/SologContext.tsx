import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import { getSologBootstrap } from './api'
import { getOrCreateDeviceToken } from './device'
import { SologApiError } from './errors'
import type { SologOperationalBootstrap } from './types'

export type SologBootstrapStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SologContextValue {
  status: SologBootstrapStatus
  bootstrap: SologOperationalBootstrap | null
  error: string | null
  notice: string | null
  refresh: (preserveView?: boolean) => Promise<void>
  setNotice: (notice: string | null) => void
}

const SologContext = createContext<SologContextValue | null>(null)

async function loadTrustedBootstrap(): Promise<SologOperationalBootstrap> {
  try {
    const initialBootstrap = await getSologBootstrap()

    if (initialBootstrap.usuario.rol !== 'cajero') {
      return initialBootstrap
    }

    return getSologBootstrap(getOrCreateDeviceToken())
  } catch (error) {
    if (
      error instanceof SologApiError &&
      (error.code === 'SOLOG_DEVICE_REQUIRED' ||
        error.code === 'SOLOG_INVALID_DEVICE_TOKEN')
    ) {
      return getSologBootstrap(getOrCreateDeviceToken())
    }

    throw error
  }
}

export function SologProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [status, setStatus] = useState<SologBootstrapStatus>('idle')
  const [bootstrap, setBootstrap] =
    useState<SologOperationalBootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const refresh = useCallback(async (preserveView = false) => {
    const currentRequest = ++requestVersion.current

    if (auth.status !== 'authenticated') {
      setBootstrap(null)
      setError(null)
      setStatus('idle')
      return
    }

    if (!preserveView) setStatus('loading')
    setError(null)

    try {
      const nextBootstrap = await loadTrustedBootstrap()
      if (currentRequest !== requestVersion.current) return
      setBootstrap(nextBootstrap)
      setStatus('ready')
    } catch (bootstrapError) {
      if (currentRequest !== requestVersion.current) return
      setBootstrap(null)
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : 'No se pudo cargar el estado operativo de SOLOG.',
      )
      setStatus('error')
    }
  }, [auth.status])

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      if (active) void refresh()
    })

    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [auth.user?.id, refresh])

  const value = useMemo<SologContextValue>(
    () => ({ status, bootstrap, error, notice, refresh, setNotice }),
    [bootstrap, error, notice, refresh, status],
  )

  return <SologContext.Provider value={value}>{children}</SologContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSolog(): SologContextValue {
  const context = useContext(SologContext)

  if (!context) {
    throw new Error('useSolog debe utilizarse dentro de SologProvider.')
  }

  return context
}
