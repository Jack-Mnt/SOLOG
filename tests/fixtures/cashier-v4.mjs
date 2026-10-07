// Independent V4 wire fixtures. No productive runtime or previous-contract imports.
export const cashierV4Ids = {
  user: '00000000-0000-4000-8000-000000000001',
  site: '00000000-0000-4000-8000-000000000002',
  device: '00000000-0000-4000-8000-000000000003',
  session: '00000000-0000-4000-8000-000000000004',
  recovery: '00000000-0000-4000-8000-000000000005',
  snapshot: '00000000-0000-4000-8000-000000000006',
  category: '00000000-0000-4000-8000-000000000007',
  review: '00000000-0000-4000-8000-000000000011',
  coverage: '00000000-0000-4000-8000-000000000012',
  daily: '00000000-0000-4000-8000-000000000013',
  none: '00000000-0000-4000-8000-000000000014',
  detail: '00000000-0000-4000-8000-000000000021',
  savedDetail: '00000000-0000-4000-8000-000000000022',
  observation: '00000000-0000-4000-8000-000000000031',
  operation: '00000000-0000-4000-8000-000000000041',
}
export const cashierV4DeviceToken = 'cashier-v4-contract-fixture-token-0001'
const ids = cashierV4Ids
const revisions = () => ({ groups: 7, devices: 2, operational: 10 })
const iso = (time) => new Date(time).toISOString()

export function cashierV4TemporalBasis({ ronda = 1, turno = 'day' } = {}) {
  const day = ronda === 1 ? '2026-10-03' : '2026-10-10'
  const start = Date.parse(day + 'T05:00:00Z')
  const windows = { early: [0, 450], day: [450, 930], night: [930, 1440] }
  return {
    periodo_desde: '2026-10-01', periodo_hasta: '2026-10-15', ronda,
    ronda_desde: ronda === 1 ? '2026-10-01T05:00:00Z' : '2026-10-08T05:00:00Z',
    ronda_hasta: ronda === 1 ? '2026-10-08T05:00:00Z' : '2026-10-16T05:00:00Z',
    turno, turno_desde: iso(start + windows[turno][0] * 60000),
    turno_hasta: iso(start + windows[turno][1] * 60000),
  }
}
export function cashierV4Basis(options = {}) {
  return { ...cashierV4TemporalBasis(options), snapshot_referencia_id: ids.snapshot,
    version_catalogo: 5, groups_revision: 7 }
}
export function cashierV4Session(options = {}) {
  const b = cashierV4TemporalBasis(options)
  const start = Date.parse(b.turno_desde) + (b.turno === 'early' ? 180 : 60) * 60000
  const expires = Math.min(start + 119 * 60000, Date.parse(b.turno_hasta))
  return { id: ids.session, sede_id: ids.site, usuario_id: ids.user,
    estado: options.estado ?? 'activo', iniciado_at: iso(start), expira_at: iso(expires),
    recovery_until: iso(expires + 120 * 60000),
    finalizado_at: options.estado === 'finalizado' ? iso(start + 60000) : null }
}
export function cashierV4Capability(mode = 'none', options = {}) {
  const s = cashierV4Session({ ...options, estado: mode === 'active' ? 'activo' : mode === 'recovery' ? 'recovery' : options.estado })
  const hasSession = mode !== 'none' || Boolean(options.estado)
  return { mode, estado: hasSession ? s.estado : null,
    capture_allowed: mode === 'active', pending_delivery_allowed: mode !== 'none',
    iniciado_at: hasSession ? s.iniciado_at : null, expira_at: hasSession ? s.expira_at : null,
    recovery_until: hasSession ? s.recovery_until : null, finalizado_at: hasSession ? s.finalizado_at : null }
}
export function cashierV4Group(accion = 'coverage', options = {}) {
  const id = accion === 'recount' ? ids.review : ids[accion]
  return { grupo_id: id, nombre: 'Grupo ' + accion, categoria_id: ids.category,
    categoria: 'Abarrotes', tipo: 'Individual', precio: 4, unidades_por_paquete: null,
    precio_paquete: null, codigos_internos: [123],
    productos: [{ c_interno: 123, producto: 'Producto', marca: null, precio: 4 }],
    stock_teorico: accion === 'daily' ? 0 : accion === 'none' ? -2 : 10,
    snapshot_referencia_id: ids.snapshot, accion,
    detalle_reconteo_id: accion === 'recount' ? ids.detail : null,
    contado_detalle_id: null, contado_at: null, recontado_at: null, ...options }
}
export function cashierV4Kpis({ ronda = 1, next_action = 'review', review_priority_class = 'review_for_coverage' } = {}) {
  const blockedWaiting = next_action === 'none' ? 1 : 0
  const coveragePending = next_action === 'coverage' ? 2
    : next_action === 'review' && review_priority_class === 'review_for_coverage' ? 1 : blockedWaiting
  const reviewPending = ['coverage', 'review'].includes(next_action) ? 1 : 0
  return { coverage_round: ronda, coverage_total: 4, coverage_counted: 4 - coveragePending,
    coverage_pending: coveragePending, coverage_percent: (4 - coveragePending) * 25,
    review_pending: reviewPending,
    coverage_queue_pending: next_action === 'coverage' ? 1 : 0,
    daily_pending: next_action === 'none' ? 0 : 1,
    coverage_blocked_waiting_snapshot: blockedWaiting }
}
export function cashierV4Panel(options = {}) {
  const next = options.next_action ?? 'review'
  const reviewPriority = options.review_priority_class ?? 'review_for_coverage'
  const s = cashierV4Session(options)
  const mode = s.estado === 'activo' ? 'active' : s.estado === 'recovery' ? 'recovery' : 'none'
  const groups = [cashierV4Group('recount'), cashierV4Group('coverage'), cashierV4Group('daily'), cashierV4Group('none')]
  if (!['coverage', 'review'].includes(next)) groups[0] = { ...groups[0], accion: 'none', detalle_reconteo_id: null }
  if (next !== 'coverage') groups[1].accion = 'none'
  if (next === 'none') groups[2].accion = 'none'
  return { source: 'session', frozen: true, session: s, basis: cashierV4Basis(options), groups,
    review_queue: ['coverage', 'review'].includes(next) ? [{ grupo_id: ids.review, detalle_id: ids.detail,
      ultima_diferencia: -2, contado_at: '2026-09-30T22:00:00Z', priority_class: reviewPriority }] : [],
    coverage_queue: next === 'coverage' ? [ids.coverage] : [],
    daily_queue: next === 'none' ? [] : [ids.daily],
    kpis: cashierV4Kpis({ ...options, review_priority_class: reviewPriority }),
    next_action: next, session_capability: cashierV4Capability(mode, options) }
}
export function cashierV4Summary(options = {}) {
  return { basis: cashierV4TemporalBasis(options), kpis: cashierV4Kpis(options), next_action: options.next_action ?? 'review' }
}
export function cashierV4Stock(options = {}) {
  const s = cashierV4Session(options)
  return { snapshot_id: ids.snapshot, capturado_at: s.iniciado_at, confirmado_at: s.iniciado_at,
    snapshot_expira_at: iso(Date.parse(s.iniciado_at) + 120 * 60000), version_catalogo: 5 }
}
export function cashierV4RecoverySession(options = {}) {
  const s = cashierV4Session(options)
  // An earlier session still inside its two-hour delivery window.
  const previous = Object.fromEntries(['iniciado_at', 'expira_at', 'recovery_until']
    .map(key => [key, iso(Date.parse(s[key]) - 120 * 60000)]))
  return { id: ids.recovery, ...previous, snapshot_referencia_id: ids.snapshot,
    ronda: options.ronda ?? 1, turno: (options.turno ?? 'day') === 'day' ? 'early' : (options.turno ?? 'day') === 'night' ? 'day' : 'early',
    session_capability: { ...cashierV4Capability('recovery', options), ...previous } }
}
export function cashierV4Bootstrap(kind = 'pre_session', options = {}) {
  const value = { contract_version: 4, generated_at: cashierV4Session(options).iniciado_at,
    server_now: cashierV4Session(options).iniciado_at, revisions: revisions(),
    identity: { id: ids.user, nombre: 'Cajero', rol: 'cajero' }, site: { id: ids.site, nombre: 'Cutervo' },
    device: { id: ids.device, estado: 'autorizado', sede_correcta: true, autorizado: true, sede_tiene_dispositivo_autorizado: true },
    stock: cashierV4Stock(options), start_capability: { allowed: true, reason: null },
    session_capability: cashierV4Capability(), recovery_sessions: [],
    pre_session_summary: cashierV4Summary(options), panel_state: null }
  if (kind === 'active' || kind === 'active_recovery') {
    value.panel_state = cashierV4Panel(options)
    value.session_capability = structuredClone(value.panel_state.session_capability)
    value.pre_session_summary = null
    value.start_capability = { allowed: false, reason: 'SOLOG_SESSION_CONFLICT' }
  }
  if (kind === 'recovery' || kind === 'active_recovery') value.recovery_sessions = [cashierV4RecoverySession(options)]
  if (kind === 'unauthorized') {
    value.device = { id: null, estado: 'sin_solicitud', sede_correcta: null, autorizado: false, sede_tiene_dispositivo_autorizado: false }
    value.start_capability = { allowed: false, reason: 'SOLOG_DEVICE_UNAUTHORIZED' }
    value.pre_session_summary = null
    value.stock = { snapshot_id: null, capturado_at: null, confirmado_at: null, snapshot_expira_at: null, version_catalogo: null }
  }
  return value
}
export function cashierV4Delta(options = {}) {
  const p = cashierV4Panel({ ...options, next_action: options.next_action ?? 'coverage' })
  return { groups_patch: [], review_queue: p.review_queue, coverage_queue: p.coverage_queue,
    daily_queue: p.daily_queue, kpis: p.kpis, next_action: p.next_action, session_capability: p.session_capability }
}
export function cashierV4Mutation(action = 'start', options = {}) {
  const panel = cashierV4Panel(options)
  const stamp = iso(Date.parse(panel.session.iniciado_at) + 60000)
  const common = { contract_version: 4, generated_at: stamp, action, replay: false, conteo_id: ids.session,
    revisions: { ...revisions(), operational: 11 }, session_capability: panel.session_capability }
  if (action === 'start') return { ...common, stock: cashierV4Stock(options), panel_state: panel }
  if (action === 'finish') {
    const finished = cashierV4Capability('none', { ...options, estado: 'finalizado' })
    delete finished.iniciado_at // Exact abbreviated capability documented for finish.
    return { ...common, status: 'finalizado', finalizado_at: stamp, session_capability: finished }
  }
  const recount = action === 'recount_save_batch'
  const delta = cashierV4Delta({ ...options, next_action: recount ? 'daily' : 'review' })
  delta.groups_patch = [{ grupo_id: recount ? ids.review : ids.coverage, accion: 'none',
    detalle_reconteo_id: null, contado_detalle_id: recount ? null : ids.savedDetail,
    contado_at: recount ? null : stamp, recontado_at: recount ? stamp : null }]
  if (recount) {
    delta.kpis.coverage_counted = 4; delta.kpis.coverage_pending = 0
    delta.kpis.coverage_percent = 100; delta.kpis.coverage_blocked_waiting_snapshot = 0
  }
  const item = recount
    ? { detalle_id: ids.detail, grupo_id: ids.review, snapshot_reconteo_id: ids.snapshot,
      stock_teorico_reconteo: 10, stock_reconteo: 10, diferencia_reconteo: 0, diferencia: 0,
      estado_diferencia: 'Coincide', valor_diferencia: 0, recontado_at: stamp }
    : { client_observation_id: ids.observation, detalle_id: ids.savedDetail, grupo_id: ids.coverage,
      stock_teorico: 10, stock_fisico: 10, diferencia: 0, estado_diferencia: 'Coincide', contado_at: stamp }
  return { ...common, saved: 1, items: [item], panel_delta: delta }
}
export function cashierV4Request(action = 'start', options = {}) {
  const common = { operation_id: ids.operation, device_token: cashierV4DeviceToken }
  if (action === 'start') return common
  const scoped = { ...common, conteo_id: ids.session, expected_groups_revision: cashierV4Basis(options).groups_revision }
  if (action === 'finish') return scoped
  const stamp = iso(Date.parse(cashierV4Session(options).iniciado_at) + 60000)
  return { ...scoped, items: [action === 'save_batch'
    ? { client_observation_id: ids.observation, grupo_id: ids.coverage, stock_fisico: 10, contado_at: stamp }
    : { detalle_id: ids.detail, stock_fisico: 10, contado_at: stamp }] }
}
