export function cashierFixture() {
  const stamp = '2026-09-03T20:30:00.000Z'
  const group = (id, covered, recount) => ({
    grupo_id: id, nombre: recount ? 'Grupo revisión' : 'Grupo conteo', categoria_id: 'cat-1', categoria: 'Abarrotes',
    tipo: 'Individual', precio: 4, unidades_por_paquete: null, precio_paquete: null,
    codigos_internos: [1], productos: [{ c_interno: 1, producto: 'Producto', marca: 'Marca', precio: 4 }],
    stock_teorico: 10, snapshot_referencia_id: 'snapshot-1', cobertura_periodo: covered, estado_stock: 'Cambio_reciente',
    requiere_conteo: !recount, requiere_reconteo: recount, detalle_reconteo_id: recount ? 'detail-origin' : null,
    contado_detalle_id: null, contado_at: null, recontado_at: null,
  })
  return {
    contract_version: 2, generated_at: stamp, server_now: stamp,
    identity: { id: 'user-1', nombre: 'Cajero', rol: 'cajero' }, site: { id: 'site-1', nombre: 'Huaca' },
    device: { id: 'device-1', estado: 'autorizado', sede_correcta: true, autorizado: true, sede_tiene_dispositivo_autorizado: true },
    revisions: { groups: 7, devices: 2, operational: 10 },
    start_capability: { allowed: true, reason: null, snapshot_id: 'snapshot-1', snapshot_at: stamp, confirmado_at: stamp, version_catalogo: 5, snapshot_expira_at: '2026-09-03T22:30:00.000Z' },
    session_state: null,
    panel_state: {
      source: 'pre_session', frozen: false, session: null,
      basis: { snapshot_referencia_id: 'snapshot-1', version_catalogo: 5, groups_revision: 7, periodo_desde: '2026-09-01', periodo_hasta: '2026-09-16' },
      groups: [group('group-1', false, false), group('group-2', true, true)],
      count_queue: ['group-1'], review_queue: [{ grupo_id: 'group-2', detalle_id: 'detail-origin' }],
      kpis: { groups_total: 2, coverage_counted: 1, coverage_percent: 50, count_pending: 1, review_pending: 1 },
    },
  }
}
export function startedFixture(b = cashierFixture()) {
  const { source, frozen, basis, ...state } = b.panel_state
  void source; void frozen
  return {
    ...state,
    session: { ...basis, id: 'session-1', sede_id: b.site.id, usuario_id: b.identity.id, estado: 'activo', iniciado_at: b.server_now, expira_at: b.start_capability.snapshot_expira_at, finalizado_at: null },
  }
}

