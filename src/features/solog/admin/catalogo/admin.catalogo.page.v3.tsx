import { useMemo, useState } from 'react'
import { AdminDialog } from '../admin.dialog'
import { useAdminStore } from '../admin.v2.context'
import { useCatalogQuery, useCatalogStore } from './admin.catalogo.context'
import type { CatalogMode, CatalogProduct, CatalogProposal, CatalogProposalStatus, CatalogSetupRequired } from './admin.catalogo.v3'
import { adminTimestamp } from '../admin.v2.format'
import { QueryState, Value } from '../admin.v2.presentation'

type CatalogSurface = 'proposals' | 'products'
type ProposalAction = 'approve' | 'ignore' | 'withdraw'
type ProposalSection = 'urgent' | 'emerging'
type ProductStateFilter = 'all' | CatalogProduct['estado_catalogo']
type ProductModeFilter = 'all' | CatalogMode
type ProductSort = 'name' | 'code' | 'price_asc' | 'price_desc'
type ProductSetupTarget = Pick<CatalogSetupRequired, 'propuesta_fingerprint' | 'c_interno' | 'producto' | 'precio' | 'tipo'>
type PriceResolution = 'update_group_price' | 'separate_sku' | 'keep_structure'
type PackageAction = '' | 'keep' | 'update'

const surfaces: Array<{ id: CatalogSurface; label: string }> = [{ id: 'proposals', label: 'Propuestas' }, { id: 'products', label: 'Productos' }]
const proposalStatuses: Array<{ id: CatalogProposalStatus; label: string }> = [{ id: 'pendiente', label: 'Pendientes' }, { id: 'aprobado', label: 'Aprobados' }, { id: 'ignorado', label: 'Ignorados' }, { id: 'incorporado', label: 'Incorporados' }]
const urgentTypes = new Set<CatalogProposal['tipo']>(['agregar_producto', 'precio', 'reincorporar_producto'])
const emergingTypes = new Set<CatalogProposal['tipo']>(['eliminar_producto', 'excluir_producto', 'nombre', 'codigo'])
const emptyProducts: CatalogProduct[] = []
const proposalLabels: Record<CatalogProposal['tipo'], string> = { agregar_producto: 'Agregar producto', eliminar_producto: 'Eliminar producto', excluir_producto: 'Excluir producto', reincorporar_producto: 'Reincorporar producto', nombre: 'Cambiar nombre', codigo: 'Cambiar código de barras', precio: 'Cambiar precio' }
const resolutionLabels: Record<PriceResolution, string> = { update_group_price: 'Actualizar precio de todo el grupo', separate_sku: 'Separar SKU como Único', keep_structure: 'Conservar estructura del grupo' }

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
    void store.mutation('proposal_action', { propuesta_fingerprint: proposal.propuesta_fingerprint, action }).then(onClose).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la propuesta.'))
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

function ProductSetupDialog({ target, onClose, onComplete }: { target: ProductSetupTarget; onClose: () => void; onComplete: () => void }) {
  const store = useCatalogStore()
  const reference = useCatalogQuery('reference', {})
  const [mode, setMode] = useState<'existing_group' | 'new_unit'>('existing_group')
  const [groupId, setGroupId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brand, setBrand] = useState('')
  const [error, setError] = useState('')
  const intent = store.intent()
  const submit = () => {
    if (!reference.data) return
    setError('')
    const payload = mode === 'existing_group' ? { propuesta_fingerprint: target.propuesta_fingerprint, mode: 'existing_group' as const, grupo_id: groupId, marca: brand.trim() || null } : { propuesta_fingerprint: target.propuesta_fingerprint, mode: 'new_unit' as const, categoria_id: categoryId, marca: brand.trim() || null }
    void store.mutation('prepare_product', payload).then(onComplete).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo preparar el producto.'))
  }
  const retry = () => { setError(''); void store.retryMutation().then(onComplete).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo confirmar la configuración.')) }
  const valid = !!reference.data && (mode === 'existing_group' ? !!groupId : !!categoryId)
  return <AdminDialog title="Configurar producto" description={`${target.producto} · C. interno ${target.c_interno}`} onClose={onClose} closeDisabled={!!intent?.pending} wide>
    <p>La configuración queda en staging y no modifica el catálogo ni los grupos hasta la publicación.</p>
    {!reference.data ? <QueryState {...reference} /> : <form className="admin-v2-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <label>Marca opcional<input value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
      <label>Destino<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="existing_group">Grupo existente</option><option value="new_unit">Nuevo grupo unitario</option></select></label>
      {mode === 'existing_group' ? <label>Grupo<select required value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Seleccionar</option>{reference.data.groups.map((group) => <option key={group.id} value={group.id}>{group.nombre} · {group.precio}</option>)}</select></label> : <label>Categoría<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Seleccionar</option>{reference.data.categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>}
      <button className="button" disabled={!!intent || !valid}>{target.tipo === 'reincorporar_producto' ? 'Preparar reincorporación' : 'Preparar producto'}</button>
    </form>}
    {intent && <CatalogIntentNotice onRetry={retry} />}{error && <p role="alert">{error}</p>}
  </AdminDialog>
}

function PriceResolutionDialog({ fingerprint, onClose, onComplete }: { fingerprint: string; onClose: () => void; onComplete: () => void }) {
  const store = useCatalogStore()
  const query = useCatalogQuery('price_options', { propuesta_fingerprint: fingerprint })
  const [resolution, setResolution] = useState<PriceResolution | ''>('')
  const [packageAction, setPackageAction] = useState<PackageAction>('')
  const [packagePrice, setPackagePrice] = useState('')
  const [error, setError] = useState('')
  const intent = store.intent()
  if (!query.data) return <AdminDialog title="Resolver precio" onClose={onClose} closeDisabled={!!intent?.pending} wide><QueryState {...query} /></AdminDialog>
  const options = query.data
  const requiresPackageDecision = options.package_decision_required && resolution !== '' && resolution !== 'separate_sku'
  const submit = () => {
    if (!resolution) { setError('Selecciona una resolución de precio.'); return }
    if (options.change_state !== 'aprobado') { setError('La propuesta ya no está aprobada. Actualiza la bandeja.'); return }
    if (requiresPackageDecision && !packageAction) { setError('Decide explícitamente el precio xN.'); return }
    if (requiresPackageDecision && packageAction === 'update' && (!Number.isFinite(Number(packagePrice)) || Number(packagePrice) <= 0)) { setError('Ingresa un precio xN mayor que cero.'); return }
    setError('')
    const payload = resolution === 'separate_sku' ? { propuesta_fingerprint: fingerprint, resolution } : requiresPackageDecision && packageAction === 'update' ? { propuesta_fingerprint: fingerprint, resolution, package_action: 'update' as const, precio_paquete: Number(packagePrice) } : { propuesta_fingerprint: fingerprint, resolution, package_action: 'keep' as const }
    void store.mutation('prepare_price', payload).then(onComplete).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo preparar el precio.'))
  }
  const retry = () => { setError(''); void store.retryMutation().then(onComplete).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo confirmar la resolución.')) }
  return <AdminDialog title="Resolver precio" description={`C. interno ${options.c_interno}`} onClose={onClose} closeDisabled={!!intent?.pending} wide>
    <p>Precio propuesto: <Value value={options.nuevo_precio} money />. Esta resolución queda en staging; no publica cambios.</p>
    <dl className="admin-catalog__proposal-summary"><div><dt>Grupo</dt><dd>{options.grupo.nombre}</dd></div><div><dt>Precio de grupo</dt><dd><Value value={options.grupo.precio} money /></dd></div><div><dt>Paquete</dt><dd>{options.grupo.unidades_por_paquete && options.grupo.unidades_por_paquete > 1 ? `x${options.grupo.unidades_por_paquete}` : 'No aplica'}</dd></div><div><dt>Resolución previa</dt><dd>{options.prepared_resolution ? 'Existe staging preparado' : 'Sin resolución preparada'}</dd></div></dl>
    <div className="admin-v2-table admin-catalog__table"><table><thead><tr><th scope="col">SKU</th><th scope="col">Producto</th><th scope="col">Precio</th></tr></thead><tbody>{options.members.map((member) => <tr key={member.c_interno}><td>{member.c_interno}</td><th scope="row">{member.producto}</th><td><Value value={member.precio} money /></td></tr>)}</tbody></table></div>
    <label>Resolución<select value={resolution} onChange={(event) => { setResolution(event.target.value as PriceResolution | ''); setPackageAction(''); setPackagePrice('') }}><option value="">Seleccionar</option>{options.options.map((option) => <option key={option} value={option}>{resolutionLabels[option]}</option>)}</select></label>
    {requiresPackageDecision && <fieldset><legend>Precio xN</legend><p>Selecciona una decisión explícita. No se calcula proporcionalmente.</p><label><input type="radio" name="package-action" checked={packageAction === 'keep'} onChange={() => setPackageAction('keep')} /> Conservar precio xN vigente</label><label><input type="radio" name="package-action" checked={packageAction === 'update'} onChange={() => setPackageAction('update')} /> Actualizar precio xN</label>{packageAction === 'update' && <label>Nuevo precio xN<input required type="number" min="0.01" step="0.01" value={packagePrice} onChange={(event) => setPackagePrice(event.target.value)} /></label>}</fieldset>}
    {intent && <CatalogIntentNotice onRetry={retry} />}
    <button type="button" className="button" disabled={!!intent || options.change_state !== 'aprobado'} onClick={submit}>Preparar resolución</button>
    {error && <p role="alert">{error}</p>}
  </AdminDialog>
}

function ProductsSurface() {
  const query = useCatalogQuery('products', {})
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<ProductStateFilter>('all')
  const [modeFilter, setModeFilter] = useState<ProductModeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState<ProductSort>('name')
  const [selected, setSelected] = useState<CatalogProduct | null>(null)
  const [setup, setSetup] = useState<ProductSetupTarget | null>(null)
  const rows = query.data?.rows ?? emptyProducts
  const categories = useMemo(() => [...new Set(rows.map((product) => product.categoria))].sort((left, right) => left.localeCompare(right, 'es-PE')), [rows])
  const products = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-PE')
    return rows.filter((product) => {
      const searchable = [product.producto, product.c_interno, product.c_barras, product.marca, product.categoria, product.grupo].filter((value): value is string | number => value !== null).join(' ').toLocaleLowerCase('es-PE')
      return (!term || searchable.includes(term)) && (stateFilter === 'all' || product.estado_catalogo === stateFilter) && (modeFilter === 'all' || product.modo === modeFilter) && (categoryFilter === 'all' || product.categoria === categoryFilter)
    }).sort((left, right) => sort === 'code' ? left.c_interno - right.c_interno : sort === 'price_asc' ? left.precio - right.precio || left.producto.localeCompare(right.producto, 'es-PE') : sort === 'price_desc' ? right.precio - left.precio || left.producto.localeCompare(right.producto, 'es-PE') : left.producto.localeCompare(right.producto, 'es-PE'))
  }, [categoryFilter, modeFilter, rows, search, sort, stateFilter])
  if (!query.data) return <QueryState {...query} />
  return <>
    {query.data.setup_required.length > 0 && <section className="admin-catalog__section admin-catalog__section--urgent"><header><h3>Configuración pendiente</h3><span>{query.data.setup_required.length}</span></header><div className="admin-catalog__proposal-context">{query.data.setup_required.map((item) => <span key={item.propuesta_fingerprint}>{item.c_interno} · {item.producto} · configuración requerida antes de publicar <button type="button" className="button button--secondary" onClick={() => setSetup(item)}>Configurar</button></span>)}</div></section>}
    <section className="admin-catalog__section"><header><div><h3>Productos</h3><p>{products.length} de {query.data.total} productos cargados completos.</p></div></header><form className="admin-v2-filters admin-catalog__filters" onSubmit={(event) => event.preventDefault()}><label>Buscar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Producto, código, marca, categoría o grupo" /></label><label>Estado<select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as ProductStateFilter)}><option value="all">Todos</option><option value="incluido">Incluidos</option><option value="excluido">Excluidos</option></select></label><label>Modalidad<select value={modeFilter} onChange={(event) => setModeFilter(event.target.value as ProductModeFilter)}><option value="all">Todas</option><option value="Único">Único</option><option value="Agrupado">Agrupado</option><option value="Excluido">Excluido</option></select></label><label>Categoría<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Orden<select value={sort} onChange={(event) => setSort(event.target.value as ProductSort)}><option value="name">Producto</option><option value="code">Código interno</option><option value="price_asc">Precio: menor a mayor</option><option value="price_desc">Precio: mayor a menor</option></select></label></form><div className="admin-v2-table admin-catalog__table"><table><thead><tr><th scope="col">Producto</th><th scope="col">C. interno</th><th scope="col">Categoría</th><th scope="col">Grupo</th><th scope="col">Precio</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>{products.map((product) => <ProductRow key={product.c_interno} product={product} onSelect={setSelected} />)}{!products.length && <tr><td colSpan={7}>No hay productos que coincidan con los filtros locales.</td></tr>}</tbody></table></div></section>
    {selected && <ProductStateProposal product={selected} onClose={() => setSelected(null)} />}{setup && <ProductSetupDialog target={setup} onClose={() => setSetup(null)} onComplete={() => setSetup(null)} />}
  </>
}
function ProductRow({ product, onSelect }: { product: CatalogProduct; onSelect: (product: CatalogProduct) => void }) {
  const actionLabel = product.estado_catalogo === 'incluido' ? 'Proponer exclusión' : 'Proponer reincorporación'
  return <tr><th scope="row">{product.producto}</th><td>{product.c_interno}</td><td>{product.categoria}</td><td>{product.grupo ?? '—'}</td><td className="admin-catalog__money"><Value value={product.precio} money /></td><td>{product.estado_catalogo === 'incluido' ? 'Incluido' : 'Excluido'} · {product.modo}{product.propuesta_estado ? ` · propuesta ${product.propuesta_estado}` : ''}</td><td><button type="button" className="button button--secondary" onClick={() => onSelect(product)}>{actionLabel}</button></td></tr>
}
function ProductStateProposal({ product, onClose }: { product: CatalogProduct; onClose: () => void }) {
  const store = useCatalogStore(); const [error, setError] = useState(''); const intent = store.intent(); const action = product.estado_catalogo === 'incluido' ? 'exclude' : 'reincorporate'; const title = action === 'exclude' ? 'Proponer exclusión' : 'Proponer reincorporación'
  const submit = () => { setError(''); void store.mutation('propose_product_state', { c_interno: product.c_interno, action }).then(onClose).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo crear la propuesta.')) }
  const retry = () => { setError(''); void store.retryMutation().then(onClose).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo confirmar la propuesta.')) }
  return <AdminDialog title={title} description={product.producto} onClose={onClose} closeDisabled={!!intent?.pending}><p>Esta acción solo crea una propuesta para revisión y publicación posterior. No modifica el estado del producto ahora.</p><dl className="admin-catalog__proposal-summary"><div><dt>C. interno</dt><dd>{product.c_interno}</dd></div><div><dt>Estado actual</dt><dd>{product.estado_catalogo}</dd></div><div><dt>Modalidad</dt><dd>{product.modo}</dd></div><div><dt>Grupo</dt><dd>{product.grupo ?? '—'}</dd></div></dl>{intent && <CatalogIntentNotice onRetry={retry} />}<button type="button" className="button" disabled={!!intent} onClick={submit}>{title}</button>{error && <p role="alert">{error}</p>}</AdminDialog>
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
  const [surface, setSurface] = useState<CatalogSurface>('proposals')
  const [publishing, setPublishing] = useState(false)
  const store = useCatalogStore()
  return <section className="admin-catalog"><header className="admin-catalog__header"><div><h2>Catálogo compartido</h2><CatalogStatus /></div><button type="button" className="button" onClick={() => setPublishing(true)}>{store.publication.operationId ? 'Recuperar publicación' : 'Revisar publicación'}</button></header><div className="admin-catalog__views" role="group" aria-label="Superficies de Catálogo">{surfaces.map((item) => <button type="button" key={item.id} aria-pressed={surface === item.id} onClick={() => setSurface(item.id)}>{item.label}</button>)}</div>{surface === 'proposals' ? <ProposalsSurface /> : <ProductsSurface />}{publishing && <PublicationDialog onClose={() => setPublishing(false)} />}</section>
}
