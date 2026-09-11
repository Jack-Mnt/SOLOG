import { supabase } from '../../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError } from '../../errors'

export type MasterDataPayload = Record<string, unknown>
export interface MasterDataRevisions { groups: number; catalog: number; categories: number }
export interface MasterDataCategory { id: string; nombre: string; orden: number }
export interface MasterDataGroup { id: string; nombre: string; categoria_id: string; precio: number; unidades_por_paquete: number | null; precio_paquete: number | null }
export interface MasterDataProposal { tipo: 'excluir_producto' | 'reincorporar_producto' | 'eliminar_producto'; estado: 'pendiente' | 'aprobado'; fingerprint: string }
export interface MasterDataProduct { c_interno: number; producto: string; c_barras: string | null; marca: string | null; precio: number; estado: 'Único' | 'Agrupado' | 'Excluido'; categoria_id: string; grupo_id: string | null; propuesta?: MasterDataProposal }
export interface MasterDataSetupRequired { cambio_id: string; propuesta_fingerprint: string; tipo: 'agregar_producto' | 'reincorporar_producto'; c_interno: number; producto: string; precio: number; block_reason: string }
export interface MasterDataSnapshot { contract_version: 1; generated_at: string; complete: true; categories: MasterDataCategory[]; groups: MasterDataGroup[]; products: MasterDataProduct[]; setup_required: MasterDataSetupRequired[]; totals: { categories: number; groups: number; products: number; included: number; excluded: number }; revisions: MasterDataRevisions }
export interface MasterDataDerived { categoryById: Map<string, MasterDataCategory>; groupById: Map<string, MasterDataGroup>; productsByGroupId: Map<string, MasterDataProduct[]>; memberCountByGroupId: Map<string, number>; derivedTypeByGroupId: Map<string, 'Único' | 'Agrupado'>; categoryCounts: Map<string, { groups: number; products: number }>; compatibleCandidates: (groupId: string) => MasterDataProduct[] }
export type MasterDataMutationAction = 'category_create' | 'category_rename' | 'category_reorder'
export type MasterDataMutation =
  | { operation_id: string; expected_categories_revision: number; nombre: string }
  | { operation_id: string; expected_categories_revision: number; category_id: string; nombre: string }
  | { operation_id: string; expected_categories_revision: number; category_ids: string[] }
export interface MasterDataMutationResult { contract_version: 1; generated_at: string; replay: boolean; result: MasterDataPayload; revisions: MasterDataRevisions }
export class MasterDataContractError extends Error { constructor(message: string, readonly uncertain = false) { super(message); this.name = 'MasterDataContractError' } }

const object = (value: unknown): value is MasterDataPayload => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
// Package validation follows Grupos V1 / Catálogo valorizado: units > 1 and package price > 0.
const positive = (value: unknown) => finite(value) && value > 0
const safeInteger = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value)
const nullableString = (value: unknown) => value === null || typeof value === 'string'
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new MasterDataContractError(message) }
function revisions(value: unknown): asserts value is MasterDataRevisions { assert(object(value) && integer(value.groups) && integer(value.catalog) && integer(value.categories), 'Revisiones Master Data V1 inválidas.') }
function envelope(value: unknown): asserts value is MasterDataPayload & Pick<MasterDataSnapshot, 'contract_version' | 'generated_at' | 'revisions'> { assert(object(value) && value.contract_version === 1 && timestamp(value.generated_at), 'Envelope Master Data V1 inválido.'); revisions(value.revisions) }
function category(value: unknown): value is MasterDataCategory { return object(value) && typeof value.id === 'string' && typeof value.nombre === 'string' && integer(value.orden) }
function group(value: unknown): value is MasterDataGroup { return object(value) && typeof value.id === 'string' && typeof value.nombre === 'string' && typeof value.categoria_id === 'string' && finite(value.precio) && ((value.unidades_por_paquete === null && value.precio_paquete === null) || (integer(value.unidades_por_paquete) && Number(value.unidades_por_paquete) > 1 && positive(value.precio_paquete))) }
function product(value: unknown): value is MasterDataProduct { return object(value) && safeInteger(value.c_interno) && typeof value.producto === 'string' && nullableString(value.c_barras ?? null) && nullableString(value.marca ?? null) && finite(value.precio) && ['Único', 'Agrupado', 'Excluido'].includes(String(value.estado)) && typeof value.categoria_id === 'string' && (value.grupo_id === undefined || value.grupo_id === null || typeof value.grupo_id === 'string') && (value.estado === 'Excluido' || typeof value.grupo_id === 'string') && (value.propuesta === undefined || object(value.propuesta) && ['excluir_producto', 'reincorporar_producto', 'eliminar_producto'].includes(String(value.propuesta.tipo)) && ['pendiente', 'aprobado'].includes(String(value.propuesta.estado)) && typeof value.propuesta.fingerprint === 'string') }
function setup(value: unknown): value is MasterDataSetupRequired { return object(value) && typeof value.cambio_id === 'string' && typeof value.propuesta_fingerprint === 'string' && ['agregar_producto', 'reincorporar_producto'].includes(String(value.tipo)) && safeInteger(value.c_interno) && typeof value.producto === 'string' && finite(value.precio) && typeof value.block_reason === 'string' }
export function validateMasterDataBootstrap(value: unknown): MasterDataSnapshot {
  envelope(value)
  assert(value.complete === true && Array.isArray(value.categories) && value.categories.every(category) && Array.isArray(value.groups) && value.groups.every(group) && Array.isArray(value.products) && value.products.every(product) && Array.isArray(value.setup_required) && value.setup_required.every(setup), 'Bootstrap Master Data V1 inválido.')
  assert(object(value.totals) && integer(value.totals.categories) && integer(value.totals.groups) && integer(value.totals.products) && integer(value.totals.included) && integer(value.totals.excluded) && value.totals.categories === value.categories.length && value.totals.groups === value.groups.length && value.totals.products === value.products.length && Number(value.totals.products) === Number(value.totals.included) + Number(value.totals.excluded), 'Totales Master Data V1 inválidos.')
  assert(new Set(value.categories.map(item => item.id)).size === value.categories.length && new Set(value.groups.map(item => item.id)).size === value.groups.length && new Set(value.products.map(item => item.c_interno)).size === value.products.length, 'Master Data V1 contiene identificadores duplicados.')
  const categories = new Set(value.categories.map(item => item.id)), groups = new Set(value.groups.map(item => item.id))
  assert(value.groups.every(item => categories.has(item.categoria_id)) && value.products.every(item => categories.has(item.categoria_id) && (item.estado === 'Excluido' || item.grupo_id !== null && groups.has(item.grupo_id))), 'Relaciones Master Data V1 inválidas.')
  const products = value.products.map(item => ({
    ...item,
    c_barras: item.c_barras ?? null,
    marca: item.marca ?? null,
    grupo_id: item.grupo_id ?? null,
  })) as MasterDataProduct[]
  return { ...value, products } as unknown as MasterDataSnapshot
}
export function validateMasterDataMutation(action: MasterDataMutationAction, value: unknown): MasterDataMutation {
  assert(object(value) && typeof value.operation_id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.operation_id) && integer(value.expected_categories_revision), 'Payload base Master Data V1 inválido.')
  if (action === 'category_create') assert(typeof value.nombre === 'string' && value.nombre.trim(), 'Payload category_create inválido.')
  if (action === 'category_rename') assert(typeof value.category_id === 'string' && typeof value.nombre === 'string' && value.nombre.trim(), 'Payload category_rename inválido.')
  if (action === 'category_reorder') assert(Array.isArray(value.category_ids) && value.category_ids.length > 0 && value.category_ids.every(id => typeof id === 'string') && new Set(value.category_ids).size === value.category_ids.length, 'Payload category_reorder inválido.')
  return value as MasterDataMutation
}
export function validateMasterDataMutationResult(value: unknown): MasterDataMutationResult { envelope(value); assert(typeof value.replay === 'boolean' && object(value.result), 'Resultado mutación Master Data V1 inválido.'); return value as unknown as MasterDataMutationResult }
export async function masterDataRead(): Promise<MasterDataSnapshot> { if (!supabase) throw createSologConfigurationError(); const { data, error } = await supabase.rpc('rpc_solog_admin_masterdata_read_v1', { p_action: 'bootstrap', p_payload: {} }); if (error) throw normalizeSologError(error); return validateMasterDataBootstrap(data) }
export async function masterDataMutate(action: MasterDataMutationAction, payload: MasterDataMutation): Promise<MasterDataMutationResult> { validateMasterDataMutation(action, payload); if (!supabase) throw createSologConfigurationError(); const { data, error } = await supabase.rpc('rpc_solog_admin_masterdata_v1', { p_action: action, p_payload: payload }); if (error) throw normalizeSologError(error); return validateMasterDataMutationResult(data) }
export function deriveMasterData(snapshot: MasterDataSnapshot): MasterDataDerived {
  const categoryById = new Map(snapshot.categories.map(item => [item.id, item])), groupById = new Map(snapshot.groups.map(item => [item.id, item])), productsByGroupId = new Map<string, MasterDataProduct[]>(), memberCountByGroupId = new Map<string, number>(), derivedTypeByGroupId = new Map<string, 'Único' | 'Agrupado'>(), categoryCounts = new Map(snapshot.categories.map(item => [item.id, { groups: 0, products: 0 }]))
  for (const group of snapshot.groups) categoryCounts.get(group.categoria_id)!.groups++
  for (const item of snapshot.products) { categoryCounts.get(item.categoria_id)!.products++; if (item.grupo_id) { const members = productsByGroupId.get(item.grupo_id) ?? []; members.push(item); productsByGroupId.set(item.grupo_id, members) } }
  for (const [id, members] of productsByGroupId) { memberCountByGroupId.set(id, members.length); derivedTypeByGroupId.set(id, members.length === 1 ? 'Único' : 'Agrupado') }
  return { categoryById, groupById, productsByGroupId, memberCountByGroupId, derivedTypeByGroupId, categoryCounts, compatibleCandidates: groupId => { const target = groupById.get(groupId); return target ? snapshot.products.filter(item => item.estado !== 'Excluido' && item.precio === target.precio) : [] } }
}
