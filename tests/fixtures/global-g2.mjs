// Explicit synthetic backend outputs, not a reimplementation of Motor/SQL selection.
import { responseFixture, exportFixture as adminExport } from './admin-v2.mjs'
import { summaryFixture, exportFixture as detailsExport } from './details-v2.mjs'
export const origin = '2026-09-16T04:59:59Z' // September 15, Lima
export const recounted = '2026-09-16T12:30:00Z' // Next biweekly period
export const generated = '2026-09-16T20:30:00Z'
export const period = { key: 'previous_biweekly', from: '2026-09-01', to: '2026-09-15' }
export function scenario() {
  const daily = responseFixture('daily_detail', { site_id: 'site-a', origin_date: '2026-09-15' })
  daily.generated_at = generated
  daily.summary = { pending_recount: 0, confirmed: 1, inconsistent: 0 }
  Object.assign(daily.items[0], { contado_at: origin, recontado_at: recounted })
  const control = responseFixture('control_page', { site_id: 'site-a', period: 'previous_biweekly', page: 0, page_size: 100 })
  control.generated_at = generated; control.period = period
  control.summary = { total: 1, coincide: 0, pending_recount: 0, confirmed: 1, inconsistent: 0 }
  control.items = [{ ...control.items[0], contado_at: origin, recontado_at: recounted }]
  const admin = adminExport('site-a', 'previous_biweekly')
  admin.generated_at = generated; admin.period = period; admin.summary = control.summary
  admin.adjustments = [{ ...admin.adjustments[0], fecha_origen: origin }]
  admin.all = [{ ...admin.adjustments[0], recontado_at: recounted }]
  admin.pending_recount = []; admin.inconsistent = []
  const details = detailsExport('previous_biweekly')
  details.generated_at = generated; details.site = admin.site; details.period = period
  details.summary = { diferencias_finales: 1, confirmadas: 1, inconsistentes: 0, faltantes: 1, sobrantes: 0, valorizado_faltantes: -7.5, valorizado_sobrantes: 0 }
  details.rows = [{ case_id: 'case-0', fecha_origen: origin, grupo: 'Grupo 0', categoria: 'Bebidas', estado: 'Confirmada',
    teorico: 20, fisico: 18, diferencia: -2, valorizado: -7.5, precio: 3.75, unidades_por_paquete: null, precio_paquete: null, recontado_at: recounted }]
  const summary = summaryFixture()
  summary.site = admin.site; summary.generated_at = generated
  Object.assign(summary.summary.periodo, { desde: '2026-09-16', hasta: '2026-09-30' })
  summary.summary.diaria.fecha = '2026-09-16'
  const grid = responseFixture('shift_grid', { site_id: 'site-a', period: 'previous_biweekly' })
  grid.generated_at = generated; grid.period = period
  grid.data.shifts.forEach(s => { s.date = '2026-09-15'; s.calculated_at = generated })
  grid.data.totals[0].date = '2026-09-15'
  return { daily, control, admin, details, summary, grid }
}
