import { useMemo, useState } from 'react'
import { AdminDialog } from '../admin.dialog'
import { useMasterData } from '../masterdata/admin.masterdata.context'
import type { MasterDataProduct } from '../masterdata/admin.masterdata.v1'
import { QueryState, Value } from '../admin.v2.presentation'
import { useCatalogStore } from '../catalogo/admin.catalogo.context'
import { ProductSetupDialog, type ProductSetupTarget } from './admin.product-setup.dialog'
import { filterAndSortProducts, paginateProducts, type ProductModeFilter, type ProductSort, type ProductStateFilter } from './admin.productos.model'

function CatalogIntentNotice({ onRetry }: { onRetry: () => void }) {
  const intent = useCatalogStore().intent()
  if (!intent) return null
  return <div className="notice" role="status"><p>{intent.error ?? 'Operación en curso…'} · {intent.payload.operation_id}</p>{!intent.pending && <button type="button" className="button" onClick={onRetry}>Reintentar misma operación</button>}</div>
}

function ProductStateProposal({ product, groupName, onClose }: { product: MasterDataProduct; groupName: string | null; onClose: () => void }) {
  const store = useCatalogStore()
  const [error, setError] = useState('')
  const intent = store.intent()
  const action = product.estado === 'Excluido' ? 'reincorporate' : 'exclude'
  const title = action === 'exclude' ? 'Proponer exclusión' : 'Proponer reincorporación'
  const submit = () => { setError(''); void store.mutation('propose_product_state', { c_interno: product.c_interno, action }).then(onClose).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo crear la propuesta.')) }
  const retry = () => { setError(''); void store.retryMutation().then(onClose).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo confirmar la propuesta.')) }
  return <AdminDialog title={title} description={product.producto} onClose={onClose} closeDisabled={!!intent?.pending}>
    <p>Esta acción solo crea una propuesta para revisión y publicación posterior. No modifica el estado del producto ahora.</p>
    <dl className="admin-catalog__proposal-summary"><div><dt>C. interno</dt><dd>{product.c_interno}</dd></div><div><dt>Estado actual</dt><dd>{product.estado === 'Excluido' ? 'Excluido' : 'Incluido'}</dd></div><div><dt>Modalidad</dt><dd>{product.estado}</dd></div><div><dt>Grupo</dt><dd>{groupName ?? '—'}</dd></div></dl>
    {intent && <CatalogIntentNotice onRetry={retry} />}
    <button type="button" className="button" disabled={!!intent} onClick={submit}>{title}</button>
    {error && <p role="alert">{error}</p>}
  </AdminDialog>
}

export function AdminProductsV1() {
  const masterData = useMasterData()
  const catalog = useCatalogStore()
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<ProductStateFilter>('all')
  const [modeFilter, setModeFilter] = useState<ProductModeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState<ProductSort>('name')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<MasterDataProduct | null>(null)
  const [setup, setSetup] = useState<ProductSetupTarget | null>(null)
  const products = useMemo(() => masterData.snapshot && masterData.derived ? filterAndSortProducts(masterData.snapshot.products, masterData.derived, { search, state: stateFilter, mode: modeFilter, categoryId: categoryFilter, sort }) : [], [categoryFilter, masterData.derived, masterData.snapshot, modeFilter, search, sort, stateFilter])
  const visible = useMemo(() => paginateProducts(products, page), [page, products])
  if (!masterData.snapshot || !masterData.derived) return <QueryState error={masterData.error} retry={masterData.retry} />
  const derived = masterData.derived
  const setupRequired = masterData.snapshot.setup_required.filter((item) => !catalog.productSetupPrepared(item.propuesta_fingerprint))
  return <section className="admin-catalog admin-products">
    {setupRequired.length > 0 && <section className="admin-catalog__section admin-catalog__section--urgent"><header><h3>Configuración pendiente</h3><span>{setupRequired.length}</span></header><div className="admin-catalog__proposal-context">{setupRequired.map((item) => <span key={item.propuesta_fingerprint}>{item.c_interno} · {item.producto} · configuración requerida antes de publicar <button type="button" className="button button--secondary" onClick={() => setSetup(item)}>Configurar</button></span>)}</div></section>}
    <section className="admin-catalog__section"><header><div><h2>Productos</h2><p>{products.length} de {masterData.snapshot.totals.products} productos cargados completos.</p></div></header>
      <form className="admin-v2-filters admin-catalog__filters" onSubmit={(event) => event.preventDefault()}><label>Buscar<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Producto, código, marca, categoría o grupo" /></label><label>Estado<select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value as ProductStateFilter); setPage(0) }}><option value="all">Todos</option><option value="incluido">Incluidos</option><option value="excluido">Excluidos</option></select></label><label>Modalidad<select value={modeFilter} onChange={(event) => { setModeFilter(event.target.value as ProductModeFilter); setPage(0) }}><option value="all">Todas</option><option value="Único">Único</option><option value="Agrupado">Agrupado</option><option value="Excluido">Excluido</option></select></label><label>Categoría<select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(0) }}><option value="all">Todas</option>{masterData.snapshot.categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label><label>Orden<select value={sort} onChange={(event) => { setSort(event.target.value as ProductSort); setPage(0) }}><option value="name">Producto</option><option value="code">Código interno</option><option value="price_asc">Precio: menor a mayor</option><option value="price_desc">Precio: mayor a menor</option></select></label></form>
      <div className="admin-v2-table admin-catalog__table"><table><thead><tr><th scope="col">Producto</th><th scope="col">C. interno</th><th scope="col">Categoría</th><th scope="col">Grupo</th><th scope="col">Precio</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>{visible.rows.map((product) => {
        const category = derived.categoryById.get(product.categoria_id)?.nombre ?? '—'
        const group = product.grupo_id ? derived.groupById.get(product.grupo_id)?.nombre ?? '—' : null
        const actionLabel = product.estado === 'Excluido' ? 'Proponer reincorporación' : 'Proponer exclusión'
        const stagedAction = catalog.confirmedProductState(product.c_interno)
        const proposalState = stagedAction ? 'pendiente' : product.propuesta?.estado
        return <tr key={product.c_interno}><th scope="row">{product.producto}</th><td>{product.c_interno}</td><td>{category}</td><td>{group ?? '—'}</td><td className="admin-catalog__money"><Value value={product.precio} money /></td><td>{product.estado === 'Excluido' ? 'Excluido' : 'Incluido'} · {product.estado}{proposalState ? ` · propuesta ${proposalState}` : ''}</td><td><button type="button" className="button button--secondary" disabled={!!proposalState} onClick={() => setSelected(product)}>{proposalState ? 'Propuesta en revisión' : actionLabel}</button></td></tr>
      })}{!products.length && <tr><td colSpan={7}>No hay productos que coincidan con los filtros locales.</td></tr>}</tbody></table></div>
      {products.length > 0 && <div className="admin-control__pagination" aria-label="Paginación de productos"><button type="button" className="button button--secondary" disabled={visible.currentPage === 0} onClick={() => setPage(visible.currentPage - 1)}>Anterior</button><span>Página {visible.currentPage + 1} de {visible.pageCount} · {visible.offset + 1}–{Math.min(visible.offset + visible.rows.length, products.length)} de {products.length}</span><button type="button" className="button button--secondary" disabled={visible.currentPage + 1 >= visible.pageCount} onClick={() => setPage(visible.currentPage + 1)}>Siguiente</button></div>}
    </section>
    {selected && <ProductStateProposal product={selected} groupName={selected.grupo_id ? derived.groupById.get(selected.grupo_id)?.nombre ?? null : null} onClose={() => setSelected(null)} />}
    {setup && <ProductSetupDialog target={setup} onClose={() => setSetup(null)} onComplete={() => setSetup(null)} />}
  </section>
}
