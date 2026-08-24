import type { FormEvent } from 'react'
import { Filter, RotateCcw, Search } from 'lucide-react'
import { getSologAdminIncidentTypeLabel } from '../../labels'
import type { SologAdminIncidentType } from '../../types'
import type { AdminIncidentDraftFilters } from './useAdminIncidents'

const INCIDENT_TYPES: SologAdminIncidentType[] = [
  'producto_ausente',
  'codigo_interno_invalido',
  'codigo_interno_duplicado',
  'stock_invalido',
]

export function IncidentFilters({
  filters,
  loading,
  onUpdate,
  onApply,
  onReset,
}: {
  filters: AdminIncidentDraftFilters
  loading: boolean
  onUpdate: (updates: Partial<AdminIncidentDraftFilters>) => void
  onApply: () => void
  onReset: () => void
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onApply()
  }

  return (
    <form className="incidents-filters" onSubmit={handleSubmit}>
        <label>
          Tipo
          <select disabled={loading} onChange={(event) => onUpdate({ tipo: event.target.value as AdminIncidentDraftFilters['tipo'] })} value={filters.tipo}>
            <option value="">Todos los tipos</option>
            {INCIDENT_TYPES.map((type) => <option key={type} value={type}>{getSologAdminIncidentTypeLabel(type)}</option>)}
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
  )
}
