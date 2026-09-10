import { useState } from 'react'
import { AdminDialog } from '../admin.dialog'
import { useCatalogQuery, useCatalogStore } from './admin.catalogo.context'
import type { CatalogProduct, CatalogProposal, CatalogProposalStatus } from './admin.catalogo.v3'
import { adminTimestamp } from '../admin.v2.format'
import { QueryState, Value } from '../admin.v2.presentation'

type CatalogSurface = 'proposals' | 'products'
type ProposalAction = 'approve' | 'ignore' | 'withdraw'
type ProposalSection = 'urgent' | 'emerging'

const surfaces: Array<{ id: CatalogSurface; label: string }> = [
  { id: 'proposals', label: 'Propuestas' },
  { id: 'products', label: 'Productos' },
]
const proposalStatuses: Array<{ id: CatalogProposalStatus; label: string }> = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'aprobado', label: 'Aprobados' },
  { id: 'ignorado', label: 'Ignorados' },
  { id: 'incorporado', label: 'Incorporados' },
]
const urgentTypes = new Set<CatalogProposal['tipo']>(['agregar_producto', 'precio', 'reincorporar_producto'])
const emergingTypes = new Set<CatalogProposal['tipo']>(['eliminar_producto', 'excluir_producto', 'nombre', 'codigo'])
const proposalLabels: Record<CatalogProposal['tipo'], string> = {
  agregar_producto: 'Agregar producto',
  eliminar_producto: 'Eliminar producto',
  excluir_producto: 'Excluir producto',
  reincorporar_producto: 'Reincorporar producto',
  nombre: 'Cambiar nombre',
  codigo: 'Cambiar código de barras',
  precio: 'Cambiar precio',
}

function CatalogStatus() {
  const status = useCatalogQuery('status', {})
  if (!status.data) return <QueryState {...status} />
  const catalog = status.data.catalog
  return <p>Versión {catalog.version_actual ?? 'sin publicar'} · {adminTimestamp(catalog.publicado_at)} · {catalog.total} SKU</p>
}

function classifyProposal(proposal: CatalogProposal): ProposalSection {
  if (urgentTypes.has(proposal.tipo)) return 'urgent'
  if (emergingTypes.has(proposal.tipo)) return 'emerging'
  throw new Error('Tipo de propuesta Catálogo V3 no clasificable.')
}

function ProposalsSurface() {
  const [status, setStatus] = useState<CatalogProposalStatus>('pendiente')
  const [selected, setSelected] = useState<CatalogProposal | null>(null)
  const query = useCatalogQuery('proposals', { estado: status })
  const rows = query.data?.rows ?? []
  const urgent = rows.filter((proposal) => classifyProposal(proposal) === 'urgent')
  const emerging = rows.filter((proposal) => classifyProposal(proposal) === 'emerging')
  return (
    <>
      <div className="admin-catalog__views" role="group" aria-label="Estado de propuestas">
        {proposalStatuses.map((item) => (
          <button type="button" key={item.id} aria-pressed={status === item.id} onClick={() => setStatus(item.id)}>
            {item.label}
            {query.data && <strong>{query.data.counts[item.id]}</strong>}
          </button>
        ))}
      </div>
      {!query.data ? <QueryState {...query} /> : (
        <div className="admin-catalog__pending">
          <ProposalSection title="Urgentes" rows={urgent} section="urgent" onSelect={setSelected} />
          <ProposalSection title="Emergentes" rows={emerging} section="emerging" onSelect={setSelected} />
        </div>
      )}
      {selected && <ProposalDetail proposal={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function ProposalSection({ title, rows, section, onSelect }: { title: string; rows: CatalogProposal[]; section: ProposalSection; onSelect: (proposal: CatalogProposal) => void }) {
  return (
    <section className={`admin-catalog__section admin-catalog__section--${section}`}>
      <header><h3>{title}</h3><span>{rows.length}</span></header>
      <div className="admin-v2-table admin-catalog__table">
        <table>
          <thead><tr><th scope="col">Tipo</th><th scope="col">Producto</th><th scope="col">C. interno</th><th scope="col">Origen</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            {rows.map((proposal) => <ProposalRow key={proposal.propuesta_fingerprint} proposal={proposal} onSelect={onSelect} />)}
            {!rows.length && <tr><td colSpan={5}>No hay propuestas {title.toLowerCase()}.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProposalRow({ proposal, onSelect }: { proposal: CatalogProposal; onSelect: (proposal: CatalogProposal) => void }) {
  return (
    <tr>
      <td>{proposalLabels[proposal.tipo]}</td>
      <th scope="row">{proposal.producto ?? proposal.catalogo_actual.producto ?? '—'}</th>
      <td>{proposal.c_interno}</td>
      <td>{proposal.cambio_id === null ? 'Candidato automático' : proposal.sedes.map((site) => site.nombre).join(', ') || 'Historial Catálogo'}</td>
      <td><button type="button" className="button button--secondary" onClick={() => onSelect(proposal)}>Revisar</button></td>
    </tr>
  )
}

function ProposalDetail({ proposal, onClose }: { proposal: CatalogProposal; onClose: () => void }) {
  const store = useCatalogStore()
  const [error, setError] = useState('')
  const intent = store.intent()
  const run = (action: ProposalAction) => {
    setError('')
    void store.mutation('proposal_action', { propuesta_fingerprint: proposal.propuesta_fingerprint, action }).then(onClose).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la propuesta.')
    })
  }
  const retry = () => {
    setError('')
    void store.retryMutation().then(onClose).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'No se pudo confirmar la propuesta.')
    })
  }
  const blocked = proposal.estado === 'aprobado' && proposal.block_reason !== null
  return (
    <AdminDialog title={proposal.producto ?? `Propuesta ${proposal.c_interno}`} description={proposalLabels[proposal.tipo]} onClose={onClose} closeDisabled={!!intent?.pending} wide>
      <div className="admin-catalog__proposal-context">
        <span>C. interno {proposal.c_interno}</span>
        <span>{proposal.cambio_id === null ? 'Candidato automático' : `Cambio ${proposal.cambio_id}`}</span>
        <span>{proposal.sedes.length ? proposal.sedes.map((site) => site.nombre).join(', ') : 'Sin sedes asociadas'}</span>
        <span>{proposal.occurrence_count} apariciones</span>
      </div>
      <dl className="admin-catalog__proposal-summary">
        <div><dt>Estado</dt><dd>{proposal.estado}</dd></div>
        <div><dt>Sección</dt><dd>{proposal.seccion}</dd></div>
        <div><dt>Primera evidencia</dt><dd>{adminTimestamp(proposal.first_seen_at)}</dd></div>
        <div><dt>Última evidencia</dt><dd>{adminTimestamp(proposal.last_seen_at)}</dd></div>
        <div><dt>Producto actual</dt><dd>{proposal.catalogo_actual.producto ?? '—'}</dd></div>
        <div><dt>Precio actual</dt><dd><Value value={proposal.catalogo_actual.precio} money /></dd></div>
        <div><dt>Código de barras</dt><dd>{proposal.catalogo_actual.c_barras ?? '—'}</dd></div>
        <div><dt>Grupo</dt><dd>{proposal.catalogo_actual.grupo ?? '—'}</dd></div>
      </dl>
      {proposal.stale && <p role="status">Existe evidencia posterior para este SKU y tipo; revisa la propuesta antes de publicar.</p>}
      {proposal.estado === 'aprobado' && <p role={blocked ? 'alert' : 'status'}>{blocked ? `No publicable: ${proposal.block_reason}` : proposal.publicable ? 'Lista para publicación.' : 'Aprobada; el estado de publicación aún no está disponible.'}</p>}
      {intent && <div className="notice" role="status"><p>{intent.error ?? 'Operación en curso…'} · {intent.payload.operation_id}</p>{!intent.pending && <button type="button" className="button" onClick={retry}>Reintentar misma operación</button>}</div>}
      <div className="admin-v2-actions">
        {proposal.estado === 'pendiente' && <><button type="button" className="button" disabled={!!intent} onClick={() => run('approve')}>Aprobar</button><button type="button" className="button button--secondary" disabled={!!intent} onClick={() => run('ignore')}>Ignorar propuesta</button></>}
        {proposal.estado === 'aprobado' && <button type="button" className="button button--secondary" disabled={!!intent} onClick={() => run('withdraw')}>Retirar aprobación</button>}
      </div>
      {error && <p role="alert">{error}</p>}
    </AdminDialog>
  )
}

function ProductsSurface() {
  const query = useCatalogQuery('products', {})
  if (!query.data) return <QueryState {...query} />
  const { rows, total } = query.data
  return (
    <section className="admin-catalog__section">
      <header>
        <div>
          <h3>Productos</h3>
          <p>{total} productos cargados completos.</p>
        </div>
      </header>
      <div className="admin-v2-table admin-catalog__table">
        <table>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col">C. interno</th>
              <th scope="col">Categoría</th>
              <th scope="col">Grupo</th>
              <th scope="col">Precio</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => <ProductRow key={product.c_interno} product={product} />)}
            {!rows.length && <tr><td colSpan={6}>No hay productos en el catálogo.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProductRow({ product }: { product: CatalogProduct }) {
  return (
    <tr>
      <th scope="row">{product.producto}</th>
      <td>{product.c_interno}</td>
      <td>{product.categoria}</td>
      <td>{product.grupo ?? '—'}</td>
      <td className="admin-catalog__money"><Value value={product.precio} money /></td>
      <td>{product.estado_catalogo === 'incluido' ? 'Incluido' : 'Excluido'} · {product.modo}</td>
    </tr>
  )
}

export function AdminCatalogV3() {
  const [surface, setSurface] = useState<CatalogSurface>('proposals')
  return (
    <section className="admin-catalog">
      <header className="admin-catalog__header">
        <div>
          <h2>Catálogo compartido</h2>
          <CatalogStatus />
        </div>
        <button type="button" className="button" disabled title="Disponible en la Fase 8">
          Revisar publicación
        </button>
      </header>
      <div className="admin-catalog__views" role="group" aria-label="Superficies de Catálogo">
        {surfaces.map((item) => (
          <button type="button" key={item.id} aria-pressed={surface === item.id} onClick={() => setSurface(item.id)}>{item.label}</button>
        ))}
      </div>
      {surface === 'proposals' ? <ProposalsSurface /> : <ProductsSurface />}
    </section>
  )
}
