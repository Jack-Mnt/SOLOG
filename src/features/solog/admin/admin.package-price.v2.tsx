import { useState } from 'react'
import { AdminDialog } from './admin.dialog'
import { useManagement, useManagementQuery } from './admin.management.context'
import { ReadNotice, MutationNotice } from './admin.management.presentation'

export function PackagePrice({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const store = useManagement(), reference = useManagementQuery('reference', {}), [price, setPrice] = useState(''), [error, setError] = useState('')
  const group = reference.data?.groups.find(g => g.id === groupId)
  return <AdminDialog title="Precio por paquete" onClose={onClose} closeDisabled={!!store.intent('master')?.pending}>
    {!reference.data ? <ReadNotice {...reference} /> : !group || !group.unidades_por_paquete || group.unidades_por_paquete <= 1 ? <p>Este grupo no tiene un paquete valorizable configurado.</p> : <form className="admin-v2-form" onSubmit={e => { e.preventDefault(); setError(''); void store.mutation('update_package_price', { grupo_id: group.id, precio_paquete: Number(price) }, reference.data!.revisions.groups).then(onClose).catch(e => setError(e.message)) }}>
      <p>{group.nombre} · x{group.unidades_por_paquete}. Precio vigente: {group.precio_paquete ?? 'sin precio'}.</p><p>Independiente del catálogo compartido. Solo se cambia al confirmar.</p><label>Nuevo precio por paquete<input required type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label><button className="button" disabled={!!store.intent('master')}>Actualizar precio x{group.unidades_por_paquete}</button>
    </form>}{error && <p role="alert">{error}</p>}<MutationNotice domain="master" onSuccess={onClose} />
  </AdminDialog>
}
