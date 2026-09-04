import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError } from '../errors'
import type { CatalogPublicationPreview, SologCatalogChangeRow, SologCatalogChangeCounts, SologGroupChangePayload, SologCatalogNewProductConfig } from '../types'

export type CatalogChange = Omit<SologCatalogChangeRow, 'tipo' | 'ambito'> & { tipo: SologCatalogChangeRow['tipo'] | 'clasificacion_producto' | 'definicion_grupo'; ambito: 'producto' | 'grupo' }
export type Domain = 'master' | 'incidents' | 'devices'
export type Payload = Record<string, unknown>
export interface ManagementEnvelope { contract_version: 2; generated_at: string }
export interface Revisions { groups?: number; catalog?: number; incidents?: number; devices?: number }
export interface MasterEnvelope extends ManagementEnvelope { revisions: { groups: number; catalog: number } }
export interface MasterReference extends MasterEnvelope {
  categories: { id: string; nombre: string; orden: number }[]
  groups: { id: string; nombre: string; categoria_id: string; categoria: string; precio: number; unidades_por_paquete: number | null; precio_paquete: number | null }[]
}
export interface GroupProduct { c_interno: number; producto: string; marca: string | null; precio: number; estado: 'Único' | 'Agrupado' | 'Excluido' }
export interface MasterGroup { id: string; nombre: string; categoria_id: string; categoria: string; precio: number; activo: boolean; tipo: 'Único' | 'Agrupado'; sku_count: number; integrantes: GroupProduct[]; propuestas: Payload[] }
export interface MasterProduct extends GroupProduct { categoria_id: string; categoria: string; grupo_id: string | null; grupo: string | null; propuesta: Payload | null }
export interface MasterPage<T> extends MasterEnvelope { rows: T[]; limit: number; offset: number }
export interface PriceOptions extends MasterEnvelope { propuesta_fingerprint: string; change_id: string | null; change_state: string; grupo_id: string; c_interno: number; nuevo_precio: number; unidades_por_paquete: number | null; members: { c_interno: number; producto: string; precio: number }[]; options: ('update_group_price' | 'separate_sku')[] }
export interface Family { family_key: string; tipo: string; c_interno: number | null; c_interno_original: string | null; datos: Payload; representative_id: string; representative_site_id: string; cases: number; occurrences: number; sites: number; pending_cases: number; suppressed_cases: number; first_seen_at: string; last_seen_at: string; active_suppression_until: string | null; deletion_proposed: boolean }
export interface Incident { id: string; sede_id: string; sede: string; c_interno: number | null; c_interno_original: string | null; tipo: string; estado: string; datos: Payload; first_seen_at: string; last_seen_at: string; occurrence_count: number; primer_snapshot_id: string | null; ultimo_snapshot_id: string | null }
export interface Device { id: string; site_id: string; site: string; estado: 'pendiente' | 'autorizado'; solicitado_por: string; solicitante: string; solicitado_at: string; autorizado_at: string | null; revocado_at: string | null; ultimo_acceso_at: string | null; revision: number }
export interface Reads {
  status: MasterEnvelope & { catalog: { version_actual: number | null; publicado_at: string | null } }
  reference: MasterReference
  groups: MasterPage<MasterGroup>
  group_products: MasterPage<MasterProduct>
  catalog_changes: MasterPage<CatalogChange> & { counts: SologCatalogChangeCounts }
  publication_preview: MasterEnvelope & { preview: CatalogPublicationPreview }
  price_mismatch_options: PriceOptions
  summary: ManagementEnvelope & { site_id: string | null; period: { from: string; to: string }; families: Family[]; revisions: { incidents: number } }
  detail: ManagementEnvelope & { site_id: string | null; family_key: string; items: Incident[]; page: number; page_size: number; revisions: { incidents: number } }
  list: ManagementEnvelope & { devices: Device[] }
}
export type ReadAction = keyof Reads
type Page = { limit: number; offset: number }
export interface ReadPayloads {
  status: Record<string, never>; reference: Record<string, never>; publication_preview: Record<string, never>
  groups: Page & { categoria_id?: string; precio?: number; tipo?: 'Único' | 'Agrupado'; buscar?: string }
  group_products: Page & { categoria_id?: string; grupo_id?: string; estado?: GroupProduct['estado']; buscar?: string }
  catalog_changes: Page & { c_interno?: number; tipo?: CatalogChange['tipo']; estado?: SologCatalogChangeRow['estado']; producto?: string; ambito?: 'producto' | 'grupo' }
  price_mismatch_options: { propuesta_fingerprint: string }
  summary: { site_id?: string }; detail: { family_key: string; site_id?: string; page: number; page_size: number }; list: { site_id?: string }
}
export interface Mutations {
  group_change_save: SologGroupChangePayload & { member_codes?: number[] }
  catalog_change_action: { propuesta_fingerprint: string; action: 'approve' | 'ignore' | 'withdraw' } & Partial<SologCatalogNewProductConfig>
  resolve_group_price: { propuesta_fingerprint: string; resolution: 'update_group_price' | 'separate_sku' }
  update_package_price: { grupo_id: string; precio_paquete: number }
  ignore_30d: { family_key: string; scope: 'global' | 'site'; site_id?: string }
  reactivate: Mutations['ignore_30d']; propose_delete: Mutations['ignore_30d']
  authorize: { device_id: string }; replace: { device_id: string }; revoke: { device_id: string }; reject: { device_id: string }
}
export type MutationAction = keyof Mutations
export interface MutationResult extends ManagementEnvelope { replay: boolean; revisions: Revisions; result?: Payload; status?: string; site_id?: string | null; family_key?: string; scope?: string; until?: string; cambio_catalogo_id?: string; action?: string; authorized_device?: { id: string; estado: string; autorizado_at: string; ultimo_acceso_at: string | null } | null; pending_devices?: { id: string; estado: string; solicitado_por: string; solicitado_at: string; ultimo_acceso_at: string | null }[] }
export interface PublicationResult { ok: boolean; codigo: string; operation_id?: string; replay?: boolean; completion_recorded?: boolean; version?: number; productos?: number; grupos_activos?: number; cambios_incorporados?: number; detalle?: string }
export function domain(action: ReadAction | MutationAction): Domain {
  if (['summary', 'detail', 'ignore_30d', 'reactivate', 'propose_delete'].includes(action)) return 'incidents'
  if (['list', 'authorize', 'replace', 'revoke', 'reject'].includes(action)) return 'devices'
  return 'master'
}
export class ManagementError extends Error { constructor(readonly code: string, readonly uncertain = false) { super(code) } }
const object = (v: unknown): v is Payload => !!v && typeof v === 'object' && !Array.isArray(v)
const revision = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
function envelope(v: unknown): asserts v is Payload {
  if (!object(v) || v.contract_version !== 2 || typeof v.generated_at !== 'string' || !Number.isFinite(Date.parse(v.generated_at))) throw new ManagementError('Respuesta incompatible con contrato v2')
}
export function validateRead<A extends ReadAction>(action: A, value: unknown): Reads[A] {
  envelope(value)
  const d = domain(action)
  if (action !== 'list' && (!object(value.revisions) || !(d === 'master' ? revision(value.revisions.groups) && revision(value.revisions.catalog) : revision(value.revisions.incidents)))) throw new ManagementError('Revisiones incompletas')
  const rows = action === 'summary' ? value.families : action === 'detail' ? value.items : action === 'list' ? value.devices : ['groups', 'group_products', 'catalog_changes'].includes(action) ? value.rows : null
  if (rows !== null && (!Array.isArray(rows) || !rows.every(object))) throw new ManagementError('Lista incompatible con contrato v2')
  if (['groups', 'group_products', 'catalog_changes'].includes(action) && (!revision(value.offset) || !revision(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 50 || (rows as unknown[]).length > Number(value.limit))) throw new ManagementError('Paginación maestra incompatible')
  if (action === 'status' && (!object(value.catalog) || !('version_actual' in value.catalog))) throw new ManagementError('Status incompatible')
  if (action === 'reference' && (!Array.isArray(value.categories) || !Array.isArray(value.groups))) throw new ManagementError('Reference incompatible')
  if (action === 'publication_preview' && (!object(value.preview) || typeof value.preview.ok !== 'boolean' || typeof value.preview.puede_publicar !== 'boolean')) throw new ManagementError('Preview incompatible')
  if (action === 'price_mismatch_options' && (!Array.isArray(value.options) || !Array.isArray(value.members) || typeof value.grupo_id !== 'string')) throw new ManagementError('Opciones incompatibles')
  if (action === 'list' && !(value.devices as Payload[]).every(v => typeof v.id === 'string' && typeof v.site_id === 'string' && revision(v.revision) && ['pendiente', 'autorizado'].includes(String(v.estado)))) throw new ManagementError('Dispositivos incompatibles')
  if (action === 'summary' && (!object(value.period) || typeof value.period.from !== 'string' || typeof value.period.to !== 'string' || !Number.isFinite(Date.parse(value.period.to)) || !(value.families as Payload[]).every(v => typeof v.family_key === 'string' && ['cases', 'occurrences', 'sites', 'pending_cases', 'suppressed_cases'].every(k => revision(v[k]))))) throw new ManagementError('Familias incompatibles')
  if (action === 'detail' && (!revision(value.page) || !revision(value.page_size) || Number(value.page_size) < 1 || Number(value.page_size) > 100)) throw new ManagementError('Página incompatible')
  return value as unknown as Reads[A]
}
export async function managementRead<A extends ReadAction>(action: A, payload: ReadPayloads[A]): Promise<Reads[A]> {
  if (!supabase) throw createSologConfigurationError()
  const d = domain(action)
  const rpc = d === 'master' ? action === 'price_mismatch_options' ? 'rpc_solog_admin_master_v2' : 'rpc_solog_admin_master_read_v2' : `rpc_solog_admin_${d}_v2`
  const { data, error } = await supabase.rpc(rpc, { p_action: action, p_payload: payload })
  if (error) throw normalizeSologError(error)
  return validateRead(action, data)
}
export async function managementMutate(action: MutationAction, payload: Payload): Promise<MutationResult> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc(`rpc_solog_admin_${domain(action)}_v2`, { p_action: action, p_payload: payload })
  if (error) throw normalizeSologError(error)
  envelope(data)
  if (typeof data.replay !== 'boolean' || !object(data.revisions) || !Object.values(data.revisions).every(revision)) throw new ManagementError('Mutación incompatible', true)
  const d = domain(action)
  if (!(d === 'master' ? revision(data.revisions.groups) && revision(data.revisions.catalog) && object(data.result) : d === 'devices' ? revision(data.revisions.devices) && Array.isArray(data.pending_devices) && 'authorized_device' in data : revision(data.revisions.incidents) && typeof data.status === 'string')) throw new ManagementError('Estado autoritativo incompleto', true)
  return data as unknown as MutationResult
}
export async function publishManagement(operationId: string): Promise<PublicationResult> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.functions.invoke('conexion-admin', { body: { action: 'publish_catalog', operation_id: operationId } })
  let response: unknown = data
  if (error && 'context' in error && error.context instanceof Response) {
    try { response = await error.context.clone().json() } catch { /* Preserve ambiguous operation for retry. */ }
  }
  return validatePublication(response, operationId)
}
export function validatePublication(response: unknown, operationId: string): PublicationResult {
  if (!object(response) || typeof response.codigo !== 'string' || typeof response.ok !== 'boolean') throw new ManagementError('Publicación sin confirmación. Reintenta la misma operación.', true)
  if (!response.ok) {
    // Edge v4: failed ledger => replay:true; rejected begin => resultado preview.
    // A first error is not proof that the fail transition itself was committed.
    const terminal = response.operation_id === operationId && (response.replay === true || object(response.resultado) && response.resultado.ok === false)
    throw new ManagementError(response.codigo, !terminal)
  }
  if (response.operation_id !== operationId) throw new ManagementError('Publicación de otra operación', true)
  return response as unknown as PublicationResult
}
