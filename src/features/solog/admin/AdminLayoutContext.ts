import { createContext, useContext } from 'react'
import type { SologOperationalBootstrap } from '../types'
import type { useAdminSolog } from './useAdminSolog'

type AdminState = ReturnType<typeof useAdminSolog>

export interface AdminLayoutContextValue {
  operationalBootstrap: SologOperationalBootstrap
  admin: AdminState
  refreshOperationalState: () => Promise<void>
}

export const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null)

export function useAdminLayout(): AdminLayoutContextValue {
  const context = useContext(AdminLayoutContext)
  if (!context) throw new Error('useAdminLayout debe usarse dentro de AdminLayout.')
  return context
}
