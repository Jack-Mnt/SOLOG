import { expect, test } from 'bun:test'
import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import { validateAdminResponse, type adminRpc } from '../src/features/solog/admin/admin.v2'
// @ts-expect-error shared JS fixture
import { responseFixture } from './fixtures/admin-v2.mjs'
const payload = { site_id: 'site-a', origin_date: '2026-09-03' }
test('respuesta tardía invalidada no reemplaza la respuesta nueva', async () => {
  let resolve!: (value: unknown) => void
  let first = true
  const rpc = (async (action, p) => {
    if (action === 'daily_detail' && first) { first = false; return new Promise(r => { resolve = r }) }
    const response = responseFixture(action,p)
    if (action !== 'bootstrap') response.revisions.operational = 11
    return response
  }) as typeof adminRpc
  const store = new AdminStore('admin-test',rpc)
  await store.load('bootstrap',{})
  const old = store.load('daily_detail',payload)
  await store.load('control_detail',{site_id:'site-a',group_id:'group-0'})
  const fresh = await store.load('daily_detail',payload)
  resolve(responseFixture('daily_detail',payload))
  await expect(old).rejects.toThrow('invalidada')
  expect(store.peek('daily_detail',payload).data).toBe(fresh)
  expect(store.peek('daily_detail',payload).error).toBeUndefined()
})
test('cambio global groups invalida ambas sedes sin modificar KPI', async () => {
  const rpc = (async (action,p) => { const r=responseFixture(action,p); if(action==='shift_grid')r.revisions.groups=4; return r }) as typeof adminRpc
  const store=new AdminStore('admin-test',rpc);await store.load('bootstrap',{})
  await store.load('daily_detail',payload);await store.load('daily_detail',{...payload,site_id:'site-b'})
  await store.load('shift_grid',{site_id:'site-a'})
  expect(store.peek('daily_detail',payload).data).toBeUndefined()
  expect(store.peek('daily_detail',{...payload,site_id:'site-b'}).data).toBeUndefined()
})
test('cambio de rol descarta datos incluso con revisiones iguales', async () => {
  let role='admin'
  const rpc=(async (a,p)=>{const r=responseFixture(a,p);if(a==='bootstrap'){r.identity.rol=role;r.permissions.can_admin=role==='admin'}return r}) as typeof adminRpc
  const store=new AdminStore('admin-test',rpc);await store.load('bootstrap',{});await store.load('daily_detail',payload)
  role='moderador';store.retry('bootstrap',{});await store.load('bootstrap',{})
  expect(store.peek('daily_detail',payload).data).toBeUndefined();expect(store.bootstrap?.identity.rol).toBe('moderador')
})
test('sesiones Auth distintas no comparten datos aunque coincidan filtros', async () => {
  const a=new AdminStore('admin-test',(async (action,p)=>responseFixture(action,p)) as typeof adminRpc)
  const b=new AdminStore('other-user',(async (action,p)=>{const r=responseFixture(action,p);if(action==='bootstrap')r.identity.id='other-user';return r}) as typeof adminRpc)
  await a.load('bootstrap',{});await a.load('daily_detail',payload);await b.load('bootstrap',{})
  expect(b.peek('daily_detail',payload).data).toBeUndefined();expect(a.key('daily_detail',payload)).not.toBe(b.key('daily_detail',payload))
})
test('validación de contrato rechaza campos operacionales ausentes o no finitos', () => {
  for (const action of ['daily_detail','control_detail','export'] as const) {
    const r=responseFixture(action,payload)
    r.revisions={};expect(()=>validateAdminResponse(action,r)).toThrow()
  }
  const daily=responseFixture('daily_detail',payload);delete daily.items[0].physical
  expect(()=>validateAdminResponse('daily_detail',daily)).toThrow()
  const exp=responseFixture('export',{site_id:'site-a'});exp.adjustments[0].valorizado=Infinity
  expect(()=>validateAdminResponse('export',exp)).toThrow()
})
test('error de transporte permite retry explícito sin bucle de refetch', async () => {
  let calls=0
  const store=new AdminStore('admin-test',(async (a,p)=>{if(a==='daily_detail'&&calls++===0)throw new Error('Network');return responseFixture(a,p)}) as typeof adminRpc)
  await store.load('bootstrap',{});await expect(store.load('daily_detail',payload)).rejects.toThrow('Network')
  expect(store.peek('daily_detail',payload).error).toBe('Network');expect(calls).toBe(1)
  store.retry('daily_detail',payload);await store.load('daily_detail',payload);expect(calls).toBe(2)
})
