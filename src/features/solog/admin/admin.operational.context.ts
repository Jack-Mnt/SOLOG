import { createContext, useContext } from 'react'
import type { SologAdminSite } from '../types'
import type {
  ControlDateRange,
  ControlPeriodPreset,
} from './control/admin.control.period'

const SITE_ORDER = ['cutervo', 'huaca', 'divino', 'unidad', 'casuarinas'] as const

export interface AdminOperationalContextValue extends ControlDateRange {
  sedeId: string
  periodPreset: ControlPeriodPreset
  sites: SologAdminSite[]
  setSedeId: (sedeId: string) => void
  setPeriodPreset: (
    preset: Exclude<ControlPeriodPreset, 'custom'>,
  ) => void
  applyCustomPeriod: (range: ControlDateRange) => string | null
}

export const AdminOperationalContext =
  createContext<AdminOperationalContextValue | null>(null)

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

export function orderAdminOperationalSites(
  sites: SologAdminSite[],
): SologAdminSite[] {
  const positions = new Map<string, number>(
    SITE_ORDER.map((name, index) => [name, index]),
  )
  return sites
    .filter((site) => site.activo)
    .slice()
    .sort((left, right) => {
      const leftPosition =
        positions.get(normalizeName(left.nombre)) ?? SITE_ORDER.length
      const rightPosition =
        positions.get(normalizeName(right.nombre)) ?? SITE_ORDER.length
      return (
        leftPosition - rightPosition ||
        left.nombre.localeCompare(right.nombre, 'es')
      )
    })
}

export function getAdminSiteDisplayName(site: SologAdminSite): string {
  return normalizeName(site.nombre) === 'casuarinas' ? 'Casua' : site.nombre
}

export function getDefaultAdminSiteId(sites: SologAdminSite[]): string {
  return (
    sites.find((site) => normalizeName(site.nombre) === 'cutervo')?.id ??
    sites[0]?.id ??
    ''
  )
}

export function useAdminOperationalContext(): AdminOperationalContextValue {
  const context = useContext(AdminOperationalContext)
  if (!context) {
    throw new Error(
      'useAdminOperationalContext debe usarse dentro de AdminOperationalProvider.',
    )
  }
  return context
}
