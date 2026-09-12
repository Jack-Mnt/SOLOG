const stamp = '2026-09-12T15:00:00.000Z'
const revisions = () => ({ groups: 7, devices: 2, operational: 10 })
const capability = (mode = 'none') => ({
  mode,
  capture_allowed: mode === 'active',
  pending_delivery_allowed: mode === 'active' || mode === 'recovery',
  recovery_until: mode === 'none' ? null : '2026-09-12T18:59:00.000Z',
})
export function cashierV3Group(id = 'group-1') {
  return {
    grupo_id: id, nombre: `Grupo ${id}`, categoria_id: 'cat-1', categoria: 'Abarrotes', tipo: 'Individual',
    precio: 4, unidades_por_paquete: null, precio_paquete: null, codigos_internos: [1],
    productos: [{ c_interno: 1, producto: 'Producto', marca: 'Marca', precio: 4 }], stock_teorico: 10,
    snapshot_referencia_id: 'snapshot-1', cobertura_periodo: false, estado_stock: 'Cambio_reciente',
    requiere_conteo: true, requiere_reconteo: false, detalle_reconteo_id: null,
    contado_detalle_id: null, contado_at: null, recontado_at: null,
  }
}
export function cashierV3Panel() {
  const basis = { snapshot_referencia_id: 'snapshot-1', version_catalogo: 5, groups_revision: 7,
    periodo_desde: '2026-09-01', periodo_hasta: '2026-09-16' }
  return {
    source: 'session', frozen: true, basis,
    session: { ...basis, id: 'session-1', sede_id: 'site-1', usuario_id: 'user-1', estado: 'activo',
      iniciado_at: stamp, expira_at: '2026-09-12T16:59:00.000Z', recovery_until: '2026-09-12T18:59:00.000Z', finalizado_at: null },
    groups: [cashierV3Group('group-1'), { ...cashierV3Group('group-2'), cobertura_periodo: true,
      requiere_conteo: false, requiere_reconteo: true, detalle_reconteo_id: 'detail-2' }],
    count_queue: ['group-1'],
    review_queue: [{ grupo_id: 'group-2', detalle_id: 'detail-2', ultima_diferencia: -2, contado_at: stamp }],
    kpis: { groups_total: 2, coverage_counted: 1, coverage_percent: 50, count_pending: 1, review_pending: 1 },
  }
}
function base() {
  return {
    contract_version: 3, generated_at: stamp, server_now: stamp, revisions: revisions(),
    identity: { id: 'user-1', nombre: 'Cajero', rol: 'cajero' }, site: { id: 'site-1', nombre: 'Huaca' },
    device: { id: 'device-1', estado: 'autorizado', sede_correcta: true, autorizado: true, sede_tiene_dispositivo_autorizado: true },
    stock: { snapshot_id: 'snapshot-1', capturado_at: stamp, confirmado_at: stamp,
      snapshot_expira_at: '2026-09-12T17:00:00.000Z', version_catalogo: 5 },
    start_capability: { allowed: true, reason: null }, session_capability: capability(),
  }
}
export function cashierV3Bootstrap(kind = 'pre_session') {
  const value = base()
  if (kind === 'unauthorized') return { ...value,
    device: { id: null, estado: 'sin_solicitud', sede_correcta: null, autorizado: false, sede_tiene_dispositivo_autorizado: false },
    start_capability: { allowed: false, reason: 'SOLOG_DEVICE_UNAUTHORIZED' }, stock: { snapshot_id: null, capturado_at: null,
      confirmado_at: null, snapshot_expira_at: null, version_catalogo: null }, pre_session_summary: null, panel_state: null }
  if (kind === 'session' || kind === 'recovery') return { ...value,
    start_capability: { allowed: false, reason: 'SOLOG_SESSION_CONFLICT' },
    session_capability: capability(kind === 'recovery' ? 'recovery' : 'active'), pre_session_summary: null, panel_state: cashierV3Panel() }
  return { ...value, pre_session_summary: { groups_total: 2, coverage_counted: 1, coverage_percent: 50,
    count_pending: 1, review_pending: 1, stock_types: { positive: { total: 1, covered: 0 },
      zero: { total: 1, covered: 1 }, negative: { total: 0, covered: 0 } } }, panel_state: null }
}
export function cashierV3Delta() {
  return {
    groups_patch: [{ grupo_id: 'group-1', cobertura_periodo: true, requiere_conteo: false,
      requiere_reconteo: false, detalle_reconteo_id: null, contado_detalle_id: 'detail-1',
      contado_at: stamp, recontado_at: null }],
    count_queue_remove: ['group-1'], review_queue_remove: [],
    kpis: { groups_total: 2, coverage_counted: 2, coverage_percent: 100, count_pending: 0, review_pending: 1 },
  }
}
export function cashierV3Mutation(action = 'start') {
  const common = { contract_version: 3, generated_at: stamp, action, replay: false, revisions: { ...revisions(), operational: 11 },
    session_capability: action === 'finish' ? capability() : capability('active') }
  if (action === 'start') return { ...common, stock: base().stock, panel_state: cashierV3Panel() }
  if (action === 'save_batch') return { ...common, conteo_id: 'session-1', saved: 1,
    items: [{ client_observation_id: 'observation-1', detalle_id: 'detail-1', grupo_id: 'group-1', stock_teorico: 10,
      stock_fisico: 10, diferencia: 0, estado_diferencia: 'Coincide', contado_at: stamp }], panel_delta: cashierV3Delta() }
  if (action === 'recount_save_batch') return { ...common, conteo_id: 'session-1', saved: 1,
    items: [{ detalle_id: 'detail-2', grupo_id: 'group-2', snapshot_reconteo_id: 'snapshot-2',
      stock_teorico_reconteo: 8, stock_reconteo: 8, diferencia_reconteo: 0, diferencia: 0,
      estado_diferencia: 'Coincide', valor_diferencia: 0, recontado_at: stamp }],
    panel_delta: { groups_patch: [{ grupo_id: 'group-2', cobertura_periodo: true, requiere_conteo: false,
      requiere_reconteo: false, detalle_reconteo_id: null, contado_detalle_id: 'detail-2', contado_at: stamp,
      recontado_at: stamp }], count_queue_remove: [], review_queue_remove: ['detail-2'],
      kpis: { groups_total: 2, coverage_counted: 2, coverage_percent: 100, count_pending: 0, review_pending: 0 } } }
  return { ...common, conteo_id: 'session-1', status: 'finalizado', finalizado_at: stamp }
}
