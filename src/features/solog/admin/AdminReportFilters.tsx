import type { FormEvent } from 'react'
import { getSologDifferenceStateLabel } from '../labels'
import type { SologAdminReportType, SologAdminSite } from '../types'
import type { AdminReportDraftFilters } from './useAdminReports'

const COUNT_STATES = [
  ['activo', 'Activo'],
  ['parcial', 'Parcial'],
  ['completado', 'Completado'],
  ['expirado', 'Expirado'],
] as const

const DIFFERENCE_STATES = [
  'pendiente',
  'probablemente_explicada',
  'parcialmente_explicada',
  'persistente',
  'confirmada_reconteo',
  'conteos_inconsistentes',
] as const

const HISTORY_STATES = [
  'coincide',
  ...DIFFERENCE_STATES,
] as const

const POS_ADJUSTMENT_STATES = [
  'parcialmente_explicada',
  'persistente',
  'confirmada_reconteo',
  'conteos_inconsistentes',
] as const

export function AdminReportFilters({
  reportType,
  filters,
  sites,
  loading,
  onUpdate,
  onApply,
  onReset,
}: {
  reportType: SologAdminReportType
  filters: AdminReportDraftFilters
  sites: SologAdminSite[]
  loading: boolean
  onUpdate: (updates: Partial<AdminReportDraftFilters>) => void
  onApply: () => void
  onReset: () => void
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onApply()
  }

  return (
    <form className="admin-report-filters" onSubmit={handleSubmit}>
      <label>
        Desde
        <input
          disabled={loading}
          onChange={(event) => onUpdate({ dateFrom: event.target.value })}
          required
          type="date"
          value={filters.dateFrom}
        />
      </label>
      <label>
        Hasta
        <input
          disabled={loading}
          onChange={(event) => onUpdate({ dateTo: event.target.value })}
          required
          type="date"
          value={filters.dateTo}
        />
      </label>
      <label>
        Sede
        <select
          disabled={loading}
          onChange={(event) => onUpdate({ sedeId: event.target.value })}
          value={filters.sedeId}
        >
          <option value="">Todas las sedes</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.nombre}
            </option>
          ))}
        </select>
      </label>

      {reportType === 'counts' ? (
        <label>
          Estado
          <select
            disabled={loading}
            onChange={(event) =>
              onUpdate({
                countState: event.target
                  .value as AdminReportDraftFilters['countState'],
              })
            }
            value={filters.countState}
          >
            <option value="">Todos</option>
            {COUNT_STATES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {reportType === 'differences' ? (
        <label>
          Estado
          <select
            disabled={loading}
            onChange={(event) =>
              onUpdate({
                differenceState: event.target
                  .value as AdminReportDraftFilters['differenceState'],
              })
            }
            value={filters.differenceState}
          >
            <option value="">Todos los estados</option>
            {DIFFERENCE_STATES.map((value) => (
              <option key={value} value={value}>
                {getSologDifferenceStateLabel(value)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {reportType === 'history' ? (
        <label>
          Estado
          <select
            disabled={loading}
            onChange={(event) =>
              onUpdate({
                historyState: event.target
                  .value as AdminReportDraftFilters['historyState'],
              })
            }
            value={filters.historyState}
          >
            <option value="">Todos</option>
            {HISTORY_STATES.map((value) => (
              <option key={value} value={value}>
                {getSologDifferenceStateLabel(value)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {reportType === 'pos_adjustments' ? (
        <label>
          Estado
          <select
            disabled={loading}
            onChange={(event) =>
              onUpdate({
                posAdjustmentState: event.target
                  .value as AdminReportDraftFilters['posAdjustmentState'],
              })
            }
            value={filters.posAdjustmentState}
          >
            <option value="">Todos los estados válidos</option>
            {POS_ADJUSTMENT_STATES.map((value) => (
              <option key={value} value={value}>
                {getSologDifferenceStateLabel(value)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {reportType === 'history' || reportType === 'pos_adjustments' ? (
        <label>
          Código interno
          <input
            autoComplete="off"
            disabled={loading}
            inputMode="numeric"
            onChange={(event) => onUpdate({ internalCode: event.target.value })}
            placeholder="Ej. 20211"
            type="text"
            value={filters.internalCode}
          />
        </label>
      ) : null}

      <div className="admin-report-filter-actions">
        <button className="button" disabled={loading} type="submit">
          {loading ? 'Consultando…' : 'Aplicar'}
        </button>
        <button
          className="button button--secondary"
          disabled={loading}
          onClick={onReset}
          type="button"
        >
          Restablecer
        </button>
      </div>
    </form>
  )
}
