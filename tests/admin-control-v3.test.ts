import { expect, test } from 'bun:test'

import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import { validateAdminResponse, validateControlPayload, type adminRpc, type AdminPayloads } from '../src/features/solog/admin/admin.v2'
import { controlView } from '../src/features/solog/admin/control/admin.control.data'
// @ts-expect-error shared browser fixtures
import { responseFixture } from './fixtures/admin-v2.mjs'

const context = { site_id: 'site-a', period: 'today' as const }
const chronology = { site_id: 'site-a', group_id: 'group-0', period: 'current_biweekly' as const }
type MutableScopeFixture = { site_id: string; period: { key: string; from: string }; group: { id: string } }
function setup(transform = (_action: string, value: unknown) => value) {
  const calls: { action: string; payload: unknown }[] = []
  const rpc = (async (action, payload) => {
    calls.push({ action, payload })
    return validateAdminResponse(action, transform(action, responseFixture(action, payload)))
  }) as typeof adminRpc
  return { store: new AdminStore('admin-test', rpc), calls }
}
test('V10 dataset completo, payload mínimo y caché por sede/período/custom sin revalidación', async () => {
  const { store, calls } = setup()
  await store.load('bootstrap', {})
  for (const payload of [context, { ...context, period: 'current_biweekly' as const }, context, { ...context, site_id: 'site-b' }, { ...context, period: 'custom' as const, date_from: '2026-09-01', date_to: '2026-09-05' }, context]) {
    expect((await store.load('control_groups', payload)).items).toHaveLength(101)
  }
  expect(calls.filter(c => c.action === 'control_groups')).toEqual([
    {action:'control_groups',payload:context},
    {action:'control_groups',payload:{...context,period:'current_biweekly'}},
    {action:'control_groups',payload:{...context,site_id:'site-b'}},
    {action:'control_groups',payload:{...context,period:'custom',date_from:'2026-09-01',date_to:'2026-09-05'}},
  ])
  store.dispose()
})
test('V10 rechaza filtros/paginación remotos, fechas incorrectas y período no quincenal del Eye', async () => {
  for (const key of ['state','search','page','page_size']) expect(() => validateControlPayload('control_groups', {...context,[key]:0})).toThrow()
  for (const p of [{...context,date_from:'2026-09-01'}, {...context,period:'custom'}, {...context,period:'custom',date_from:'2026-02-30',date_to:'2026-03-01'}, {...context,period:'custom',date_from:'2026-01-01',date_to:'2026-04-03'}]) expect(() => validateControlPayload('control_groups',p)).toThrow()
  expect(() => validateControlPayload('control_groups',{...context,period:'custom',date_from:'2026-01-01',date_to:'2026-04-02'})).not.toThrow()
  for (const period of ['today','last_week','custom']) expect(() => validateControlPayload('control_chronology',{...chronology,period})).toThrow()
  const {store,calls}=setup();await store.load('bootstrap',{})
  await expect(store.load('control_groups', {...context, page:0} as AdminPayloads['control_groups'])).rejects.toThrow('Payload')
  expect(calls).toHaveLength(1)
})
test('V10 resumen base estable, búsqueda + estado locales, 100 por página sin mutar dataset', () => {
  const data = validateAdminResponse('control_groups',responseFixture('control_groups',context))
  const original = JSON.stringify(data)
  const all = controlView(data.items,'','',0)
  expect(all.summary).toEqual({total:101,coincide:26,pending_recount:25,confirmed:25,inconsistent:25})
  expect(all.rows).toHaveLength(100)
  expect(controlView(data.items,'','',1).rows.map(r=>r.group_id)).toEqual(['group-100'])
  const filtered = controlView(data.items,'Recontar','  GRUPO 1 ',0)
  expect(filtered.summary).toEqual(all.summary)
  expect(filtered.rows.map(r=>r.group_id)).toEqual(['group-1','group-13','group-17'])
  expect(controlView(data.items,'','no existe',0).rows).toHaveLength(0)
  expect(JSON.stringify(data)).toBe(original)
})
test('V10 cronología se cachea por sede/grupo/quincena, conserva filas y valores autoritativos', async () => {
  const {store,calls}=setup();await store.load('bootstrap',{})
  await store.load('control_groups',{...context,period:'previous_biweekly'})
  const r=await store.load('control_chronology',chronology)
  await store.load('control_chronology',chronology)
  await store.load('control_chronology',{...chronology,period:'previous_biweekly'})
  await store.load('control_chronology',{...chronology,group_id:'group-1'})
  expect(calls.filter(c=>c.action==='control_chronology')).toHaveLength(3)
  expect(r.chronology.map(row=>[row.state,row.difference,row.valued_difference])).toEqual([['Recontado',10,220],['Recontado',-10,-420],['Confirmada',5,110],['Inconsistente',5,210]])
  expect(r.chronology[0].event_at).toBe('2026-09-03T22:30:00Z')
  expect(r.chronology[2].event_at).toBe('2026-09-16T22:30:00Z')
  store.dispose()
})
test('V10 rechaza versión, revisiones, campos ausentes, no finitos, duplicados y estados inválidos', () => {
  for (const action of ['control_groups','control_chronology'] as const) {
    const payload=action==='control_groups'?context:chronology
    for (const change of [(r: Record<string,unknown>)=>{r.contract_version=10},(r: Record<string,unknown>)=>{r.revisions={}},(r: Record<string,unknown>)=>{r.revisions={operational:-1}},(r: Record<string,unknown>)=>{r.period={key:'bad',from:'2026-01-01',to:'2026-01-02'}}]) {
      const r=responseFixture(action,payload);change(r);expect(()=>validateAdminResponse(action,r)).toThrow()
    }
    const rowsKey=action==='control_groups'?'items':'chronology'
    for(const key of action==='control_groups'?['group_id','category','origin_at','valued_difference']:['row_id','event_at','physical','valuation']){
      const r=responseFixture(action,payload);delete r[rowsKey][0][key];expect(()=>validateAdminResponse(action,r)).toThrow()
    }
    const r=responseFixture(action,payload);r[rowsKey][0].valued_difference=Infinity;expect(()=>validateAdminResponse(action,r)).toThrow()
    const duplicate=responseFixture(action,payload);duplicate[rowsKey].push(duplicate[rowsKey][0]);expect(()=>validateAdminResponse(action,duplicate)).toThrow()
  }
  const group=responseFixture('control_groups',context);group.items[0].state='Recontado';expect(()=>validateAdminResponse('control_groups',group)).toThrow()
  const r=responseFixture('control_chronology',chronology);r.chronology[0].valuation.package_price=undefined;expect(()=>validateAdminResponse('control_chronology',r)).toThrow()
})
test('V10 valida sede, grupo, período y custom antes de publicar en caché', async () => {
  for(const [action,payload,change] of [
    ['control_groups',context,(r:MutableScopeFixture)=>{r.site_id='site-b'}],
    ['control_groups',context,(r:MutableScopeFixture)=>{r.period.key='last_week'}],
    ['control_groups',{...context,period:'custom',date_from:'2026-09-01',date_to:'2026-09-03'},(r:MutableScopeFixture)=>{r.period.from='2026-09-02'}],
    ['control_chronology',chronology,(r:MutableScopeFixture)=>{r.group.id='other'}],
    ['control_chronology',chronology,(r:MutableScopeFixture)=>{r.period.key='previous_biweekly'}],
  ] as const) {
    const {store}=setup((a,r)=>{if(a===action)change(r as MutableScopeFixture);return r});await store.load('bootstrap',{})
    await expect(store.load(action,payload as never)).rejects.toThrow()
    expect(store.peek(action,payload as never).data).toBeUndefined()
    store.dispose()
  }
})
test('V10 revisiones nuevas no recargan datasets ya cacheados; refresh y revocación sí los limpian', async () => {
  let revision=10, forbidden=false
  const {store,calls}=setup((a,value)=>{const r=value as {revisions:{operational?:number}};if(forbidden&&a==='daily_detail')throw Object.assign(new Error('revocado'),{code:'SOLOG_ADMIN_ROLE_REQUIRED'});if(a!=='bootstrap'&&r.revisions.operational!==undefined)r.revisions.operational=revision;return r})
  await store.load('bootstrap',{})
  const base=await store.load('control_groups',context)
  revision=11;await store.load('control_chronology',chronology)
  expect(await store.load('control_groups',context)).toBe(base)
  expect(calls.filter(c=>c.action==='control_groups')).toHaveLength(1)
  store.refresh();expect(store.peek('control_groups',context).data).toBeUndefined()
  await store.load('control_groups',context)
  forbidden=true;await expect(store.load('daily_detail',{site_id:'site-a',origin_date:'2026-09-03'})).rejects.toThrow()
  expect(store.peek('control_groups',context).data).toBeUndefined();expect(store.bootstrap).toBeNull()
})
test('V10 Control no consume acciones anteriores ni envía filtros locales', async () => {
  const source=await Bun.file('src/features/solog/admin/control/admin.control.v2.tsx').text()
  expect(source).not.toMatch(/["']control_(page|detail)["']/)
  expect(source).toContain('"control_groups"')
  expect(source).toContain('"control_chronology"')
  expect(source).toContain('useState<ControlChronologyPeriod>("current_biweekly")')
  expect(source).not.toContain('Aplicar filtros')
  expect(source).not.toContain('<select')
  expect(source).not.toContain('setPayload')
  expect(source).not.toContain('confirmedRange')
  expect(source).toContain('!site || invalid ? null')
  expect(source).toContain('No hay registros en esta quincena.')
  expect(source).toContain('aria-label="Quincena de cronología"')
})
test('Control retiró llamadas legacy y comparte modal de exportación', async () => {
  const api = await Bun.file('src/features/solog/api.ts').text()
  expect(api).not.toMatch(/rpc_solog_control(?:'|_detalle'|_export')/)
  for (const path of ['dashboard/admin.dashboard.v2.tsx','control/admin.control.v2.tsx']) {
    expect(await Bun.file('src/features/solog/admin/'+path).text()).toContain('AdminExportDialog')
  }
})
