import type {
  SologAdminIncidentDecision,
  SologAdminIncidentType,
  SologCatalogChangeSection,
  SologCatalogChangeStatus,
  SologCatalogChangeType,
  SologCatalogDecision,
  SologDifferenceState,
} from './types'

const DIFFERENCE_STATE_LABELS: Record<SologDifferenceState, string> = {
  coincide: 'Coincide',
  pendiente: 'Pendiente',
  probablemente_explicada: 'Probablemente explicada',
  parcialmente_explicada: 'Parcialmente explicada',
  persistente: 'Persistente',
  confirmada_reconteo: 'Confirmada por reconteo',
  conteos_inconsistentes: 'Conteos inconsistentes',
}

export function getSologDifferenceStateLabel(
  state: SologDifferenceState,
): string {
  return DIFFERENCE_STATE_LABELS[state]
}

const INCIDENT_TYPE_LABELS: Record<SologAdminIncidentType, string> = {
  producto_ausente: 'Producto ausente',
  codigo_interno_invalido: 'Código interno inválido',
  codigo_interno_duplicado: 'Código interno duplicado',
  stock_invalido: 'Stock inválido',
}

const INCIDENT_DECISION_LABELS: Record<SologAdminIncidentDecision, string> = {
  reviewed: 'Revisado',
  ignore_15d: 'Ignorar 15 días',
  deleted: 'Eliminado',
}

const INCIDENT_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  revisada: 'Revisada',
  revisado: 'Revisada',
  suprimida: 'Suprimida',
  eliminado: 'Eliminada',
  eliminada: 'Eliminada',
}

const CATALOG_CHANGE_TYPE_LABELS: Record<SologCatalogChangeType, string> = {
  agregar_producto: 'Agregar producto',
  eliminar_producto: 'Eliminar producto',
  nombre: 'Nombre',
  precio: 'Precio',
  codigo: 'Código',
  clasificacion_producto: 'Clasificación',
  definicion_grupo: 'Grupo',
}

const CATALOG_CHANGE_SECTION_LABELS: Record<SologCatalogChangeSection, string> = {
  urgente: 'Cambios urgentes',
  pendiente: 'Cambios pendientes',
}

const CATALOG_CHANGE_STATUS_LABELS: Record<SologCatalogChangeStatus, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  ignorado: 'Ignorado',
  incorporado: 'Incorporado',
}

const CATALOG_DECISION_LABELS: Record<SologCatalogDecision, string> = {
  approve: 'Aprobar',
  ignore: 'Ignorar',
  withdraw: 'Retirar aprobación',
}

export function getSologAdminIncidentTypeLabel(
  type: SologAdminIncidentType,
): string {
  return INCIDENT_TYPE_LABELS[type]
}

export function getSologAdminIncidentDecisionLabel(
  decision: SologAdminIncidentDecision,
): string {
  return INCIDENT_DECISION_LABELS[decision]
}

export function getSologAdminIncidentStatusLabel(status: string): string {
  return INCIDENT_STATUS_LABELS[status] ?? status
}

export function getSologCatalogChangeTypeLabel(
  type: SologCatalogChangeType,
): string {
  return CATALOG_CHANGE_TYPE_LABELS[type]
}

export function getSologCatalogChangeSectionLabel(
  section: SologCatalogChangeSection,
): string {
  return CATALOG_CHANGE_SECTION_LABELS[section]
}

export function getSologCatalogChangeStatusLabel(
  status: SologCatalogChangeStatus,
): string {
  return CATALOG_CHANGE_STATUS_LABELS[status]
}

export function getSologCatalogDecisionLabel(
  decision: SologCatalogDecision,
): string {
  return CATALOG_DECISION_LABELS[decision]
}
