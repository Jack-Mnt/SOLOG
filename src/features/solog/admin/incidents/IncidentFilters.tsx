import type { FormEvent } from 'react'
import { CalendarDays, Filter, RotateCcw, Search } from 'lucide-react'
import { getSologAdminIncidentTypeLabel } from '../../labels'
import type { SologAdminIncidentType } from '../../types'
import type { IncidentDateRange, IncidentPeriodPreset } from './incident-period'
import type { AdminIncidentDraftFilters } from './useAdminIncidents'

const INCIDENT_TYPES: SologAdminIncidentType[] = [
  'producto_ausente',
  'codigo_interno_invalido',
  'codigo_interno_duplicado',
  'stock_invalido',
]

const PERIOD_OPTIONS: Array<[IncidentPeriodPreset, string]> = [
  ['today', 'Hoy'],
  ['last_week', 'Última semana'],
  ['current_fortnight', 'Quincena actual'],
  ['previous_fortnight', 'Quincena pasada'],
  ['custom', 'Personalizado'],
]

export function IncidentFilters({
  filters,
  period,
  customRange,
  loading,
  onUpdate,
  onSelectPeriod,
  onCustomRangeChange,
  onApplyCustomRange,
  onApply,
  onReset,
}: {
  filters: AdminIncidentDraftFilters
  period: IncidentPeriodPreset
  customRange: IncidentDateRange
  loading: boolean
  onUpdate: (updates: Partial<AdminIncidentDraftFilters>) => void
  onSelectPeriod: (period: IncidentPeriodPreset) => void
  onCustomRangeChange: (range: IncidentDateRange) => void
  onApplyCustomRange: () => void
  onApply: () => void
  onReset: () => void
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onApply()
  }

  return (
    <>
      <form className="incidents-filters" onSubmit={handleSubmit}>
        <label>
          Tipo
          <select disabled={loading} onChange={(event) => onUpdate({ tipo: event.target.value as AdminIncidentDraftFilters['tipo'] })} value={filters.tipo}>
            <option value="">Todos los tipos</option>
            {INCIDENT_TYPES.map((type) => <option key={type} value={type}>{getSologAdminIncidentTypeLabel(type)}</option>)}
          </select>
        </label>
        <label>
          <span className="incidents-filter-label"><CalendarDays size={14} /> Período</span>
          <select disabled={loading} onChange={(event) => onSelectPeriod(event.target.value as IncidentPeriodPreset)} value={period}>
            {PERIOD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="incidents-search">
          Buscar
          <span className="incidents-search__control">
            <Search aria-hidden="true" size={16} />
            <input disabled={loading} onChange={(event) => onUpdate({ search: event.target.value })} placeholder="Buscar producto o código interno..." type="search" value={filters.search} />
          </span>
        </label>
        <div className="admin-report-filter-actions incidents-filter-actions">
          <button className="button" disabled={loading} type="submit"><Filter size={17} /> Aplicar</button>
          <button className="button button--secondary" disabled={loading} onClick={onReset} type="button"><RotateCcw size={17} /> Limpiar</button>
        </div>
      </form>

      {period === 'custom' ? (
        <div className="incidents-custom-period">
          <label>Desde<input disabled={loading} onChange={(event) => onCustomRangeChange({ ...customRange, desde: event.target.value })} type="date" value={customRange.desde} /></label>
          <label>Hasta<input disabled={loading} onChange={(event) => onCustomRangeChange({ ...customRange, hasta: event.target.value })} type="date" value={customRange.hasta} /></label>
          <button className="button button--secondary" disabled={loading} onClick={onApplyCustomRange} type="button">Aplicar período</button>
        </div>
      ) : null}
    </>
  )
}
