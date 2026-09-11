import { supabase } from '../../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError } from '../../errors'

export type GroupsPayload = Record<string, unknown>
export interface GroupsRevisions { groups: number; catalog: number }
export interface GroupsEnvelope { contract_version: 1; generated_at: string; revisions: GroupsRevisions }
export interface GroupsCategory { id: string; nombre: string; orden: number }
export interface GroupsGroup { id: string; nombre: string; categoria_id: string; categoria: string; precio: number; unidades_por_paquete: number | null; precio_paquete: number | null; tipo: 'Único' | 'Agrupado'; member_count: number }
export interface GroupsMember { c_interno: number; producto: string; marca: string | null; precio: number; categoria_id: string; categoria?: string; estado: 'Único' | 'Agrupado' }
export interface GroupsProduct extends GroupsMember { categoria: string; grupo_id: string; grupo: string }
export interface GroupsReads {
  status: GroupsEnvelope & { groups_active: number; groups_unique: number; groups_grouped: number }
  reference: GroupsEnvelope & { categories: GroupsCategory[] }
  groups: GroupsEnvelope & { rows: GroupsGroup[]; limit: number; offset: number }
  group_detail: GroupsEnvelope & { group: GroupsGroup; members: GroupsMember[] }
  products: GroupsEnvelope & { rows: GroupsProduct[]; limit: number; offset: number }
}
export type GroupsReadAction = keyof GroupsReads
export interface GroupsReadPayloads {
  status: Record<string, never>
  reference: Record<string, never>
  groups: { buscar?: string; categoria_id?: string; tipo?: GroupsGroup['tipo']; limit?: number; offset?: number }
  group_detail: { grupo_id: string }
  products: { buscar?: string; grupo_id?: string; exclude_group_id?: string; precio?: number; limit?: number; offset?: number }
}
export interface GroupsMutationBase { operation_id: string; expected_groups_revision: number; expected_catalog_revision: number }
export interface GroupsMutations {
  group_create: GroupsMutationBase & { nombre: string; categoria_id: string; member_codes: number[] }
  group_update: GroupsMutationBase & { grupo_id: string; nombre: string; categoria_id: string }
  membership_move: GroupsMutationBase & { grupo_destino_id: string; member_codes: number[] }
  make_unique: GroupsMutationBase & { c_interno: number }
  valuation_save: GroupsMutationBase & ({ grupo_id: string; enabled: true; unidades_por_paquete: number; precio_paquete: number } | { grupo_id: string; enabled: false })
}
export type GroupsMutationAction = keyof GroupsMutations
export interface GroupsMutationResult extends GroupsEnvelope { replay: boolean; result: GroupsPayload }

export class GroupsContractError extends Error { constructor(message: string, readonly uncertain = false) { super(message) } }
const object = (value: unknown): value is GroupsPayload => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const uniquePositiveCodes = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(code => integer(code) && Number(code) > 0) && new Set(value).size === value.length
function envelope(value: unknown): asserts value is GroupsEnvelope & GroupsPayload {
  if (!object(value) || value.contract_version !== 1 || !timestamp(value.generated_at) || !object(value.revisions) || !integer(value.revisions.groups) || !integer(value.revisions.catalog)) throw new GroupsContractError('Envelope Grupos V1 inválido.')
}
function group(value: unknown): value is GroupsGroup {
  return object(value) && typeof value.id === 'string' && typeof value.nombre === 'string' && typeof value.categoria_id === 'string' && typeof value.categoria === 'string' && positive(value.precio) && ((value.unidades_por_paquete === null && value.precio_paquete === null) || (integer(value.unidades_por_paquete) && Number(value.unidades_por_paquete) > 1 && positive(value.precio_paquete))) && ['Único', 'Agrupado'].includes(String(value.tipo)) && integer(value.member_count) && Number(value.member_count) > 0 && (value.tipo === 'Único' ? Number(value.member_count) === 1 : Number(value.member_count) >= 2)
}
function member(value: unknown): value is GroupsMember {
  return object(value) && integer(value.c_interno) && Number(value.c_interno) > 0 && typeof value.producto === 'string' && (value.marca === null || typeof value.marca === 'string') && positive(value.precio) && typeof value.categoria_id === 'string' && (value.categoria === undefined || typeof value.categoria === 'string') && ['Único', 'Agrupado'].includes(String(value.estado))
}
function product(value: unknown): value is GroupsProduct {
  return member(value) && object(value) && typeof value.categoria === 'string' && typeof value.grupo_id === 'string' && typeof value.grupo === 'string'
}
function page(value: GroupsPayload, rows: unknown) {
  return integer(value.limit) && Number(value.limit) >= 1 && Number(value.limit) <= 100 && integer(value.offset) && Array.isArray(rows) && rows.length <= Number(value.limit)
}
export function validateGroupsRead<A extends GroupsReadAction>(action: A, value: unknown): GroupsReads[A] {
  envelope(value)
  if (action === 'status' && (!integer(value.groups_active) || !integer(value.groups_unique) || !integer(value.groups_grouped))) throw new GroupsContractError('Status Grupos V1 inválido.')
  if (action === 'reference' && (!Array.isArray(value.categories) || !value.categories.every(category => object(category) && typeof category.id === 'string' && typeof category.nombre === 'string' && integer(category.orden)))) throw new GroupsContractError('Reference Grupos V1 inválido.')
  if (action === 'groups' && (!page(value, value.rows) || !(value.rows as unknown[]).every(group))) throw new GroupsContractError('Lista Grupos V1 inválida.')
  if (action === 'group_detail' && (!group(value.group) || !Array.isArray(value.members) || !(value.members as unknown[]).every(member) || value.members.length !== value.group.member_count)) throw new GroupsContractError('Detalle Grupos V1 inválido.')
  if (action === 'products' && (!page(value, value.rows) || !(value.rows as unknown[]).every(product))) throw new GroupsContractError('Candidatos Grupos V1 inválidos.')
  return value as unknown as GroupsReads[A]
}
export function validateGroupsMutation<A extends GroupsMutationAction>(action: A, value: unknown): GroupsMutations[A] {
  if (!object(value) || typeof value.operation_id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.operation_id) || !integer(value.expected_groups_revision) || !integer(value.expected_catalog_revision)) throw new GroupsContractError('Payload base Grupos V1 inválido.')
  if (action === 'group_create' && !(typeof value.nombre === 'string' && value.nombre.trim() && typeof value.categoria_id === 'string' && uniquePositiveCodes(value.member_codes) && (value.member_codes as unknown[]).length >= 2)) throw new GroupsContractError('Payload group_create inválido.')
  if (action === 'group_update' && !(typeof value.grupo_id === 'string' && typeof value.nombre === 'string' && value.nombre.trim() && typeof value.categoria_id === 'string')) throw new GroupsContractError('Payload group_update inválido.')
  if (action === 'membership_move' && !(typeof value.grupo_destino_id === 'string' && uniquePositiveCodes(value.member_codes))) throw new GroupsContractError('Payload membership_move inválido.')
  if (action === 'make_unique' && !(integer(value.c_interno) && Number(value.c_interno) > 0)) throw new GroupsContractError('Payload make_unique inválido.')
  if (action === 'valuation_save' && !(typeof value.grupo_id === 'string' && typeof value.enabled === 'boolean' && (!value.enabled || integer(value.unidades_por_paquete) && Number(value.unidades_por_paquete) > 1 && positive(value.precio_paquete)))) throw new GroupsContractError('Payload valuation_save inválido.')
  return value as unknown as GroupsMutations[A]
}
export function validateGroupsMutationResult(value: unknown): GroupsMutationResult {
  envelope(value)
  if (typeof value.replay !== 'boolean' || !object(value.result)) throw new GroupsContractError('Respuesta de mutación Grupos V1 inválida.', true)
  return value as unknown as GroupsMutationResult
}
export async function groupsRead<A extends GroupsReadAction>(action: A, payload: GroupsReadPayloads[A]): Promise<GroupsReads[A]> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc('rpc_solog_admin_groups_read_v1', { p_action: action, p_payload: payload })
  if (error) throw normalizeSologError(error)
  return validateGroupsRead(action, data)
}
export async function groupsMutate<A extends GroupsMutationAction>(action: A, payload: GroupsMutations[A]): Promise<GroupsMutationResult> {
  validateGroupsMutation(action, payload)
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc('rpc_solog_admin_groups_v1', { p_action: action, p_payload: payload })
  if (error) throw normalizeSologError(error)
  return validateGroupsMutationResult(data)
}
