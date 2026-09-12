import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { useMasterData, useMasterDataStore } from '../masterdata/admin.masterdata.context'
import { QueryState } from '../admin.v2.presentation'

function categoryErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'SOLOG_MASTERDATA_REVISION_CONFLICT') return 'Las categorías cambiaron. Se recargó la fuente autoritativa; revisa antes de volver a confirmar.'
  if (code === 'SOLOG_LOCK_CONFLICT_RETRYABLE') return 'Otro cambio está en curso. Puedes reintentar la misma operación.'
  if (code.includes('NOOP')) return 'La operación no produjo cambios.'
  return error instanceof Error ? error.message : 'No se pudo actualizar Categorías.'
}

export function AdminCategoriesDialog({ onClose }: { onClose: () => void }) {
  const masterData = useMasterData()
  const store = useMasterDataStore()
  const [createName, setCreateName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [orderDraft, setOrderDraft] = useState<{ revision: number; ids: string[] } | null>(null)
  const [error, setError] = useState('')
  const categoryRevision = masterData.snapshot?.revisions.categories ?? -1
  const authoritativeOrder = masterData.snapshot?.categories.map(category => category.id) ?? []
  const order = orderDraft?.revision === categoryRevision ? orderDraft.ids : authoritativeOrder
  const categories = useMemo(() => {
    if (!masterData.snapshot) return []
    const byId = new Map(masterData.snapshot.categories.map(category => [category.id, category]))
    return order.map(id => byId.get(id)).filter((category): category is NonNullable<typeof category> => !!category)
  }, [masterData.snapshot, order])
  const intent = store.intent()
  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!createName.trim()) return
    try { setError(''); await store.mutation('category_create', { nombre: createName.trim() }); setCreateName('') } catch (reason) { setError(categoryErrorMessage(reason)) }
  }
  const rename = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing || !editName.trim()) return
    try { setError(''); await store.mutation('category_rename', { category_id: editing, nombre: editName.trim() }); setEditing(null); setEditName('') } catch (reason) { setError(categoryErrorMessage(reason)) }
  }
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrderDraft({ revision: categoryRevision, ids: next })
  }
  const saveOrder = async () => {
    try { setError(''); await store.mutation('category_reorder', { category_ids: order }); setOrderDraft(null) } catch (reason) { setError(categoryErrorMessage(reason)) }
  }
  const retry = () => {
    const action = store.intent()?.action
    setError('')
    void store.retryMutation().then(() => {
      if (action === 'category_create') setCreateName('')
      if (action === 'category_rename') { setEditing(null); setEditName('') }
      if (action === 'category_reorder') setOrderDraft(null)
    }).catch(reason => setError(categoryErrorMessage(reason)))
  }
  const hasCurrentOrderDraft = orderDraft?.revision === categoryRevision
  return <AdminDialog title="Administrar categorías" description="Crea, renombra y define el orden operativo de las categorías." onClose={onClose} closeDisabled={!!intent?.pending} wide>
    {!masterData.snapshot || !masterData.derived ? <QueryState error={masterData.error} retry={masterData.retry} /> : <>
      <form className="admin-v2-form admin-categories__create" onSubmit={event => void create(event)}><label>Nueva categoría<input value={createName} onChange={event => setCreateName(event.target.value)} /></label><button className="button" disabled={!!intent || !createName.trim()}><Plus size={16} aria-hidden="true" />Crear categoría</button></form>
      <div className="admin-categories__list" role="list" aria-label="Orden de categorías">{categories.map((category, index) => {
        const counts = masterData.derived!.categoryCounts.get(category.id) ?? { groups: 0, products: 0 }
        return <div className="admin-categories__row" role="listitem" key={category.id}><span><strong>{category.nombre}</strong><small>{counts.groups} grupos · {counts.products} productos</small></span><div className="admin-groups__actions"><button type="button" className="button button--secondary" aria-label={`Subir ${category.nombre}`} disabled={!!intent || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button type="button" className="button button--secondary" aria-label={`Bajar ${category.nombre}`} disabled={!!intent || index === categories.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button><button type="button" className="button button--secondary" onClick={() => { setEditing(category.id); setEditName(category.nombre) }}><Pencil size={15} aria-hidden="true" />Renombrar</button></div></div>
      })}</div>
      <button type="button" className="button button--secondary" disabled={!!intent || !hasCurrentOrderDraft || order.length !== masterData.snapshot.categories.length} onClick={() => void saveOrder()}>Guardar orden completo</button>
      {editing && <form className="admin-v2-form admin-categories__rename" onSubmit={event => void rename(event)}><label>Nuevo nombre<input autoFocus value={editName} onChange={event => setEditName(event.target.value)} /></label><div className="admin-groups__actions"><button className="button" disabled={!!intent || !editName.trim()}>Guardar nombre</button><button type="button" className="button button--secondary" onClick={() => setEditing(null)}>Cancelar</button></div></form>}
    </>}
    {error && <div className="notice notice--error" role="alert"><p>{error}</p>{intent && !intent.pending && <button type="button" className="button button--secondary" onClick={retry}>Reintentar misma operación</button>}</div>}
  </AdminDialog>
}
