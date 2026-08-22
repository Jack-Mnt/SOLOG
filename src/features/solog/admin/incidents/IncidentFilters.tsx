import type { FormEvent } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import {
  getSologAdminIncidentStatusLabel,
  getSologAdminIncidentTypeLabel,
} from '../../labels'
import type { SologAdminIncidentType, SologAdminSite } from '../../types'
import type { AdminIncidentDraftFilters } from './useAdminIncidents'

const INCIDENT_TYPES: SologAdminIncidentType[] = [
  'producto_ausente',
  'codigo_interno_invalido',
  'codigo_interno_duplicado',
  'stock_invalido',
]

const INCIDENT_STATES = ['pendiente', 'revisada', 'suprimida', 'eliminada']

export function IncidentFilters({
  filters,
  sites,
  loading,
  onUpdate,
  onApply,
  onReset,
}: {
  filters: AdminIncidentDraftFilters
  sites: SologAdminSite[]
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
    <form className="admin-module-filters" onSubmit={handleSubmit}>
      <label>
        Sede
        <select disabled={loading} onChange={(event) => onUpdate({ sedeId: event.target.value })} value={filters.sedeId}>
          <option value="">Todas las sedes</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.nombre}</option>)}
        </select>
      </label>
      <label>
        Tipo
        <select disabled={loading} onChange={(event) => onUpdate({ tipo: event.target.value as AdminIncidentDraftFilters['tipo'] })} value={filters.tipo}>
          <option value="">Todos los tipos</option>
          {INCIDENT_TYPES.map((type) => <option key={type} value={type}>{getSologAdminIncidentTypeLabel(type)}</option>)}
        </select>
      </label>
      <label>
        Estado
        <select disabled={loading} onChange={(event) => onUpdate({ estado: event.target.value })} value={filters.estado}>
          <option value="">Todos los estados</option>
          {INCIDENT_STATES.map((state) => <option key={state} value={state}>{getSologAdminIncidentStatusLabel(state)}</option>)}
        </select>
      </label>
      <label>
        C. interno
        <input disabled={loading} inputMode="numeric" min="1" onChange={(event) => onUpdate({ internalCode: event.target.value })} placeholder="20111" step="1" type="number" value={filters.internalCode} />
      </label>
      <label>
        Producto
        <input disabled={loading} onChange={(event) => onUpdate({ producto: event.target.value })} placeholder="Buscar producto" type="search" value={filters.producto} />
      </label>
      <label>
        Fecha desde
        <input disabled={loading} onChange={(event) => onUpdate({ desde: event.target.value })} type="date" value={filters.desde} />
      </label>
      <label>
        Fecha hasta
        <input disabled={loading} onChange={(event) => onUpdate({ hasta: event.target.value })} type="date" value={filters.hasta} />
      </label>
      <div className="admin-report-filter-actions">
        <button className="button" disabled={loading} type="submit"><Filter size={17} /> Aplicar</button>
        <button className="button button--secondary" disabled={loading} onClick={onReset} type="button"><RotateCcw size={17} /> Limpiar filtros</button>
      </div>
    </form>
  )
}
