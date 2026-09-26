import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError } from '../errors'
export type Domain = 'incidents' | 'devices'
export type Payload = Record<string, unknown>
export interface ManagementEnvelope { contract_version: 2; generated_at: string }
export interface Revisions { catalog?: number; incidents?: number; incidents_global?: number; devices?: number }
export const incidentTypes = ['producto_ausente', 'codigo_interno_invalido', 'codigo_interno_duplicado', 'stock_invalido'] as const
export const incidentStates = ['pendiente', 'suprimida', 'resuelta'] as const
export type IncidentType = typeof incidentTypes[number]
export type IncidentState = typeof incidentStates[number]
export interface Family { family_key: string; tipo: IncidentType; c_interno: number | null; c_interno_original: string | null; datos: Payload; representative_id: string; representative_site_id: string; cases: number; occurrences: number; sites: number; pending_cases: number; suppressed_cases: number; resolved_cases: number; active_cases: number; active: boolean; family_state: IncidentState; first_seen_at: string; last_seen_at: string; resolved_at: string | null; active_suppression_until: string | null; scope_suppression_until: string | null; reactivate_available: boolean; deletion_proposed: boolean }
export interface Incident { id: string; sede_id: string; sede: string; c_interno: number | null; c_interno_original: string | null; tipo: IncidentType; estado: IncidentState; datos: Payload; first_seen_at: string; last_seen_at: string; resuelta_at: string | null; active: boolean; occurrence_count: number; primer_snapshot_id: string | null; ultimo_snapshot_id: string | null }
export interface IncidentSiteDetail { site_id: string; site: string; occurrences: number; state: IncidentState | null; active: boolean; first_seen_at: string | null; last_seen_at: string | null; resolved_at: string | null }
export interface Device { id: string; site_id: string; site: string; estado: 'pendiente' | 'autorizado'; solicitado_por: string; solicitante: string; solicitado_at: string; autorizado_at: string | null; revocado_at: string | null; ultimo_acceso_at: string | null; revision: number }
export interface Reads {
  summary: ManagementEnvelope & { site_id: string | null; period: { from: string; to: string }; families: Family[]; revisions: { incidents: number; incidents_global: number } }
  detail: ManagementEnvelope & { site_id: string | null; family_key: string; items: Incident[]; page: number; page_size: number; revisions: { incidents: number } }
  detail_sites: ManagementEnvelope & { family_key: string; sites: IncidentSiteDetail[]; revisions: { incidents: number } }
  list: ManagementEnvelope & { devices: Device[] }
}
export type ReadAction = keyof Reads
export interface ReadPayloads {
  summary: { site_id?: string }; detail: { family_key: string; site_id?: string; page: number; page_size: number }; detail_sites: { family_key: string }; list: { site_id?: string }
}
export interface Mutations {
  ignore_30d: { family_key: string; scope: 'global' | 'site'; site_id?: string }
  reactivate: Mutations['ignore_30d']; propose_delete: Mutations['ignore_30d']
  authorize: { device_id: string }; replace: { device_id: string }; revoke: { device_id: string }; reject: { device_id: string }
}
export type MutationAction = keyof Mutations
export interface MutationResult extends ManagementEnvelope { replay: boolean; revisions: Revisions; result?: Payload; status?: string; site_id?: string | null; family_key?: string; scope?: string; until?: string; cambio_catalogo_id?: string; action?: string; authorized_device?: { id: string; estado: string; autorizado_at: string; ultimo_acceso_at: string | null } | null; pending_devices?: { id: string; estado: string; solicitado_por: string; solicitado_at: string; ultimo_acceso_at: string | null }[] }
export function domain(action: ReadAction | MutationAction): Domain {
  if (['summary', 'detail', 'detail_sites', 'ignore_30d', 'reactivate', 'propose_delete'].includes(action)) return 'incidents'
  return 'devices'
}
export class ManagementError extends Error { constructor(readonly code: string, readonly uncertain = false) { super(code) } }
const object = (v: unknown): v is Payload => !!v && typeof v === 'object' && !Array.isArray(v)
const revision = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const nullableTimestamp = (v: unknown) => v === null || timestamp(v)
const nullableString = (v: unknown) => v === null || typeof v === 'string'
const incidentType = (v: unknown): v is IncidentType => incidentTypes.includes(v as IncidentType)
const incidentState = (v: unknown): v is IncidentState => incidentStates.includes(v as IncidentState)
function validFamily(value: Payload) {
  const counts = ['cases', 'occurrences', 'sites', 'pending_cases', 'suppressed_cases', 'resolved_cases', 'active_cases']
  if (typeof value.family_key !== 'string' || !/^[a-f0-9]{64}$/i.test(value.family_key) || !incidentType(value.tipo) || !nullableString(value.c_interno_original) || !object(value.datos) || typeof value.representative_id !== 'string' || typeof value.representative_site_id !== 'string' || !counts.every(key => revision(value[key])) || typeof value.active !== 'boolean' || !incidentState(value.family_state) || !timestamp(value.first_seen_at) || !timestamp(value.last_seen_at) || !nullableTimestamp(value.resolved_at) || !nullableTimestamp(value.active_suppression_until) || !nullableTimestamp(value.scope_suppression_until) || typeof value.reactivate_available !== 'boolean' || typeof value.deletion_proposed !== 'boolean') return false
  if (value.c_interno !== null && !revision(value.c_interno)) return false
  if (value.reactivate_available !== (value.scope_suppression_until !== null)) return false
  if (value.active !== Number(value.active_cases) > 0) return false
  return value.active ? value.family_state !== 'resuelta' : value.family_state === 'resuelta'
}
function validIncident(value: Payload) {
  if (typeof value.id !== 'string' || typeof value.sede_id !== 'string' || typeof value.sede !== 'string' || !nullableString(value.c_interno_original) || !incidentType(value.tipo) || !incidentState(value.estado) || !object(value.datos) || !timestamp(value.first_seen_at) || !timestamp(value.last_seen_at) || !nullableTimestamp(value.resuelta_at) || typeof value.active !== 'boolean' || !revision(value.occurrence_count) || !nullableString(value.primer_snapshot_id) || !nullableString(value.ultimo_snapshot_id)) return false
  if (value.c_interno !== null && !revision(value.c_interno)) return false
  return value.active === (value.estado === 'pendiente' || value.estado === 'suprimida')
}
function validIncidentSiteDetail(value: Payload) {
  if (typeof value.site_id !== 'string' || typeof value.site !== 'string' || !revision(value.occurrences) || typeof value.active !== 'boolean' || !nullableTimestamp(value.first_seen_at) || !nullableTimestamp(value.last_seen_at) || !nullableTimestamp(value.resolved_at)) return false
  if (value.state !== null && !incidentState(value.state)) return false
  return value.active === (value.state === 'pendiente' || value.state === 'suprimida')
}
function envelope(v: unknown): asserts v is Payload {
  if (!object(v) || v.contract_version !== 2 || typeof v.generated_at !== 'string' || !Number.isFinite(Date.parse(v.generated_at))) throw new ManagementError('Respuesta incompatible con contrato v2')
}
export function validateRead<A extends ReadAction>(action: A, value: unknown): Reads[A] {
  envelope(value)
  if (action !== 'list' && (!object(value.revisions) || !revision(value.revisions.incidents) || (action === 'summary' && !revision(value.revisions.incidents_global)))) throw new ManagementError('Revisiones incompletas')
  const rows = action === 'summary' ? value.families : action === 'detail' ? value.items : action === 'detail_sites' ? value.sites : value.devices
  if (rows !== null && (!Array.isArray(rows) || !rows.every(object))) throw new ManagementError('Lista incompatible con contrato v2')
  if (action === 'list' && !(value.devices as Payload[]).every(v => typeof v.id === 'string' && typeof v.site_id === 'string' && revision(v.revision) && ['pendiente', 'autorizado'].includes(String(v.estado)))) throw new ManagementError('Dispositivos incompatibles')
  if (action === 'summary' && (!object(value.period) || typeof value.period.from !== 'string' || typeof value.period.to !== 'string' || !Number.isFinite(Date.parse(value.period.to)) || !(value.families as Payload[]).every(validFamily))) throw new ManagementError('Familias incompatibles')
  if (action === 'detail' && (!revision(value.page) || !revision(value.page_size) || Number(value.page_size) < 1 || Number(value.page_size) > 100 || !(value.items as Payload[]).every(validIncident))) throw new ManagementError('Página incompatible')
  if (action === 'detail_sites' && (typeof value.family_key !== 'string' || !/^[a-f0-9]{64}$/i.test(value.family_key) || !(value.sites as Payload[]).every(validIncidentSiteDetail))) throw new ManagementError('Detalle por sede incompatible')
  return value as unknown as Reads[A]
}
export async function managementRead<A extends ReadAction>(action: A, payload: ReadPayloads[A]): Promise<Reads[A]> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc(`rpc_solog_admin_${domain(action)}_v2`, { p_action: action, p_payload: payload })
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
  if (!(d === 'devices' ? revision(data.revisions.devices) && Array.isArray(data.pending_devices) && 'authorized_device' in data : revision(data.revisions.incidents) && typeof data.status === 'string')) throw new ManagementError('Estado autoritativo incompleto', true)
  return data as unknown as MutationResult
}
