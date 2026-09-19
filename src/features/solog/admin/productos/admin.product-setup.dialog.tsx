import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { CatalogMutationNotice } from '../catalogo/admin.catalogo.feedback'
import { catalogMutationError } from '../catalogo/admin.catalogo.feedback.utils'
import { useCatalogStore } from '../catalogo/admin.catalogo.context'
import { useMasterData } from '../masterdata/admin.masterdata.context'
import type { MasterDataSetupRequired } from '../masterdata/admin.masterdata.v1'
import { QueryState } from '../admin.v2.presentation'

export type ProductSetupTarget = Pick<MasterDataSetupRequired, 'propuesta_fingerprint' | 'c_interno' | 'producto' | 'precio' | 'tipo'>

export function ProductSetupDialog({ target, onClose, onComplete }: { target: ProductSetupTarget; onClose: () => void; onComplete: () => void }) {
  const store = useCatalogStore()
  const masterData = useMasterData()
  const [mode, setMode] = useState<'existing_group' | 'new_unit'>('existing_group')
  const [groupId, setGroupId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brand, setBrand] = useState('')
  const [error, setError] = useState('')
  const intent = store.intent()
  const submit = () => {
    if (!masterData.snapshot) return
    setError('')
    const payload = mode === 'existing_group'
      ? { propuesta_fingerprint: target.propuesta_fingerprint, mode: 'existing_group' as const, grupo_id: groupId, marca: brand.trim() || null }
      : { propuesta_fingerprint: target.propuesta_fingerprint, mode: 'new_unit' as const, categoria_id: categoryId, marca: brand.trim() || null }
    void store.mutation('prepare_product', payload)
      .then(onComplete)
      .catch((reason: unknown) => setError(catalogMutationError(store, reason, 'No se pudo preparar el producto.')))
  }
  const retry = () => {
    setError('')
    void store.retryMutation()
      .then(onComplete)
      .catch((reason: unknown) => setError(catalogMutationError(store, reason, 'No se pudo confirmar la configuración.')))
  }
  const valid = !!masterData.snapshot && (mode === 'existing_group' ? !!groupId : !!categoryId)
  return <AdminDialog title="Configurar producto" description={`${target.producto} · C. interno ${target.c_interno}`} onClose={onClose} closeDisabled={!!intent?.pending} footer={<><button type="button" className="button button--secondary" disabled={!!intent} onClick={onClose}>Cancelar</button><button type="button" className="button" disabled={!!intent || !valid} onClick={submit}><Plus size={16} aria-hidden="true" />{target.tipo === 'reincorporar_producto' ? 'Preparar reincorporación' : 'Preparar producto'}</button></>}>
    <p>La configuración queda en staging y no modifica el catálogo ni los grupos hasta la publicación.</p>
    {!masterData.snapshot ? <QueryState error={masterData.error} retry={masterData.retry} variant="compact" /> : <form className="admin-v2-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <label>Marca opcional<input value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
      <label>Destino<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="existing_group">Grupo existente</option><option value="new_unit">Nuevo grupo unitario</option></select></label>
      {mode === 'existing_group'
        ? <label>Grupo<select required value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Seleccionar</option>{masterData.snapshot.groups.map((group) => <option key={group.id} value={group.id}>{group.nombre} · {group.precio}</option>)}</select></label>
        : <label>Categoría<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Seleccionar</option>{masterData.snapshot.categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>}
    </form>}
    {intent && <CatalogMutationNotice onRetry={retry} />}
    {error && <p role="alert">{error}</p>}
  </AdminDialog>
}
