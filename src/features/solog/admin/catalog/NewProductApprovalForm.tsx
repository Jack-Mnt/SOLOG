import { ArrowLeft, Check, RefreshCw } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type {
  SologCatalogChangeRow,
  SologCatalogNewProductConfig,
  SologCatalogReference,
} from '../../types'
import { AdminDialog } from '../AdminDialog'
import { formatAdminCurrency } from '../format'
import {
  getCatalogDetectedBarcode,
  getCatalogDetectedProduct,
  getCatalogDetectedStock,
  getCatalogProposedPrice,
} from '../catalog-domain'

type ProductMode = '' | 'Único' | 'Agrupado' | 'Excluido'

export function NewProductApprovalForm({
  change,
  reference,
  referenceStatus,
  referenceError,
  submitting,
  onClose,
  onLoadReference,
  onSubmit,
}: {
  change: SologCatalogChangeRow
  reference: SologCatalogReference | null
  referenceStatus: 'idle' | 'loading' | 'ready' | 'error'
  referenceError: string | null
  submitting: boolean
  onClose: () => void
  onLoadReference: () => void
  onSubmit: (config: SologCatalogNewProductConfig) => void
}) {
  const [marca, setMarca] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [mode, setMode] = useState<ProductMode>('')
  const [groupId, setGroupId] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const proposedPrice = getCatalogProposedPrice(change)
  const category = reference?.categorias.find((item) => item.id === categoriaId)
  const selectedGroup = reference?.grupos.find((item) => item.id === groupId)
  const compatibleGroups = useMemo(
    () => reference?.grupos.filter(
      (group) =>
        group.categoria_id === categoriaId &&
        proposedPrice !== null &&
        group.precio === proposedPrice &&
        group.activo !== false,
    ) ?? [],
    [categoriaId, proposedPrice, reference],
  )

  const createConfig = (): SologCatalogNewProductConfig | null => {
    const normalizedBrand = marca.trim()
    if (!normalizedBrand || !categoriaId || !mode) return null
    if (mode === 'Agrupado') {
      if (!groupId) return null
      return {
        marca: normalizedBrand,
        categoria_id: categoriaId,
        estado: 'Agrupado',
        grupo_conteo_id: groupId,
      }
    }
    return {
      marca: normalizedBrand,
      categoria_id: categoriaId,
      estado: mode,
      grupo_conteo_id: null,
    }
  }

  const handleReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError(null)
    const config = createConfig()
    if (!config) {
      setValidationError(
        mode === 'Agrupado'
          ? 'Selecciona un grupo compatible para la modalidad Agrupado.'
          : 'Completa marca, categoría y modalidad.',
      )
      return
    }
    setReviewing(true)
  }

  if (!reference) {
    return (
      <AdminDialog onClose={onClose} title="Configurar producto nuevo">
        {referenceStatus === 'loading' || referenceStatus === 'idle' ? <div className="empty-state" role="status">Cargando categorías y grupos…</div> : null}
        {referenceError ? <div className="notice notice--error" role="alert"><strong>No se pudieron cargar las referencias</strong><p>{referenceError}</p></div> : null}
        {referenceStatus === 'error' ? <button className="button" onClick={onLoadReference} type="button"><RefreshCw size={17} /> Reintentar</button> : null}
      </AdminDialog>
    )
  }

  if (reviewing) {
    const config = createConfig()
    if (!config) return null
    return (
      <AdminDialog
        footer={(
          <>
            <button className="button button--secondary" disabled={submitting} onClick={() => setReviewing(false)} type="button"><ArrowLeft size={17} /> Volver</button>
            <button className="button" disabled={submitting} onClick={() => onSubmit(config)} type="button"><Check size={17} /> {submitting ? 'Aprobando…' : 'Confirmar aprobación'}</button>
          </>
        )}
        onClose={onClose}
        title="Revisar aprobación"
      >
        <p className="catalog-detail-message">Este producto quedará aprobado para la próxima versión; todavía no modifica el catálogo actual.</p>
        <dl className="catalog-context-list">
          <div><dt>C. interno</dt><dd>{change.c_interno}</dd></div>
          <div><dt>Producto</dt><dd>{getCatalogDetectedProduct(change) ?? 'No disponible'}</dd></div>
          <div><dt>Marca</dt><dd>{config.marca}</dd></div>
          <div><dt>Categoría</dt><dd>{category?.nombre ?? 'No disponible'}</dd></div>
          <div><dt>Modalidad</dt><dd>{config.estado}</dd></div>
          <div><dt>Grupo</dt><dd>{selectedGroup?.nombre ?? 'No aplica'}</dd></div>
        </dl>
      </AdminDialog>
    )
  }

  return (
    <AdminDialog className="catalog-new-product-dialog" onClose={onClose} title="Agregar producto" wide>
      <p className="catalog-detail-message">Producto no presente en el catálogo actual.</p>
      <div className="catalog-detail-hero catalog-detail-hero--new">
        <span className="eyebrow">Nuevo producto</span>
        <strong>{getCatalogDetectedProduct(change) ?? 'Producto no identificado'}</strong>
        <span>C. interno {change.c_interno}</span>
      </div>
      <div className="catalog-new-product-summary">
        <span>{proposedPrice === null ? 'Precio no disponible' : formatAdminCurrency(proposedPrice)}</span>
        <span>C. barras {getCatalogDetectedBarcode(change) ?? 'Sin código'}</span>
      </div>

      <div className="catalog-classification-heading">
        <h3>Clasificación requerida</h3>
        <p>Completa estos datos antes de aprobar el producto para la próxima versión.</p>
      </div>
      <form className="admin-new-product-form" onSubmit={handleReview}>
        <label>
          Marca
          <input autoFocus disabled={submitting} onChange={(event) => setMarca(event.target.value)} required value={marca} />
        </label>
        <label>
          Categoría
          <select disabled={submitting} onChange={(event) => { setCategoriaId(event.target.value); setGroupId('') }} required value={categoriaId}>
            <option value="">Seleccionar categoría</option>
            {reference.categorias.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
          </select>
        </label>
        <label>
          Modalidad
          <select disabled={submitting} onChange={(event) => { const nextMode = event.target.value as ProductMode; setMode(nextMode); if (nextMode !== 'Agrupado') setGroupId('') }} required value={mode}>
            <option value="">Seleccionar modalidad</option>
            <option value="Único">Único</option>
            <option value="Agrupado">Agrupado</option>
            <option value="Excluido">Excluido</option>
          </select>
        </label>
        {mode === 'Agrupado' ? (
          <label>
            Grupo
            <select disabled={submitting || compatibleGroups.length === 0} onChange={(event) => setGroupId(event.target.value)} required value={groupId}>
              <option value="">Seleccionar grupo</option>
              {compatibleGroups.map((group) => <option key={group.id} value={group.id}>{group.nombre} · {formatAdminCurrency(group.precio)}</option>)}
            </select>
            {categoriaId && compatibleGroups.length === 0 ? <small>No hay grupos compatibles con esta categoría y precio.</small> : null}
          </label>
        ) : null}
        {validationError ? <div className="notice notice--error" role="alert">{validationError}</div> : null}
        <div className="admin-report-filter-actions">
          <button className="button" disabled={submitting || (mode === 'Agrupado' && compatibleGroups.length === 0)} type="submit">Revisar aprobación</button>
        </div>
      </form>

      <details className="catalog-technical-details">
        <summary>Detalles técnicos</summary>
        <dl><div><dt>Stock detectado</dt><dd>{getCatalogDetectedStock(change) ?? 'No disponible'}</dd></div></dl>
      </details>
    </AdminDialog>
  )
}
