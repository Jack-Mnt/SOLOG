import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { SologAdminSite } from '../types'
import {
  getControlPeriodRange,
  type ControlDateRange,
  type ControlPeriodPreset,
  validateControlDateRange,
} from './control/admin.control.period'
import {
  AdminOperationalContext,
  getDefaultAdminSiteId,
  orderAdminOperationalSites,
  type AdminOperationalContextValue,
} from './admin.operational.context'

const STORAGE_KEY = 'solog:admin-operational-context:v1'
const PERIOD_PRESETS: ControlPeriodPreset[] = [
  'today',
  'last_week',
  'current_period',
  'previous_period',
  'custom',
]

interface StoredOperationalContext extends ControlDateRange {
  sedeId: string
  periodPreset: ControlPeriodPreset
}

function getInitialSelection(): StoredOperationalContext {
  const defaultRange = getControlPeriodRange('today')
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { sedeId: '', periodPreset: 'today', ...defaultRange }
    }
    const parsed = JSON.parse(raw) as Partial<StoredOperationalContext>
    const periodPreset = PERIOD_PRESETS.includes(
      parsed.periodPreset as ControlPeriodPreset,
    )
      ? (parsed.periodPreset as ControlPeriodPreset)
      : 'today'
    if (
      periodPreset === 'custom' &&
      typeof parsed.dateFrom === 'string' &&
      typeof parsed.dateTo === 'string' &&
      validateControlDateRange({
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
      }) === null
    ) {
      return {
        sedeId: typeof parsed.sedeId === 'string' ? parsed.sedeId : '',
        periodPreset,
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
      }
    }
    const safePreset = periodPreset === 'custom' ? 'today' : periodPreset
    return {
      sedeId: typeof parsed.sedeId === 'string' ? parsed.sedeId : '',
      periodPreset: safePreset,
      ...getControlPeriodRange(safePreset),
    }
  } catch {
    return { sedeId: '', periodPreset: 'today', ...defaultRange }
  }
}

export function AdminOperationalProvider({
  children,
  sites,
}: {
  children: ReactNode
  sites: SologAdminSite[]
}) {
  const orderedSites = useMemo(
    () => orderAdminOperationalSites(sites),
    [sites],
  )
  const [selection, setSelection] =
    useState<StoredOperationalContext>(getInitialSelection)
  const sedeId = orderedSites.some((site) => site.id === selection.sedeId)
    ? selection.sedeId
    : getDefaultAdminSiteId(orderedSites)

  useEffect(() => {
    if (!sedeId) return
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...selection, sedeId }),
      )
    } catch {
      // El contexto sigue funcionando aunque la preferencia no pueda persistirse.
    }
  }, [sedeId, selection])

  const value = useMemo<AdminOperationalContextValue>(
    () => ({
      ...selection,
      sedeId,
      sites: orderedSites,
      setSedeId: (nextSedeId) => {
        if (!orderedSites.some((site) => site.id === nextSedeId)) return
        setSelection((current) => ({ ...current, sedeId: nextSedeId }))
      },
      setPeriodPreset: (periodPreset) => {
        setSelection((current) => ({
          ...current,
          periodPreset,
          ...getControlPeriodRange(periodPreset),
        }))
      },
      applyCustomPeriod: (range) => {
        const error = validateControlDateRange(range)
        if (error) return error
        setSelection((current) => ({
          ...current,
          periodPreset: 'custom',
          ...range,
        }))
        return null
      },
    }),
    [orderedSites, sedeId, selection],
  )

  return (
    <AdminOperationalContext.Provider value={value}>
      {children}
    </AdminOperationalContext.Provider>
  )
}
