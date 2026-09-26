import { expect, test } from 'bun:test'
import { validateAdminResponse } from '../src/features/solog/admin/admin.v2'
import { adminTimestamp, validCustomRange } from '../src/features/solog/admin/admin.v2.format'
import { buildAdminWorkbook } from '../src/features/solog/admin/control/admin.control.v2.export'
import { parseDetailsResponse, detailsDate } from '../src/features/solog/detalles/detalles.v2'
import { getDetailsValuationExplanation } from '../src/features/solog/detalles/detalles.export'
import { scenario, origin, recounted } from './fixtures/global-g2.mjs'
import { ManagementStore } from '../src/features/solog/admin/admin.management.store'
import { ManagementError, type managementRead, type managementMutate } from '../src/features/solog/admin/admin.management.v2'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'
import { managementFixture, mutationFixture } from './fixtures/admin-management.mjs'
import { CashierV3Store } from '../src/features/solog/cajero/cajero.v3.store'
import { parseCashierV3Bootstrap } from '../src/features/solog/cajero/cajero.v3.api'
import { cashierV3Bootstrap } from './fixtures/cashier-v3.mjs'

test('G2 mismo caso y valores autoritativos en detalle diario, Control y ambos exports', () => {
  const s = scenario()
  const d = validateAdminResponse('daily_detail_bootstrap', s.daily).views.Confirmada[0]
  const c = validateAdminResponse('control_groups', s.control).items[0]
  const a = validateAdminResponse('export', s.admin).adjustments[0]
  const e = parseDetailsResponse('export', s.details).rows[0]
  expect([d.case_id,c.case_id,a.case_id,e.case_id]).toEqual(Array(4).fill('case-0'))
  expect([c.origin_at,a.fecha_origen,e.fecha_origen]).toEqual(Array(3).fill(origin))
  expect([c.state,a.estado,e.estado]).toEqual(Array(3).fill('Confirmada'))
  expect([d.difference,c.difference,a.diferencia,e.diferencia]).toEqual([-2,-2,-2,-2])
  expect([d.valued_difference,c.valued_difference,a.valorizado,e.valorizado]).toEqual([-7.5,-7.5,-7.5,-7.5])
  expect(detailsDate(Date.parse(origin))).toBe('2026-09-15')
  expect(detailsDate(Date.parse(recounted))).toBe('2026-09-16')
  expect(s.admin.period).toEqual(s.details.period)
  expect(buildAdminWorkbook(s.admin).data[1][1][2]).toMatchObject({ value: adminTimestamp(origin) })
})

for (const [instant, date, clock] of [
  ['2026-01-01T04:59:59Z','2025-12-31','23:59'],
  ['2026-01-01T05:00:00Z','2026-01-01','00:00'],
  ['2026-02-16T04:59:59Z','2026-02-15','23:59'],
  ['2026-02-16T05:00:00Z','2026-02-16','00:00'],
  ['2028-03-01T04:59:59Z','2028-02-29','23:59'],
  ['2026-09-16T12:29:59Z','2026-09-16','07:29'],
  ['2026-09-16T12:30:00Z','2026-09-16','07:30'],
  ['2026-09-16T20:29:59Z','2026-09-16','15:29'],
  ['2026-09-16T20:30:00Z','2026-09-16','15:30'],
]) test('G2 presentación Lima '+instant, () => {
  expect(detailsDate(Date.parse(instant))).toBe(date)
  // No turn/period selection in client: only presentation of authoritative timestamps.
  expect(adminTimestamp(instant)).toContain(clock)
})

test('G2 Total autoritativo no se suma desde turnos ni se elimina al ser cero', () => {
  const s = scenario(); s.grid.data.totals[0].numerator = 0; s.grid.data.totals[0].percentage = 0
  const grid = validateAdminResponse('shift_grid', s.grid)
  expect(grid.data.shifts.map(r => r.percentage)).toEqual([20,20,20])
  expect(grid.data.totals).toHaveLength(1)
  expect(grid.data.totals[0]).toMatchObject({ numerator: 0, denominator: 10, percentage: 0 })
})

test('G2 último confirmado cero no recupera un ajuste antiguo; Inconsistentes sin valorización', () => {
  const s = scenario()
  s.admin.adjustments = []
  Object.assign(s.admin.all[0], { diferencia: 0, valorizado: 0 })
  const wb = buildAdminWorkbook(validateAdminResponse('export', s.admin))
  expect(wb.data[1]).toHaveLength(1); expect(wb.data[4][1][6]).toMatchObject({ value: 0 })
  Object.assign(s.details.rows[0], { estado: 'Inconsistente', valorizado: null })
  Object.assign(s.details.summary, { confirmadas: 0, inconsistentes: 1, valorizado_faltantes: 0 })
  expect(parseDetailsResponse('export', s.details).rows[0].valorizado).toBeNull()
  expect(getDetailsValuationExplanation(s.details.rows[0])).toBe('Sin valorización disponible')
})

test('G2 precio por paquete histórico no se reemplaza con catálogo vivo', () => {
  const s = scenario()
  Object.assign(s.details.rows[0], { diferencia: -14, unidades_por_paquete: 12, precio_paquete: 50, precio: 5, valorizado: -60 })
  const row = parseDetailsResponse('export', s.details).rows[0]
  expect(getDetailsValuationExplanation(row)).toContain('S/ 50.00')
  expect(getDetailsValuationExplanation(row)).toContain('-S/ 60.00')
  expect(row.valorizado).toBe(-60)
  expect(validCustomRange('2028-02-01','2028-02-29')).toBe(true)
})

test('G2 dos admins: conflicto no es éxito; recarga y nueva intención con revisión vigente', async () => {
  let revision = 2
  const sent: Record<string, unknown>[] = []
  const mutate = (async (a,p) => {
    sent.push(p)
    if (p.expected_revision !== revision) throw new ManagementError('SOLOG_DEVICE_REVISION_CONFLICT')
    revision++
    return mutationFixture(a,p,false,{ incidents: 4, incidents_global: 4, devices: revision })
  }) as typeof managementMutate
  const read = (async (a,p) => managementFixture(a,p,{ incidents: 4, incidents_global: 4, devices: revision })) as typeof managementRead
  const a = new ManagementStore('admin-test',bootstrapFixture,()=>{},read,mutate)
  const b = new ManagementStore('admin-test',bootstrapFixture,()=>{},read,mutate)
  await Promise.all([a.load('list',{site_id:'site-a'}), b.load('list',{site_id:'site-a'})])
  const payload = { device_id: 'site-a-device-1' }
  await a.mutation('authorize',payload,2,'site-a')
  await expect(b.mutation('authorize',payload,2,'site-a')).rejects.toThrow('CONFLICT')
  expect(b.results.size).toBe(0); expect(b.peek('list',{site_id:'site-a'}).data).toBeUndefined()
  const list = await b.load('list',{site_id:'site-a'})
  const current = list.devices.find(device => device.id === payload.device_id)!.revision
  await b.mutation('authorize',payload,current,'site-a')
  expect(sent[1].operation_id).not.toBe(sent[2].operation_id)
})

test('G2 mutación administrativa no altera una sesión Cajero congelada', async () => {
  const bootstrap = parseCashierV3Bootstrap(cashierV3Bootstrap('session'))
  const cashier = new CashierV3Store('user-1','device',()=>{}, {
    bootstrap: async()=>bootstrap, mutate: async()=>{throw new Error('Sin escritura operativa')},
  })
  await cashier.refresh(); const frozen = structuredClone(cashier.bootstrap)
  const admin = new ManagementStore('admin-test',bootstrapFixture,()=>{},undefined,
    (async(a,p)=>mutationFixture(a,p)) as typeof managementMutate)
  await admin.mutation('ignore_30d',{family_key:'fp',scope:'global'},4)
  expect(cashier.bootstrap).toEqual(frozen)
  expect(cashier.bootstrap?.panel_state?.basis.groups_revision).toBe(7)
})

test('G2 familia estable: ignore/reactivate/propose mantienen scope y refrescan catálogo', async () => {
  let revision = 4, catalogRefreshes = 0
  const calls: string[] = []
  const store = new ManagementStore('admin-test',bootstrapFixture,()=>{},
    (async(a,p)=>{calls.push(a);return managementFixture(a,p,{incidents:revision,incidents_global:revision,devices:2})}) as typeof managementRead,
    (async(a,p)=>mutationFixture(a,p,false,{incidents:++revision,incidents_global:revision,devices:2})) as typeof managementMutate,
    undefined,
    ()=>{ catalogRefreshes++ })
  const family = (await store.load('summary',{})).families[0]
  const ignored = await store.mutation('ignore_30d',{family_key:family.family_key,scope:'global'},4)
  expect(ignored).toMatchObject({ family_key:family.family_key,scope:'global',site_id:null,status:'suppressed',until:'2026-10-04T12:00:00Z' })
  const active = await store.mutation('reactivate',{family_key:family.family_key,scope:'global'},5)
  expect(active.status).toBe('active')
  const proposed = await store.mutation('propose_delete',{family_key:family.family_key,scope:'site',site_id:'site-a'},4,'site-a')
  expect(proposed).toMatchObject({family_key:family.family_key,scope:'site',site_id:'site-a',status:'deletion_proposed',cambio_catalogo_id:'change-delete'})
  expect(catalogRefreshes).toBe(1)
  expect(calls).not.toContain('detail')
})

test('G2 revocación Admin se refleja al refrescar Cajero y limpia borradores', async () => {
  const fixture = cashierV3Bootstrap('pre_session'); let clears = 0
  fixture.site.id = 'site-a'; fixture.device.id = 'site-a-device-0'
  const cashier = new CashierV3Store('user-1','device',()=>{clears++},{
    bootstrap:async()=>parseCashierV3Bootstrap(structuredClone(fixture)),
    mutate:async()=>{throw new Error('No escritura')},
  })
  await cashier.refresh(); const previous = clears
  const admin = new ManagementStore('admin-test',bootstrapFixture,()=>{},undefined,
    (async(a,p)=>mutationFixture(a,p)) as typeof managementMutate)
  const revoked = await admin.mutation('revoke',{device_id:'site-a-device-0'},2,'site-a')
  expect(revoked.authorized_device).toBeNull()
  fixture.device.autorizado = false; fixture.device.estado = 'revocado'; fixture.revisions.devices = 3
  fixture.start_capability = { allowed: false, reason: 'SOLOG_DEVICE_UNAUTHORIZED' }
  fixture.stock = { snapshot_id: null, capturado_at: null, confirmado_at: null, snapshot_expira_at: null, version_catalogo: null }
  fixture.pre_session_summary = null
  await cashier.refresh()
  expect(cashier.bootstrap?.device.autorizado).toBe(false); expect(clears).toBeGreaterThan(previous)
})
