import { useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, LoaderCircle, Search, Save } from 'lucide-react'
import { getAdminGroupProducts } from '../../api'
import { getSologErrorMessageFromUnknown } from '../../errors'
import type { SologCatalogReference, SologGroupChangePayload, SologGroupProductSearchRow, SologGroupSummary } from '../../types'
import { AdminDialog } from '../AdminDialog'
import { formatAdminCurrency } from '../format'

export function ProductClassificationDialog({ initialProduct, initialGroup, reference, saving, onClose, onSave }: {
  initialProduct?: SologGroupProductSearchRow | null
  initialGroup?: SologGroupSummary | null
  reference: SologCatalogReference
  saving: boolean
  onClose: () => void
  onSave: (payload: SologGroupChangePayload) => Promise<boolean>
}) {
  const [selected, setSelected] = useState<SologGroupProductSearchRow | null>(initialProduct ?? null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SologGroupProductSearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState(selected?.estado ?? 'Agrupado')
  const [groupId, setGroupId] = useState(selected?.grupo_id ?? initialGroup?.id ?? '')
  const searchInProgress = useRef(false)

  const groups = useMemo(() => reference.grupos.filter((group) => group.activo !== false && (!selected || (group.categoria_id === selected.categoria_id && group.precio === selected.precio))), [reference.grupos, selected])

  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (searchInProgress.current) return
    if (query.trim().length < 2) { setError('Escribe al menos dos caracteres o un código interno.'); return }
    searchInProgress.current = true
    setSearching(true); setError(null)
    try {
      const response = await getAdminGroupProducts({ buscar: query.trim(), limit: 25, offset: 0 })
      setResults(response.rows)
    } catch (searchError) { setError(getSologErrorMessageFromUnknown(searchError)) }
    finally { searchInProgress.current = false; setSearching(false) }
  }

  const submit = async () => {
    if (!selected) return
    if (mode === 'Agrupado' && !groupId) { setError('Selecciona el grupo destino.'); return }
    const payload: SologGroupChangePayload = mode === 'Agrupado'
      ? { kind: 'classification', c_interno: selected.c_interno, estado: mode, grupo_conteo_id: groupId }
      : { kind: 'classification', c_interno: selected.c_interno, estado: mode, grupo_conteo_id: null }
    if (await onSave(payload)) onClose()
  }

  if (!selected) {
    return (
      <AdminDialog onClose={onClose} title="Buscar producto para reorganizar" wide>
        <form className="group-product-search" onSubmit={(event) => void search(event)}><label>Producto o C. interno<span><Search size={17} /><input autoFocus disabled={searching} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o código interno…" value={query} /></span></label><button className="button" disabled={searching} type="submit">{searching ? <LoaderCircle className="icon-spin" size={17} /> : <Search size={17} />}Buscar</button></form>
        {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
        {results.length ? <div className="group-product-results">{results.map((product) => <button key={product.c_interno} onClick={() => { setSelected(product); setMode(product.estado); setGroupId(product.grupo_id ?? '') }} type="button"><span><strong>{product.producto}</strong><small>C. interno {product.c_interno} · {product.categoria}</small></span><span>{product.estado}{product.propuesta ? ' · cambio futuro' : ''}</span></button>)}</div> : !searching ? <div className="empty-state">Busca bajo demanda; no se carga el catálogo completo.</div> : null}
      </AdminDialog>
    )
  }

  return (
    <AdminDialog closeDisabled={saving} footer={<><button className="button button--secondary" disabled={saving} onClick={() => initialProduct ? onClose() : setSelected(null)} type="button"><ArrowLeft size={17} />{initialProduct ? 'Cancelar' : 'Volver'}</button><button className="button" disabled={saving || (mode === 'Agrupado' && !groupId)} onClick={() => void submit()} type="button">{saving ? <LoaderCircle className="icon-spin" size={17} /> : <Save size={17} />}Guardar propuesta</button></>} onClose={onClose} title="Proponer clasificación">
      <div className="catalog-detail-hero"><strong>{selected.producto}</strong><span>C. interno {selected.c_interno} · {formatAdminCurrency(selected.precio)}</span></div>
      <div className="group-classification-current"><span>Actual</span><strong>{selected.estado}</strong><small>{selected.grupo ?? 'Sin grupo de conteo'} · {selected.categoria}</small></div>
      <div className="group-change-form"><label>Modalidad propuesta<select disabled={saving} onChange={(event) => { const next = event.target.value as typeof mode; setMode(next); if (next !== 'Agrupado') setGroupId('') }} value={mode}><option value="Único">Único — conteo individual</option><option value="Agrupado">Agrupado — grupo compatible</option><option value="Excluido">Excluido — fuera del conteo</option></select></label>{mode === 'Agrupado' ? <label>Grupo destino<select disabled={saving} onChange={(event) => setGroupId(event.target.value)} required value={groupId}><option value="">Seleccionar…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.nombre} · {formatAdminCurrency(group.precio)}</option>)}</select></label> : <p className="helper-text">{mode === 'Único' ? 'El backend resolverá el grupo unitario al publicar.' : 'El producto quedará sin grupo de conteo.'}</p>}{selected.propuesta ? <div className="notice">Este producto ya tiene una propuesta {selected.propuesta.estado}. Guardar actualizará la propuesta pendiente cuando el backend lo permita.</div> : null}{error ? <div className="notice notice--error" role="alert">{error}</div> : null}</div>
    </AdminDialog>
  )
}
