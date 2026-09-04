import { describe, test, expect } from 'bun:test'
import { ManagementStore } from '../src/features/solog/admin/admin.management.store'
import { validateRead, ManagementError, type ReadAction, type MutationAction, type Payload, type Revisions, type Mutations, type PublicationResult, type managementRead, type managementMutate } from '../src/features/solog/admin/admin.management.v2'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'
import { managementFixture, mutationFixture } from './fixtures/admin-management.mjs'

function harness(options: { mutate?: (a: MutationAction, p: Payload) => unknown; read?: (a: ReadAction, p: Payload) => unknown; publish?: (id: string) => Promise<PublicationResult> } = {}) {
  const calls: { action: string; payload: Payload }[] = [], changes: Revisions[] = [], auth = bootstrapFixture()
  const read = async (a: ReadAction, p: Payload) => { calls.push({ action: a, payload: structuredClone(p) }); return options.read ? options.read(a,p) : managementFixture(a,p) }
  const mutate = async (a: MutationAction, p: Payload) => { calls.push({ action: a, payload: structuredClone(p) }); return options.mutate ? options.mutate(a,p) : mutationFixture(a,p) }
  const store = new ManagementStore('admin-test', () => auth, r => changes.push(r), read as typeof managementRead, mutate as typeof managementMutate, (options.publish ?? (async id => ({ ok: true, codigo: 'CATALOG_PUBLISHED', operation_id: id }))) as (id: string) => Promise<PublicationResult>)
  return { store, calls, changes, auth }
}
describe('A4–A6 reads and cache', () => {
  for (const action of ['status','reference','groups','group_products','catalog_changes','publication_preview','price_mismatch_options','summary','detail','list'] as ReadAction[]) test(action+' preserves its exact response', () => {
    const p = action === 'detail' ? { page: 0, page_size: 100, family_key: 'a'.repeat(64) } : { propuesta_fingerprint: 'fp', limit: 50, offset: 0 }
    const r = managementFixture(action,p); expect(validateRead(action,r)).toBe(r)
    expect(() => validateRead(action,{ ...r, contract_version: 1 })).toThrow()
  })
  test('master limit/offset; no generic data; device list has row revisions only', () => {
    expect(() => validateRead('groups',managementFixture('groups',{limit:51,offset:0}))).toThrow()
    expect(() => validateRead('groups',managementFixture('groups',{limit:50,offset:-1}))).toThrow()
    expect(() => validateRead('publication_preview',{...managementFixture('publication_preview'),preview:undefined,data:{}})).toThrow()
    expect(managementFixture('list')).not.toHaveProperty('revisions')
  })
  test('deduplicates, caches and separates sites; blocks unauthorized site', async () => {
    const {store,calls}=harness(); await Promise.all([store.load('summary',{}),store.load('summary',{})]); await store.load('summary',{}); expect(calls.length).toBe(1)
    await store.load('summary',{site_id:'site-a'}); await store.load('summary',{site_id:'site-b'}); expect(calls.length).toBe(3)
    await expect(store.load('summary',{site_id:'unknown'})).rejects.toThrow('Sede')
  })
  test('discards in-flight reads after refresh and disposal', async () => {
    let release: (value: unknown) => void = () => {}; const {store}=harness({read:()=>new Promise(resolve=>{release=resolve})})
    const request=store.load('status',{}); store.refresh(); release(managementFixture('status')); await expect(request).rejects.toThrow('invalidada'); expect(store.peek('status',{}).data).toBeUndefined()
    const next=store.load('status',{}); store.dispose(); release(managementFixture('status')); await expect(next).rejects.toThrow(); expect(store.peek('status',{}).data).toBeUndefined()
  })
  test('rejects mismatched family, page, site and stale revisions', async () => {
    const {store}=harness({read:(a,p)=>({...managementFixture(a,p),site_id:'site-b'})}); await expect(store.load('summary',{site_id:'site-a'})).rejects.toThrow('otra sede')
    const stale=harness({read:(a,p)=>managementFixture(a,p,{groups:2,catalog:5,incidents:4,devices:2})}); await expect(stale.store.load('status',{})).rejects.toThrow('obsoleta')
    const family=harness({read:(a,p)=>({...managementFixture(a,p),family_key:'different'})}); await expect(family.store.load('detail',{family_key:'fp',page:0,page_size:100})).rejects.toThrow('familia')
  })
})
describe('A4–A6 mutation intentions',()=>{
  const payloads: Record<string,Mutations[MutationAction]> = {group_change_save:{kind:'definition',nombre:'Grupo',categoria_id:'cat',precio:2,member_codes:[1,2]},catalog_change_action:{propuesta_fingerprint:'fp',action:'approve'},resolve_group_price:{propuesta_fingerprint:'fp',resolution:'separate_sku'},update_package_price:{grupo_id:'g',precio_paquete:10},ignore_30d:{family_key:'fp',scope:'site',site_id:'site-a'},reactivate:{family_key:'fp',scope:'site',site_id:'site-a'},propose_delete:{family_key:'fp',scope:'site',site_id:'site-a'},authorize:{device_id:'site-a-device-1'},replace:{device_id:'site-a-device-1'},revoke:{device_id:'site-a-device-0'},reject:{device_id:'site-a-device-1'}}
  for(const [action,payload] of Object.entries(payloads))test(action+' success and lost-response replay retain UUID/payload',async()=>{
    let attempts=0;const {store,calls}=harness({mutate:(a,p)=>{if(!attempts++)throw new Error('Network lost');return mutationFixture(a,p,true)}})
    const d = ['authorize','replace','revoke','reject'].includes(action)?'devices':['ignore_30d','reactivate','propose_delete'].includes(action)?'incidents':'master'
    await expect(store.mutation(action as MutationAction,payload,3,d==='master'?undefined:'site-a')).rejects.toThrow('Network')
    await expect(store.mutation(action as MutationAction,payload,3,d==='master'?undefined:'site-a')).rejects.toThrow('sin confirmar')
    const result=await store.retryMutation(d);expect(result.replay).toBe(true);expect(calls[0].payload).toEqual(calls[1].payload);expect(calls[0].payload.operation_id).toMatch(/^[0-9a-f-]{36}$/);expect(store.intent(d)).toBeUndefined()
    expect(calls[0].payload[d==='master'?'expected_groups_revision':'expected_revision']).toBe(3)
    if(d==='devices')expect(calls[0].payload).not.toHaveProperty('site_id')
  })
  test('revision conflict releases rejected intent, invalidates and uses a new UUID',async()=>{
    let fail=true;const {store,calls}=harness({mutate:(a,p)=>{if(fail){fail=false;throw new ManagementError('SOLOG_DEVICE_REVISION_CONFLICT')}return mutationFixture(a,p)}})
    await store.load('list',{site_id:'site-a'});await expect(store.mutation('authorize',{device_id:'site-a-device-1'},2,'site-a')).rejects.toThrow('REVISION');expect(store.intent('devices')).toBeUndefined();expect(store.peek('list',{site_id:'site-a'}).data).toBeUndefined()
    await store.load('list',{site_id:'site-a'});await store.mutation('authorize',{device_id:'site-a-device-1'},2,'site-a');expect(calls.filter(c=>c.action==='authorize')[0].payload.operation_id).not.toBe(calls.filter(c=>c.action==='authorize')[1].payload.operation_id)
  })
  test('device mutation invalidates target/global list, preserves other site and master',async()=>{
    const {store}=harness();await store.load('list',{site_id:'site-a'});await store.load('list',{site_id:'site-b'});await store.load('status',{});await store.mutation('revoke',{device_id:'site-a-device-0'},2,'site-a')
    expect(store.peek('list',{site_id:'site-a'}).data).toBeUndefined();expect(store.peek('list',{site_id:'site-b'}).data).toBeDefined();expect(store.peek('status',{}).data).toBeDefined()
  })
  test('propose deletion invalidates catalog and affected family, not devices',async()=>{
    const {store}=harness();await store.load('status',{});await store.load('summary',{});await store.load('list',{});await store.mutation('propose_delete',{family_key:'fp',scope:'global'},4)
    expect(store.peek('status',{}).data).toBeUndefined();expect(store.peek('summary',{}).data).toBeUndefined();expect(store.peek('list',{}).data).toBeDefined()
  })
  test('old replay never rolls revisions back',async()=>{
    const {store}=harness({mutate:(a,p)=>mutationFixture(a,p,true,{groups:2,catalog:4,incidents:3,devices:1})});await store.load('status',{});await store.mutation('update_package_price',{grupo_id:'g',precio_paquete:8},3);await store.load('status',{});expect(store.peek('status',{}).data?.revisions.groups).toBe(3)
  })
  test('prepared publication retry preserves operation; no client artifact fields',async()=>{
    const ids:string[]=[];let attempt=0;const {store}=harness({publish:async id=>{ids.push(id);if(!attempt++)throw new ManagementError('upload acknowledged, commit response lost',true);return {ok:true,codigo:'CATALOG_PUBLISHED',operation_id:id,replay:true}}})
    await expect(store.publish()).rejects.toThrow('lost');const result=await store.publish();expect(result.replay).toBe(true);expect(ids[0]).toBe(ids[1]);expect(store.publication.operationId).toBeUndefined()
  })
  test('moderator cannot publish; disposed scope cannot mutate',async()=>{
    const {store,auth}=harness();auth.identity.rol='moderador';await expect(store.publish()).rejects.toThrow('admin');store.dispose();await expect(store.mutation('revoke',{device_id:'site-a-device-0'},2,'site-a')).rejects.toThrow('Contexto')
  })
})
