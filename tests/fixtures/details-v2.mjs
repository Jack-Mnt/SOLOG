export const detailsNow = '2026-09-03T20:30:00Z'
export function summaryFixture() {
  return { contract_version: 2, generated_at: detailsNow, revisions: { operational: 10, devices: 2 },
    site: { id: 'site-1', nombre: 'Huáca Principal' },
    summary: {
      periodo: { desde: '2026-09-01', hasta: '2026-09-15', inaugurada: true, grupos_contados: 15, grupos_totales: 20, pendientes: 5, porcentaje: 75, completa: false },
      diaria: { fecha: '2026-09-03', grupos_requeridos: 0, grupos_verificados: 0, pendientes: 0, porcentaje: 100, sin_requerimientos: true },
      conteo_diario_pendientes: 0, revisar_pendientes: 1,
      ultimo_snapshot: { id: 'snapshot-1', capturado_at: detailsNow, confirmado_at: detailsNow, version_catalogo: 3 },
    },
    access: { authorized_device_id: null, current_device_id: null, current_device_state: 'sin_solicitud', current_device_matches_site: true, can_request: true },
  }
}
export function historyItem(index = 0) {
  return { case_id: 'case-' + index, grupo_id: 'group-' + index, grupo: 'Grupo ' + index, categoria: 'Bebidas',
    contado_at: new Date(Date.parse(detailsNow) - index * 1000).toISOString(), stock_teorico: 12, stock_fisico: 15,
    diferencia: 3, estado_diferencia: 'Confirmada', valor_diferencia: 24, recontado_at: detailsNow }
}
export function historyFixture(period = 'today', count = 100, offset = 0, revision = 10) {
  return { contract_version: 2, generated_at: detailsNow, revisions: { operational: revision }, period,
    date: period === 'today' ? '2026-09-03' : '2026-09-02',
    items: Array.from({ length: count }, (_, i) => ({ ...historyItem(i + offset),
      ...(period === 'yesterday' ? { contado_at: '2026-09-02T20:30:00Z' } : {}) })),
    next_cursor: count === 100 ? 'opaque+cursor/one=' : null, page_size: 100 }
}
export function detailFixture(index = 0) {
  return { contract_version: 2, generated_at: detailsNow, revisions: { operational: 10 },
    case: { ...historyItem(index), tipo_grupo: 'Individual', codigos_internos: [123],
      snapshot_referencia_id: 'snapshot-1', diferencia_inicial: 3, primer_snapshot_posterior_id: 'snapshot-2',
      snapshot_posterior_id: 'snapshot-2', stock_posterior: 12, snapshot_reconteo_id: 'snapshot-2',
      stock_teorico_reconteo: 12, stock_reconteo: 15, diferencia_reconteo: 3, precio: 8, unidades_por_paquete: null, precio_paquete: null },
    skus: [{ c_interno: 123, producto: 'Producto', marca: null, precio_actual: 8 }],
    chronology: [{ case_id: 'case-' + index, contado_at: detailsNow, estado_diferencia: 'Confirmada', diferencia: 3, recontado_at: detailsNow }] }
}
export function exportFixture(period = 'current_biweekly') {
  return { contract_version: 2, generated_at: detailsNow, revisions: { operational: 10 },
    site: summaryFixture().site, period: { key: period, from: period === 'current_biweekly' ? '2026-09-01' : '2026-08-16', to: period === 'current_biweekly' ? '2026-09-15' : '2026-08-31' },
    summary: { diferencias_finales: 2, confirmadas: 1, inconsistentes: 1, faltantes: 1, sobrantes: 1, valorizado_faltantes: 0, valorizado_sobrantes: 24 },
    rows: [
      { case_id: 'case-0', fecha_origen: period === 'current_biweekly' ? detailsNow : '2026-08-31T04:30:00Z', grupo: 'Agua mineral', categoria: 'Bebidas',
        estado: 'Confirmada', teorico: 12, fisico: 15, diferencia: 3, valorizado: 24, precio: 8, unidades_por_paquete: null, precio_paquete: null, recontado_at: detailsNow },
      { case_id: 'case-1', fecha_origen: period === 'current_biweekly' ? detailsNow : '2026-08-31T04:30:00Z', grupo: 'Galletas por paquete', categoria: 'Snacks',
        estado: 'Inconsistente', teorico: 30, fisico: 16, diferencia: -14, valorizado: null, precio: 5, unidades_por_paquete: 12, precio_paquete: 50, recontado_at: detailsNow },
    ] }
}
