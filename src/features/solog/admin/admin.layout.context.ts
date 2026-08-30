import { createContext, useContext } from 'react'
import type { SologAdminOperationalBootstrap } from '../types'
import type { useAdminSolog } from './admin.solog.hook'

type AdminState = ReturnType<typeof useAdminSolog>

export interface AdminLayoutContextValue {
  operationalBootstrap: SologAdminOperationalBootstrap
  admin: AdminState
  refreshOperationalState: () => Promise<void>
}

export const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null)

export function useAdminLayout(): AdminLayoutContextValue {
  const context = useContext(AdminLayoutContext)
  if (!context) throw new Error('useAdminLayout debe usarse dentro de AdminLayout.')
  return context
}
