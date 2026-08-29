import { useState, type FormEvent } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
import type { SologCatalogReference, SologGroupChangePayload, SologGroupSummary } from '../../types'
import { AdminDialog } from '../AdminDialog'
import { formatAdminCurrency } from '../format'

export function GroupDefinitionDialog({ group, reference, saving, onClose, onSave }: {
  group: SologGroupSummary | null
  reference: SologCatalogReference
  saving: boolean
  onClose: () => void
  onSave: (payload: SologGroupChangePayload) => Promise<boolean>
}) {
  const [nombre, setNombre] = useState(group?.nombre ?? '')
  const [categoriaId, setCategoriaId] = useState(group?.categoria_id ?? '')
  const [precio, setPrecio] = useState(group ? String(group.precio) : '')
  const [validation, setValidation] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const numericPrice = Number(precio)
    if (!nombre.trim() || !categoriaId || precio.trim() === '' || !Number.isFinite(numericPrice) || numericPrice < 0) {
      setValidation('Completa nombre, categoría y un precio válido mayor o igual a cero.')
      return
    }
    setValidation(null)
    const completed = await onSave({
      kind: 'definition',
      ...(group ? { grupo_id: group.id } : {}),
      nombre: nombre.trim(),
      categoria_id: categoriaId,
      precio: numericPrice,
    })
    if (completed) onClose()
  }

  return (
    <AdminDialog closeDisabled={saving} onClose={onClose} title={group ? 'Editar grupo' : 'Nuevo grupo'}>
      {group ? <div className="group-current-definition"><span>Estado actual</span><strong>{group.nombre}</strong><small>{group.categoria} · {formatAdminCurrency(group.precio)}</small></div> : null}
      <form className="group-change-form" id="group-definition-form" onSubmit={(event) => void submit(event)}>
        <label>Nombre<input disabled={saving} onChange={(event) => setNombre(event.target.value)} required value={nombre} /></label>
        <label>Categoría<select disabled={saving} onChange={(event) => setCategoriaId(event.target.value)} required value={categoriaId}><option value="">Seleccionar…</option>{reference.categorias.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
        <label>{group ? 'Precio de referencia' : 'Precio de compatibilidad'}<input disabled={saving || Boolean(group)} min="0" onChange={(event) => setPrecio(event.target.value)} required step="0.01" type="number" value={precio} /></label>
        {group ? <p className="helper-text">El precio pertenece al catálogo del producto y no se modifica desde Grupos.</p> : null}
        {validation ? <div className="notice notice--error" role="alert">{validation}</div> : null}
        <div className="admin-report-filter-actions"><button className="button button--secondary" disabled={saving} onClick={onClose} type="button">Cancelar</button><button className="button" disabled={saving} type="submit">{saving ? <LoaderCircle className="icon-spin" size={17} /> : <Save size={17} />}{saving ? 'Guardando…' : group ? 'Guardar cambios' : 'Guardar'}</button></div>
      </form>
    </AdminDialog>
  )
}
