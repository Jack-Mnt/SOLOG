import type { FormEvent } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import {
  getSologCatalogChangeSectionLabel,
  getSologCatalogChangeStatusLabel,
  getSologCatalogChangeTypeLabel,
} from '../../labels'
import type {
  SologCatalogChangeSection,
  SologCatalogChangeStatus,
  SologCatalogChangeType,
} from '../../types'
import type { CatalogDraftFilters } from './useCatalogChanges'

const SECTIONS: SologCatalogChangeSection[] = ['urgente', 'pendiente']
const TYPES: SologCatalogChangeType[] = ['agregar_producto', 'eliminar_producto', 'nombre', 'precio', 'codigo']
const STATUSES: SologCatalogChangeStatus[] = ['pendiente', 'aprobado', 'ignorado', 'incorporado']

export function CatalogFilters({
  filters,
  loading,
  onUpdate,
  onApply,
  onReset,
}: {
  filters: CatalogDraftFilters
  loading: boolean
  onUpdate: (updates: Partial<CatalogDraftFilters>) => void
  onApply: () => void
  onReset: () => void
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onApply()
  }

  return (
    <form className="admin-module-filters admin-module-filters--catalog" onSubmit={handleSubmit}>
      <label>
        Sección
        <select disabled={loading} onChange={(event) => onUpdate({ seccion: event.target.value as CatalogDraftFilters['seccion'] })} value={filters.seccion}>
          <option value="">Todas las secciones</option>
          {SECTIONS.map((section) => <option key={section} value={section}>{getSologCatalogChangeSectionLabel(section)}</option>)}
        </select>
      </label>
      <label>
        Tipo
        <select disabled={loading} onChange={(event) => onUpdate({ tipo: event.target.value as CatalogDraftFilters['tipo'] })} value={filters.tipo}>
          <option value="">Todos los tipos</option>
          {TYPES.map((type) => <option key={type} value={type}>{getSologCatalogChangeTypeLabel(type)}</option>)}
        </select>
      </label>
      <label>
        Estado
        <select disabled={loading} onChange={(event) => onUpdate({ estado: event.target.value as CatalogDraftFilters['estado'] })} value={filters.estado}>
          <option value="">Todos los estados</option>
          {STATUSES.map((status) => <option key={status} value={status}>{getSologCatalogChangeStatusLabel(status)}</option>)}
        </select>
      </label>
      <label>
        C. interno
        <input disabled={loading} inputMode="numeric" min="1" onChange={(event) => onUpdate({ internalCode: event.target.value })} placeholder="20285" step="1" type="number" value={filters.internalCode} />
      </label>
      <label>
        Producto
        <input disabled={loading} onChange={(event) => onUpdate({ producto: event.target.value })} placeholder="Buscar producto" type="search" value={filters.producto} />
      </label>
      <div className="admin-report-filter-actions">
        <button className="button" disabled={loading} type="submit"><Filter size={17} /> Aplicar</button>
        <button className="button button--secondary" disabled={loading} onClick={onReset} type="button"><RotateCcw size={17} /> Limpiar filtros</button>
      </div>
    </form>
  )
}
