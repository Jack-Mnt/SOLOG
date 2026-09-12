import { useState } from 'react'
import { AdminDialog } from '../admin.dialog'
import { ValuationDialog, type ValuationDecision } from '../admin.valuation-dialog'
import { useAdminStore } from '../admin.v2.context'
import { ProductSetupDialog, type ProductSetupTarget } from '../productos/admin.product-setup.dialog'
import { useCatalogQuery, useCatalogStore } from './admin.catalogo.context'
import type { CatalogProposal, CatalogProposalStatus } from './admin.catalogo.v3'
import { adminTimestamp } from '../admin.v2.format'
import { QueryState, Value } from '../admin.v2.presentation'

type ProposalAction = 'approve' | 'ignore' | 'withdraw'
type ProposalSection = 'urgent' | 'emerging'
type PriceResolution = 'update_group_price' | 'separate_sku' | 'keep_structure'

const proposalStatuses: Array<{ id: CatalogProposalStatus; label: string }> = [{ id: 'pendiente', label: 'Pendientes' }, { id: 'aprobado', label: 'Aprobados' }, { id: 'ignorado', label: 'Ignorados' }, { id: 'incorporado', label: 'Incorporados' }]
const urgentTypes = new Set<CatalogProposal['tipo']>(['agregar_producto', 'precio', 'reincorporar_producto'])
const emergingTypes = new Set<CatalogProposal['tipo']>(['eliminar_producto', 'excluir_producto', 'nombre', 'codigo'])
const proposalLabels: Record<CatalogProposal['tipo'], string> = { agregar_producto: 'Agregar producto', eliminar_producto: 'Eliminar producto', excluir_producto: 'Excluir producto', reincorporar_producto: 'Reincorporar producto', nombre: 'Cambiar nombre', codigo: 'Cambiar código de barras', precio: 'Cambiar precio' }
const resolutionLabels: Record<PriceResolution, string> = { update_group_price: 'Actualizar precio de todo el grupo', separate_sku: 'Separar SKU como Único', keep_structure: 'Conservar estructura del grupo' }
function priceErrorMessage(reason: unknown) {
  const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : ''
  if (code === 'INVALID_PACKAGE_CONFIGURATION' || code === 'SOLOG_INVALID_PACKAGE_CONFIGURATION') return 'La configuración de valorizado no es válida.'
  if (code === 'INVALID_PACKAGE_PRICE' || code === 'SOLOG_INVALID_PACKAGE_PRICE') return 'El precio por paquete no es válido.'
  if (code === 'PACKAGE_PRICE_DECISION_REQUIRED' || code === 'SOLOG_PACKAGE_PRICE_DECISION_REQUIRED') return 'Debes decidir explícitamente el valorizado antes de preparar.'
  return reason instanceof Error ? reason.message : 'No se pudo preparar el precio.'
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
  return <>
    <div className="admin-catalog__views" role="group" aria-label="Estado de propuestas">{proposalStatuses.map((item) => <button type="button" key={item.id} aria-pressed={status === item.id} onClick={() => setStatus(item.id)}>{item.label}{query.data && <strong>{query.data.counts[item.id]}</strong>}</button>)}</div>
    {!query.data ? <QueryState {...query} /> : <div className="admin-catalog__pending"><ProposalSection title="Urgentes" rows={urgent} section="urgent" onSelect={setSelected} /><ProposalSection title="Emergentes" rows={emerging} section="emerging" onSelect={setSelected} /></div>}
    {selected && <ProposalDetail proposal={selected} onClose={() => setSelected(null)} />}
  </>
}
function ProposalSection({ title, rows, section, onSelect }: { title: string; rows: CatalogProposal[]; section: ProposalSection; onSelect: (proposal: CatalogProposal) => void }) {
  return <section className={`admin-catalog__section admin-catalog__section--${section}`}><header><h3>{title}</h3><span>{rows.length}</span></header><div className="admin-v2-table admin-catalog__table"><table><thead><tr><th scope="col">Tipo</th><th scope="col">Producto</th><th scope="col">C. interno</th><th scope="col">Origen</th><th scope="col">Acciones</th></tr></thead><tbody>{rows.map((proposal) => <ProposalRow key={proposal.propuesta_fingerprint} proposal={proposal} onSelect={onSelect} />)}{!rows.length && <tr><td colSpan={5}>No hay propuestas {title.toLowerCase()}.</td></tr>}</tbody></table></div></section>
}
function ProposalRow({ proposal, onSelect }: { proposal: CatalogProposal; onSelect: (proposal: CatalogProposal) => void }) {
  return <tr><td>{proposalLabels[proposal.tipo]}</td><th scope="row">{proposal.producto ?? proposal.catalogo_actual.producto ?? '—'}</th><td>{proposal.c_interno}</td><td>{proposal.cambio_id === null ? 'Candidato automático' : proposal.sedes.map((site) => site.nombre).join(', ') || 'Historial Catálogo'}</td><td><button type="button" className="button button--secondary" onClick={() => onSelect(proposal)}>Revisar</button></td></tr>
}

function ProposalDetail({ proposal, onClose }: { proposal: CatalogProposal; onClose: () => void }) {
  const store = useCatalogStore()
  const [error, setError] = useState('')
  const [setup, setSetup] = useState(false)
  const [price, setPrice] = useState(false)
  const intent = store.intent()
  const run = (action: ProposalAction) => {
    setError('')
    void store.mutation('proposal_action', { propuesta_fingerprint: proposal.propuesta_fingerprint, action }, { proposal }).then(onClose).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la propuesta.'))
  }
  const retry = () => { setError(''); void store.retryMutation().then(onClose).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo confirmar la propuesta.')) }
  const blocked = proposal.estado === 'aprobado' && proposal.block_reason !== null
  const setupTarget: ProductSetupTarget = { propuesta_fingerprint: proposal.propuesta_fingerprint, c_interno: proposal.c_interno, producto: proposal.producto ?? proposal.catalogo_actual.producto ?? `SKU ${proposal.c_interno}`, precio: proposal.catalogo_actual.precio ?? 0, tipo: proposal.tipo === 'reincorporar_producto' ? 'reincorporar_producto' : 'agregar_producto' }
  const canSetup = proposal.tipo === 'agregar_producto' || proposal.tipo === 'reincorporar_producto'
  return <>
    <AdminDialog title={proposal.producto ?? `Propuesta ${proposal.c_interno}`} description={proposalLabels[proposal.tipo]} onClose={onClose} closeDisabled={!!intent?.pending} wide>
      <div className="admin-catalog__proposal-context"><span>C. interno {proposal.c_interno}</span><span>{proposal.cambio_id === null ? 'Candidato automático' : `Cambio ${proposal.cambio_id}`}</span><span>{proposal.sedes.length ? proposal.sedes.map((site) => site.nombre).join(', ') : 'Sin sedes asociadas'}</span><span>{proposal.occurrence_count} apariciones</span></div>
      <dl className="admin-catalog__proposal-summary"><div><dt>Estado</dt><dd>{proposal.estado}</dd></div><div><dt>Sección</dt><dd>{proposal.seccion}</dd></div><div><dt>Primera evidencia</dt><dd>{adminTimestamp(proposal.first_seen_at)}</dd></div><div><dt>Última evidencia</dt><dd>{adminTimestamp(proposal.last_seen_at)}</dd></div><div><dt>Producto actual</dt><dd>{proposal.catalogo_actual.producto ?? '—'}</dd></div><div><dt>Precio actual</dt><dd><Value value={proposal.catalogo_actual.precio} money /></dd></div><div><dt>Código de barras</dt><dd>{proposal.catalogo_actual.c_barras ?? '—'}</dd></div><div><dt>Grupo</dt><dd>{proposal.catalogo_actual.grupo ?? '—'}</dd></div></dl>
      {proposal.stale && <p role="status">Existe evidencia posterior para este SKU y tipo; revisa la propuesta antes de publicar.</p>}
      {proposal.estado === 'aprobado' && <p role={blocked ? 'alert' : 'status'}>{blocked ? `No publicable: ${proposal.block_reason}` : proposal.publicable ? 'Lista para publicación.' : 'Aprobada; el estado de publicación aún no está disponible.'}</p>}
      {intent && <CatalogIntentNotice onRetry={retry} />}
      <div className="admin-v2-actions">
        {proposal.estado === 'pendiente' && <><button type="button" className="button" disabled={!!intent} onClick={() => run('approve')}>Aprobar</button><button type="button" className="button button--secondary" disabled={!!intent} onClick={() => run('ignore')}>Ignorar propuesta</button></>}
        {proposal.estado === 'aprobado' && <><button type="button" className="button button--secondary" disabled={!!intent} onClick={() => run('withdraw')}>Retirar aprobación</button>{canSetup && <button type="button" className="button" disabled={!!intent} onClick={() => setSetup(true)}>{proposal.setup ? 'Actualizar configuración' : 'Configurar producto'}</button>}{proposal.tipo === 'precio' && <button type="button" className="button" disabled={!!intent} onClick={() => setPrice(true)}>{proposal.price_resolution ? 'Actualizar resolución de precio' : 'Resolver precio'}</button>}</>}
      </div>
      {error && <p role="alert">{error}</p>}
    </AdminDialog>
    {setup && <ProductSetupDialog target={setupTarget} onClose={() => setSetup(false)} onComplete={onClose} />}
    {price && <PriceResolutionDialog fingerprint={proposal.propuesta_fingerprint} onClose={() => setPrice(false)} onComplete={onClose} />}
  </>
}
function CatalogIntentNotice({ onRetry }: { onRetry: () => void }) {
  const intent = useCatalogStore().intent()
  if (!intent) return null
  return <div className="notice" role="status"><p>{intent.error ?? 'Operación en curso…'} · {intent.payload.operation_id}</p>{!intent.pending && <button type="button" className="button" onClick={onRetry}>Reintentar misma operación</button>}</div>
}

function PriceResolutionDialog({ fingerprint, onClose, onComplete }: { fingerprint: string; onClose: () => void; onComplete: () => void }) {
  const store = useCatalogStore()
  const query = useCatalogQuery('price_options', { propuesta_fingerprint: fingerprint })
  const [resolution, setResolution] = useState<PriceResolution | ''>('')
  const [packageAction, setPackageAction] = useState<'keep' | 'clear' | 'not_applicable' | 'set' | ''>('')
  const [preparedValuation, setPreparedValuation] = useState<{ unidades_por_paquete: number; precio_paquete: number } | null>(null)
  const [valuation, setValuation] = useState(false)
  const [error, setError] = useState('')
  const intent = store.intent()
  if (!query.data) return <AdminDialog title="Resolver precio" onClose={onClose} closeDisabled={!!intent?.pending} wide><QueryState {...query} /></AdminDialog>
  const options = query.data
  const initial = { unitsPerPackage: options.grupo.unidades_por_paquete, packagePrice: options.grupo.precio_paquete }
  const selectResolution = (value: PriceResolution | '') => { setResolution(value); setPackageAction(''); setPreparedValuation(null); setError('') }
  const chooseValuation = (decision: ValuationDecision) => { if (decision.enabled) { setPreparedValuation({ unidades_por_paquete: decision.unitsPerPackage!, precio_paquete: decision.packagePrice! }); setPackageAction('set') } else setPackageAction('clear'); setValuation(false) }
  const submit = () => {
    if (!resolution) { setError('Selecciona una resolución de precio.'); return }
    if (options.change_state !== 'aprobado') { setError('La propuesta ya no está aprobada. Actualiza la bandeja.'); return }
    if (!packageAction) { setError('Decide explícitamente la valorización por paquete.'); return }
    if (packageAction === 'set' && !preparedValuation) { setError('Configura un valorizado válido antes de preparar.'); return }
    setError('')
    const done = () => onComplete()
    const failed = (reason: unknown) => setError(priceErrorMessage(reason))
    if (resolution === 'separate_sku') {
      const payload = packageAction === 'set' ? { propuesta_fingerprint: fingerprint, resolution: 'separate_sku' as const, package_action: 'set' as const, ...preparedValuation! } : { propuesta_fingerprint: fingerprint, resolution: 'separate_sku' as const, package_action: packageAction === 'clear' ? 'clear' as const : 'not_applicable' as const }
      void store.mutation('prepare_price', payload).then(done).catch(failed); return
    }
    const payload = packageAction === 'set' ? { propuesta_fingerprint: fingerprint, resolution, package_action: 'set' as const, ...preparedValuation! } : { propuesta_fingerprint: fingerprint, resolution, package_action: packageAction === 'clear' ? 'clear' as const : 'keep' as const }
    void store.mutation('prepare_price', payload).then(done).catch(failed)
  }
  const retry = () => { setError(''); void store.retryMutation().then(onComplete).catch((reason: unknown) => setError(priceErrorMessage(reason))) }
  const canKeep = resolution !== 'separate_sku'
  return <><AdminDialog title="Resolver precio" description={`C. interno ${options.c_interno}`} onClose={onClose} closeDisabled={!!intent?.pending} wide>
    <p>Precio propuesto: <Value value={options.nuevo_precio} money />. La resolución y el valorizado quedan en staging; se aplicarán solo al publicar Catálogo.</p>
    <dl className="admin-catalog__proposal-summary"><div><dt>Grupo</dt><dd>{options.grupo.nombre}</dd></div><div><dt>Precio de grupo</dt><dd><Value value={options.grupo.precio} money /></dd></div><div><dt>Paquete actual</dt><dd>{initial.unitsPerPackage && initial.packagePrice ? `x${initial.unitsPerPackage} · S/ ${initial.packagePrice.toFixed(2)}` : 'Sin valorizado'}</dd></div><div><dt>Resolución previa</dt><dd>{options.prepared_resolution ? 'Existe staging preparado' : 'Sin resolución preparada'}</dd></div></dl>
    <div className="admin-v2-table admin-catalog__table"><table><thead><tr><th scope="col">SKU</th><th scope="col">Producto</th><th scope="col">Precio</th></tr></thead><tbody>{options.members.map((member) => <tr key={member.c_interno}><td>{member.c_interno}</td><th scope="row">{member.producto}</th><td><Value value={member.precio} money /></td></tr>)}</tbody></table></div>
    <label>Resolución<select value={resolution} onChange={(event) => selectResolution(event.target.value as PriceResolution | '')}><option value="">Seleccionar</option>{options.options.map((option) => <option key={option} value={option}>{resolutionLabels[option]}</option>)}</select></label>
    {resolution && <fieldset><legend>Valorizado</legend>{canKeep && <button type="button" className="button button--secondary" aria-pressed={packageAction === 'keep'} onClick={() => setPackageAction('keep')}>Conservar valorizado</button>}<button type="button" className="button button--secondary" aria-pressed={packageAction === 'set' || packageAction === 'clear'} onClick={() => setValuation(true)}>Actualizar valorizado</button>{resolution === 'separate_sku' && <button type="button" className="button button--secondary" aria-pressed={packageAction === 'not_applicable'} onClick={() => setPackageAction('not_applicable')}>Sin valorizado</button>}{packageAction === 'clear' && <p>El valorizado se eliminará al publicar.</p>}{packageAction === 'set' && preparedValuation && <p>Se preparará x{preparedValuation.unidades_por_paquete} · S/ {preparedValuation.precio_paquete.toFixed(2)} al publicar.</p>}</fieldset>}
    {intent && <CatalogIntentNotice onRetry={retry} />}
    <button type="button" className="button" disabled={!!intent || options.change_state !== 'aprobado'} onClick={submit}>Preparar resolución</button>
    {error && <p role="alert">{error}</p>}
  </AdminDialog>{valuation && <ValuationDialog unitPrice={options.nuevo_precio} initial={initial} description="Este cambio queda en staging y se aplicará al publicar Catálogo." pending={!!intent?.pending} error={error} onClose={() => setValuation(false)} onConfirm={chooseValuation} />}</>
}
function PublicationDialog({ onClose }: { onClose: () => void }) {
  const store = useCatalogStore()
  const query = useCatalogQuery('publication_preview', {})
  const admin = useAdminStore().bootstrap?.identity.rol === 'admin'
  const preview = query.data?.preview
  const receipt = store.publication
  const publish = () => { void store.publish().catch(() => {}) }
  return <AdminDialog title="Publicar catálogo" onClose={onClose} closeDisabled={!!receipt.pending} wide>
    {!preview ? <QueryState {...query} /> : <><p>{preview.codigo}</p><p>Versión {preview.version_actual ?? 'sin publicación'} → {preview.version_nueva ?? 'pendiente'} · {preview.cambios_total} cambios · {preview.sku_actuales} → {preview.sku_resultantes} SKU</p><dl className="admin-v2-data">{Object.entries(preview.cambios).map(([type, count]) => <div key={type}><dt>{proposalLabels[type as CatalogProposal['tipo']]}</dt><dd>{count}</dd></div>)}</dl>{preview.errores.map((error) => <p role="alert" key={error}>{error}</p>)}{preview.conflictos.map((conflict, index) => <p role="alert" key={index}>Conflicto: {JSON.stringify(conflict)}</p>)}</>}
    {receipt.operationId && <p>Publicación pendiente de confirmar: {receipt.operationId}. El reintento conserva la misma operación.</p>}
    {receipt.error && <p role="alert">{receipt.error}</p>}
    {receipt.result && <p role="status">{receipt.result.codigo} · versión {receipt.result.version}{receipt.result.replay ? ' · replay confirmado' : ''}{receipt.result.completion_recorded ? '' : ' · commit confirmado; falta registrar el cierre, vuelve a recuperar esta operación.'}</p>}
    <button type="button" className="button" disabled={!admin || !!receipt.pending || (!receipt.operationId && !preview?.ok)} onClick={publish}>{receipt.pending ? 'Publicando…' : receipt.operationId ? 'Recuperar publicación' : 'Confirmar publicación'}</button>
    {!admin && <p>Solo admin puede publicar; moderador puede revisar el preview.</p>}
  </AdminDialog>
}

export function AdminCatalogV3() {
  const [publishing, setPublishing] = useState(false)
  const store = useCatalogStore()
  return <section className="admin-catalog"><header className="admin-catalog__header"><div><h2>Catálogo compartido</h2><CatalogStatus /></div><button type="button" className="button" onClick={() => setPublishing(true)}>{store.publication.operationId ? 'Recuperar publicación' : 'Revisar publicación'}</button></header><ProposalsSurface />{publishing && <PublicationDialog onClose={() => setPublishing(false)} />}</section>
}
