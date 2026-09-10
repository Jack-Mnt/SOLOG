import { supabase } from '../../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError } from '../../errors'

export type CatalogPayload = Record<string, unknown>
export type CatalogProposalStatus = 'pendiente' | 'aprobado' | 'ignorado' | 'incorporado'
export type CatalogProposalType = 'agregar_producto' | 'eliminar_producto' | 'excluir_producto' | 'reincorporar_producto' | 'nombre' | 'precio' | 'codigo'
export type CatalogProposalSection = 'urgente' | 'emergente'
export type CatalogMode = 'Único' | 'Agrupado' | 'Excluido'

export interface CatalogRevisions { catalog: number; groups: number }
export interface CatalogEnvelope { contract_version: 3; generated_at: string; revisions: CatalogRevisions }
export interface CatalogCategory { id: string; nombre: string; orden: number }
export interface CatalogGroup { id: string; nombre: string; categoria_id: string; categoria: string; precio: number; unidades_por_paquete: number | null; precio_paquete: number | null }
export interface CatalogCurrentProduct { producto: string | null; c_barras: string | null; precio: number | null; marca: string | null; estado: CatalogMode | null; categoria: string | null; grupo: string | null }
export interface CatalogProposal {
  propuesta_fingerprint: string; cambio_id: string | null; c_interno: number; tipo: CatalogProposalType; estado: CatalogProposalStatus; seccion: CatalogProposalSection; datos: CatalogPayload; producto: string | null; sedes: { id: string; nombre: string }[]; occurrence_count: number; first_seen_at: string; last_seen_at: string; catalogo_actual: CatalogCurrentProduct; stale: boolean; publicable: boolean | null; block_reason: string | null; setup: CatalogPayload | null; price_resolution: CatalogPayload | null; aprobado_at: string | null; ignorado_at: string | null; version_aplicada: number | null; incorporado_at: string | null
}
export interface CatalogProduct { c_interno: number; producto: string; c_barras: string | null; precio: number; marca: string | null; estado_catalogo: 'incluido' | 'excluido'; modo: CatalogMode; categoria_id: string; categoria: string; grupo_id: string | null; grupo: string | null; unidades_por_paquete: number | null; precio_paquete: number | null; propuesta_estado: CatalogProposalStatus | null }
export interface CatalogSetupRequired { cambio_id: string; propuesta_fingerprint: string; tipo: 'agregar_producto' | 'reincorporar_producto'; c_interno: number; producto: string; precio: number; setup: null; block_reason: 'configuracion_requerida' }

export interface CatalogReads {
  status: CatalogEnvelope & { catalog: { version_actual: number | null; publicado_at: string | null; incluidos: number; excluidos: number; total: number } }
  reference: CatalogEnvelope & { categories: CatalogCategory[]; groups: CatalogGroup[] }
  proposals: CatalogEnvelope & { estado: CatalogProposalStatus; rows: CatalogProposal[]; total: number; complete: true; counts: Record<CatalogProposalStatus, number> }
  products: CatalogEnvelope & { rows: CatalogProduct[]; total: number; complete: true; setup_required: CatalogSetupRequired[] }
  price_options: CatalogEnvelope & { propuesta_fingerprint: string; change_id: string | null; change_state: CatalogProposalStatus; grupo: Pick<CatalogGroup, 'id' | 'nombre' | 'precio' | 'unidades_por_paquete' | 'precio_paquete'>; c_interno: number; nuevo_precio: number; members: { c_interno: number; producto: string; precio: number }[]; options: Array<'update_group_price' | 'separate_sku' | 'keep_structure'>; package_decision_required: boolean; prepared_resolution: CatalogPayload | null }
  publication_preview: CatalogEnvelope & { preview: { ok: boolean; codigo: string; version_actual: number | null; version_nueva: number | null; schema_version: number; sku_actuales: number; sku_resultantes: number; cambios_total: number; cambios: Record<CatalogProposalType, number>; change_ids: string[]; conflictos: CatalogPayload[]; errores: string[] } }
}
export interface CatalogReadPayloads { status: Record<string, never>; reference: Record<string, never>; proposals: { estado?: CatalogProposalStatus }; products: Record<string, never>; price_options: { propuesta_fingerprint: string }; publication_preview: Record<string, never> }
export type CatalogReadAction = keyof CatalogReads

interface CatalogMutationBase { operation_id: string; expected_catalog_revision: number; expected_groups_revision: number }
export interface CatalogMutations {
  proposal_action: CatalogMutationBase & { propuesta_fingerprint: string; action: 'approve' | 'ignore' | 'withdraw' }
  propose_product_state: CatalogMutationBase & { c_interno: number; action: 'exclude' | 'reincorporate' }
  prepare_product: CatalogMutationBase & ({ propuesta_fingerprint: string; mode: 'existing_group'; grupo_id: string; marca?: string | null } | { propuesta_fingerprint: string; mode: 'new_unit'; categoria_id: string; marca?: string | null })
  prepare_price: CatalogMutationBase & ({ propuesta_fingerprint: string; resolution: 'separate_sku' } | { propuesta_fingerprint: string; resolution: 'update_group_price' | 'keep_structure'; package_action: 'keep' } | { propuesta_fingerprint: string; resolution: 'update_group_price' | 'keep_structure'; package_action: 'update'; precio_paquete: number })
}
export type CatalogMutationAction = keyof CatalogMutations
export interface CatalogMutationResult extends CatalogEnvelope { replay: boolean; result: CatalogPayload }
export interface CatalogPublicationResult { ok: true; codigo: string; operation_id: string; replay: boolean; completion_recorded: boolean; version: number; hash: string; storage_path: string; productos: number; grupos_activos: number; cambios_incorporados: number }
export class CatalogPublicationError extends Error { constructor(readonly code: string, readonly uncertain = false) { super(code); this.name = 'CatalogPublicationError' } }
export class CatalogContractError extends Error { constructor(message: string) { super(message); this.name = 'CatalogContractError' } }

const statuses = ['pendiente', 'aprobado', 'ignorado', 'incorporado'] as const
const types = ['agregar_producto', 'eliminar_producto', 'excluir_producto', 'reincorporar_producto', 'nombre', 'precio', 'codigo'] as const
const modes = ['Único', 'Agrupado', 'Excluido'] as const
const object = (value: unknown): value is CatalogPayload => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'
const inSet = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && values.includes(value as T)
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new CatalogContractError(message) }

function envelope(value: unknown): asserts value is CatalogEnvelope & CatalogPayload {
  assert(object(value) && value.contract_version === 3 && timestamp(value.generated_at) && object(value.revisions) && integer(value.revisions.catalog) && integer(value.revisions.groups), 'Envelope Catálogo V3 inválido.')
}
function group(value: unknown, needsCategory = true) {
  assert(object(value) && typeof value.id === 'string' && typeof value.nombre === 'string' && number(value.precio) && (value.unidades_por_paquete === null || integer(value.unidades_por_paquete)) && (value.precio_paquete === null || number(value.precio_paquete)) && (!needsCategory || typeof value.categoria_id === 'string' && typeof value.categoria === 'string'), 'Grupo Catálogo V3 inválido.')
}
function complete(rows: unknown, total: unknown, isComplete: unknown, label: string): asserts rows is unknown[] {
  assert(Array.isArray(rows) && rows.length <= 10_000 && integer(total) && isComplete === true && total === rows.length, `${label} Catálogo V3 incompleto o truncado.`)
}
function proposal(value: unknown) {
  assert(object(value) && typeof value.propuesta_fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(value.propuesta_fingerprint) && nullableString(value.cambio_id) && integer(value.c_interno) && inSet(value.tipo, types) && inSet(value.estado, statuses) && inSet(value.seccion, ['urgente', 'emergente']) && object(value.datos) && nullableString(value.producto) && Array.isArray(value.sedes) && value.sedes.every(site => object(site) && typeof site.id === 'string' && typeof site.nombre === 'string') && integer(value.occurrence_count) && timestamp(value.first_seen_at) && timestamp(value.last_seen_at) && object(value.catalogo_actual) && nullableString(value.catalogo_actual.producto) && nullableString(value.catalogo_actual.c_barras) && (value.catalogo_actual.precio === null || number(value.catalogo_actual.precio)) && nullableString(value.catalogo_actual.marca) && (value.catalogo_actual.estado === null || inSet(value.catalogo_actual.estado, modes)) && nullableString(value.catalogo_actual.categoria) && nullableString(value.catalogo_actual.grupo) && typeof value.stale === 'boolean' && (value.publicable === null || typeof value.publicable === 'boolean') && nullableString(value.block_reason) && (value.setup === null || object(value.setup)) && (value.price_resolution === null || object(value.price_resolution)) && nullableString(value.aprobado_at) && nullableString(value.ignorado_at) && (value.version_aplicada === null || integer(value.version_aplicada)) && nullableString(value.incorporado_at), 'Propuesta Catálogo V3 inválida.')
  assert(value.estado === 'aprobado' ? typeof value.publicable === 'boolean' : value.publicable === null, 'publicable no corresponde al estado de la propuesta.')
}
function product(value: unknown) {
  assert(object(value) && integer(value.c_interno) && typeof value.producto === 'string' && nullableString(value.c_barras) && number(value.precio) && nullableString(value.marca) && inSet(value.estado_catalogo, ['incluido', 'excluido']) && inSet(value.modo, modes) && typeof value.categoria_id === 'string' && typeof value.categoria === 'string' && nullableString(value.grupo_id) && nullableString(value.grupo) && (value.unidades_por_paquete === null || integer(value.unidades_por_paquete)) && (value.precio_paquete === null || number(value.precio_paquete)) && (value.propuesta_estado === null || inSet(value.propuesta_estado, statuses)), 'Producto Catálogo V3 inválido.')
}

export function validateCatalogRead<A extends CatalogReadAction>(action: A, value: unknown): CatalogReads[A] {
  envelope(value)
  const response = value as CatalogPayload
  if (action === 'status') {
    const catalog = response.catalog
    assert(object(catalog) && (catalog.version_actual === null || integer(catalog.version_actual)) && (catalog.publicado_at === null || timestamp(catalog.publicado_at)) && integer(catalog.incluidos) && integer(catalog.excluidos) && integer(catalog.total) && catalog.total === catalog.incluidos + catalog.excluidos, 'Status Catálogo V3 inválido.')
  }
  if (action === 'reference') {
    assert(Array.isArray(response.categories) && Array.isArray(response.groups), 'Reference Catálogo V3 inválido.')
    response.categories.forEach(category => assert(object(category) && typeof category.id === 'string' && typeof category.nombre === 'string' && integer(category.orden), 'Categoría Catálogo V3 inválida.'))
    response.groups.forEach(item => group(item))
  }
  if (action === 'proposals') {
    complete(response.rows, response.total, response.complete, 'Propuestas')
    const counts = response.counts
    assert(inSet(response.estado, statuses) && object(counts) && statuses.every(status => integer(counts[status])), 'Resumen de propuestas Catálogo V3 inválido.')
    response.rows.forEach(proposal)
  }
  if (action === 'products') {
    complete(response.rows, response.total, response.complete, 'Productos')
    assert(Array.isArray(response.setup_required), 'setup_required Catálogo V3 inválido.')
    response.rows.forEach(product)
    response.setup_required.forEach(item => assert(object(item) && typeof item.cambio_id === 'string' && typeof item.propuesta_fingerprint === 'string' && inSet(item.tipo, ['agregar_producto', 'reincorporar_producto']) && integer(item.c_interno) && typeof item.producto === 'string' && number(item.precio) && item.setup === null && item.block_reason === 'configuracion_requerida', 'Elemento setup_required Catálogo V3 inválido.'))
  }
  if (action === 'price_options') {
    assert(typeof response.propuesta_fingerprint === 'string' && nullableString(response.change_id) && inSet(response.change_state, statuses) && integer(response.c_interno) && number(response.nuevo_precio) && Array.isArray(response.members) && Array.isArray(response.options) && response.options.every(option => inSet(option, ['update_group_price', 'separate_sku', 'keep_structure'])) && typeof response.package_decision_required === 'boolean' && (response.prepared_resolution === null || object(response.prepared_resolution)), 'Opciones de precio Catálogo V3 inválidas.')
    group(response.grupo, false)
    response.members.forEach(member => assert(object(member) && integer(member.c_interno) && typeof member.producto === 'string' && number(member.precio), 'Miembro de grupo Catálogo V3 inválido.'))
  }
  if (action === 'publication_preview') {
    assert(object(response.preview), 'Preview Catálogo V3 inválido.')
    const preview = response.preview
    const changes = preview.cambios
    assert(typeof preview.ok === 'boolean' && typeof preview.codigo === 'string' && (preview.version_actual === null || integer(preview.version_actual)) && (preview.version_nueva === null || integer(preview.version_nueva)) && integer(preview.schema_version) && integer(preview.sku_actuales) && integer(preview.sku_resultantes) && integer(preview.cambios_total) && object(changes) && types.every(type => integer(changes[type])) && Array.isArray(preview.change_ids) && preview.change_ids.every(id => typeof id === 'string') && Array.isArray(preview.conflictos) && preview.conflictos.every(object) && Array.isArray(preview.errores) && preview.errores.every(error => typeof error === 'string'), 'Preview Catálogo V3 inválido.')
  }
  return value as unknown as CatalogReads[A]
}

export function validateCatalogMutationPayload(action: CatalogMutationAction, value: unknown) {
  assert(object(value) && typeof value.operation_id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.operation_id) && integer(value.expected_catalog_revision) && integer(value.expected_groups_revision), 'Payload base Catálogo V3 inválido.')
  if (action === 'proposal_action') assert(typeof value.propuesta_fingerprint === 'string' && inSet(value.action, ['approve', 'ignore', 'withdraw']), 'Payload proposal_action inválido.')
  if (action === 'propose_product_state') assert(integer(value.c_interno) && inSet(value.action, ['exclude', 'reincorporate']), 'Payload propose_product_state inválido.')
  if (action === 'prepare_product') assert(typeof value.propuesta_fingerprint === 'string' && inSet(value.mode, ['existing_group', 'new_unit']) && (value.marca === undefined || nullableString(value.marca)) && (value.mode === 'existing_group' ? typeof value.grupo_id === 'string' : typeof value.categoria_id === 'string'), 'Payload prepare_product inválido.')
  if (action === 'prepare_price') {
    assert(typeof value.propuesta_fingerprint === 'string' && inSet(value.resolution, ['update_group_price', 'separate_sku', 'keep_structure']), 'Payload prepare_price inválido.')
    if (value.resolution !== 'separate_sku') assert(inSet(value.package_action, ['keep', 'update']) && (value.package_action !== 'update' || number(value.precio_paquete) && value.precio_paquete > 0), 'Decisión de precio xN inválida.')
  }
}
export function validateCatalogMutation(value: unknown): CatalogMutationResult {
  envelope(value)
  assert(typeof value.replay === 'boolean' && object(value.result), 'Mutación Catálogo V3 inválida.')
  return value as unknown as CatalogMutationResult
}
export async function catalogRead<A extends CatalogReadAction>(action: A, payload: CatalogReadPayloads[A]): Promise<CatalogReads[A]> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc('rpc_solog_admin_catalog_read_v3', { p_action: action, p_payload: payload })
  if (error) throw normalizeSologError(error)
  return validateCatalogRead(action, data)
}
export async function catalogMutate<A extends CatalogMutationAction>(action: A, payload: CatalogMutations[A]): Promise<CatalogMutationResult> {
  validateCatalogMutationPayload(action, payload)
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc('rpc_solog_admin_catalog_v3', { p_action: action, p_payload: payload })
  if (error) throw normalizeSologError(error)
  return validateCatalogMutation(data)
}

export function validateCatalogPublication(value: unknown, operationId: string): CatalogPublicationResult {
  if (!object(value) || typeof value.ok !== 'boolean' || typeof value.codigo !== 'string') throw new CatalogPublicationError('Publicación sin confirmación. Reintenta la misma operación.', true)
  if (!value.ok) {
    const terminal = value.operation_id === operationId && (value.replay === true || object(value.resultado) && value.resultado.ok === false)
    throw new CatalogPublicationError(value.codigo, !terminal)
  }
  if (value.operation_id !== operationId) throw new CatalogPublicationError('Publicación de otra operación.', true)
  if (typeof value.replay !== 'boolean' || typeof value.completion_recorded !== 'boolean' || !integer(value.version) || typeof value.hash !== 'string' || typeof value.storage_path !== 'string' || !integer(value.productos) || !integer(value.grupos_activos) || !integer(value.cambios_incorporados)) throw new CatalogPublicationError('Respuesta de publicación Catálogo V3 incompleta.', true)
  return value as unknown as CatalogPublicationResult
}
export async function publishCatalog(operationId: string): Promise<CatalogPublicationResult> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.functions.invoke('conexion-admin', { body: { action: 'publish_catalog', operation_id: operationId } })
  let response: unknown = data
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try { response = await error.context.clone().json() } catch { /* Preserve the operation for retry. */ }
  }
  return validateCatalogPublication(response, operationId)
}
