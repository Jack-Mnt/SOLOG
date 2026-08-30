import { CalendarDays, MapPin } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { usePathname } from '../../../lib/router'
import {
  getAdminSiteDisplayName,
  useAdminOperationalContext,
} from './admin.operational.context'
import type {
  ControlDateRange,
  ControlPeriodPreset,
} from './control/control-period'

const PERIOD_OPTIONS: Array<[ControlPeriodPreset, string]> = [
  ['today', 'Hoy'],
  ['last_week', 'Última semana'],
  ['current_fortnight', 'Quincena actual'],
  ['previous_fortnight', 'Quincena pasada'],
  ['custom', 'Personalizado'],
]

function formatCompactDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}` : value
}

export function AdminOperationalHeader() {
  const pathname = usePathname()
  const operational = useAdminOperationalContext()
  const periodLabelId = useId()
  const popoverRef = useRef<HTMLDivElement>(null)
  const firstDateRef = useRef<HTMLInputElement>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState<ControlDateRange>({
    dateFrom: operational.dateFrom,
    dateTo: operational.dateTo,
  })
  const [customError, setCustomError] = useState<string | null>(null)
  const isOperational =
    pathname === '/admin/control' || pathname === '/admin/incidencias'

  const openCustomPeriod = () => {
    setCustomDraft({
      dateFrom: operational.dateFrom,
      dateTo: operational.dateTo,
    })
    setCustomError(null)
    setCustomOpen(true)
  }

  useEffect(() => {
    if (!customOpen) return
    firstDateRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCustomOpen(false)
    }
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !popoverRef.current?.contains(event.target)
      ) {
        setCustomOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeOutside)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeOutside)
    }
  }, [customOpen])

  const selectPeriod = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as ControlPeriodPreset
    if (next === 'custom') {
      openCustomPeriod()
      return
    }
    setCustomOpen(false)
    operational.setPeriodPreset(next)
  }

  const applyCustom = () => {
    const error = operational.applyCustomPeriod(customDraft)
    setCustomError(error)
    if (!error) setCustomOpen(false)
  }

  if (!isOperational) {
    return (
      <header className="admin-header admin-header--global">
        <div className="admin-header__global-context">
          <MapPin aria-hidden="true" size={17} />
          <strong>Puerto Rico</strong>
        </div>
      </header>
    )
  }

  return (
    <header className="admin-header admin-header--operational">
      <div
        aria-label="Sede operativa"
        className="admin-header__sites"
        role="group"
      >
        {operational.sites.map((site) => (
          <button
            aria-pressed={operational.sedeId === site.id}
            className={operational.sedeId === site.id ? 'is-active' : undefined}
            key={site.id}
            onClick={() => operational.setSedeId(site.id)}
            type="button"
          >
            {getAdminSiteDisplayName(site)}
          </button>
        ))}
      </div>

      <div className="admin-header__period" ref={popoverRef}>
        <label htmlFor={periodLabelId}>
          <CalendarDays aria-hidden="true" size={15} />
          Período
        </label>
        <select
          id={periodLabelId}
          onChange={selectPeriod}
          value={operational.periodPreset}
        >
          {PERIOD_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {value === 'custom' && operational.periodPreset === 'custom'
                ? `${formatCompactDate(operational.dateFrom)} – ${formatCompactDate(operational.dateTo)}`
                : label}
            </option>
          ))}
        </select>
        {operational.periodPreset === 'custom' ? (
          <button
            className="admin-header__edit-period"
            onClick={openCustomPeriod}
            type="button"
          >
            Editar rango
          </button>
        ) : null}

        {customOpen ? (
          <div
            aria-label="Período personalizado"
            className="admin-header__period-popover"
            role="dialog"
          >
            <label>
              Desde
              <input
                onChange={(event) =>
                  setCustomDraft((current) => ({
                    ...current,
                    dateFrom: event.target.value,
                  }))
                }
                ref={firstDateRef}
                type="date"
                value={customDraft.dateFrom}
              />
            </label>
            <label>
              Hasta
              <input
                onChange={(event) =>
                  setCustomDraft((current) => ({
                    ...current,
                    dateTo: event.target.value,
                  }))
                }
                type="date"
                value={customDraft.dateTo}
              />
            </label>
            {customError ? (
              <p className="admin-header__period-error" role="alert">
                {customError}
              </p>
            ) : null}
            <div>
              <button
                className="button button--secondary"
                onClick={() => setCustomOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button className="button" onClick={applyCustom} type="button">
                Aplicar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}
