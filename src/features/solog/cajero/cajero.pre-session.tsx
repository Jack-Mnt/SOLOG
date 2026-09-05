import { useCashier } from './cajero.v2.context'

export function CajeroPreSessionList({ review = false }: { review?: boolean }) {
  const panel = useCashier().bootstrap!.panel_state
  const lookup = new Map(panel.groups.map((group) => [group.grupo_id, group]))
  const groups = (review ? panel.review_queue.map((item) => item.grupo_id) : panel.count_queue)
    .map((id) => lookup.get(id))
    .filter((group): group is NonNullable<typeof group> => Boolean(group))
  return <div className="cajero-review-list">
    <p>Proyección actual, aún no congelada. Se confirmará al iniciar el conteo.</p>
    <div className="cajero-review-list__rows">
      {groups.map((group) =>
        <article key={group.grupo_id} className="cajero-coverage-card">
          <div><strong>{group.nombre}</strong><p>{group.categoria}</p>
            <p>{group.productos.map((product) => product.producto).join(' · ')}</p>
          </div><span>Stock teórico: {group.stock_teorico}</span>
        </article>)}
    </div>
  </div>
}
