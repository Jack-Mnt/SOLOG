import { expect, test } from 'bun:test'
import { ManagementStore } from '../src/features/solog/admin/admin.management.store'
import { ManagementError, validatePublication, type managementRead, type managementMutate, type Payload } from '../src/features/solog/admin/admin.management.v2'
import { SologApiError } from '../src/features/solog/errors'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'
import { managementFixture, mutationFixture } from './fixtures/admin-management.mjs'

test('normalized transport errors preserve the original operation, not just raw network errors', async () => {
  const sent: Payload[] = []
  const mutate = (async (a,p) => { sent.push(p); if (sent.length === 1) throw new SologApiError('SOLOG_UNKNOWN_ERROR'); return mutationFixture(a,p,true) }) as typeof managementMutate
  const store = new ManagementStore('admin-test',bootstrapFixture,()=>{},undefined,mutate)
  await expect(store.mutation('update_package_price',{grupo_id:'g',precio_paquete:12},3)).rejects.toThrow()
  expect(store.intent('master')).toBeDefined(); await store.retryMutation('master'); expect(sent[0]).toEqual(sent[1])
})
for (const d of ['master','incidents'] as const) test(d+' revision conflict clears the rejected intent and refreshes its source',async()=>{
  const read = (async(a,p)=>managementFixture(a,p)) as typeof managementRead
  const mutate = (async()=>{throw new ManagementError('SOLOG_MASTERDATA_REVISION_CONFLICT')}) as typeof managementMutate
  const store=new ManagementStore('admin-test',bootstrapFixture,()=>{},read,mutate)
  if(d==='master') {await store.load('status',{});await expect(store.mutation('update_package_price',{grupo_id:'g',precio_paquete:12},3)).rejects.toThrow('REVISION');expect(store.peek('status',{}).data).toBeUndefined()}
  else {await store.load('summary',{});await expect(store.mutation('reactivate',{family_key:'fp',scope:'global'},4)).rejects.toThrow('REVISION');expect(store.peek('summary',{}).data).toBeUndefined()}
  expect(store.intent(d)).toBeUndefined()
})
test('authorization rejection clears data and notifies the Admin shell',async()=>{
  let forbidden=false
  const read=(async(a,p)=>{if(a==='list')throw new ManagementError('SOLOG_ADMIN_ROLE_REQUIRED');return managementFixture(a,p)}) as typeof managementRead
  const store=new ManagementStore('admin-test',()=>forbidden?null:bootstrapFixture(),(_,denied)=>{forbidden=!!denied},read)
  await store.load('status',{});await expect(store.load('list',{})).rejects.toThrow('ROLE');expect(forbidden).toBe(true);expect(store.peek('status',{}).data).toBeUndefined();await expect(store.load('reference',{})).rejects.toThrow('Contexto')
})
test('late response cannot cross a role change',async()=>{
  const auth=bootstrapFixture();let release!: (r:unknown)=>void
  const store=new ManagementStore('admin-test',()=>auth,()=>{},(()=>new Promise(r=>{release=r})) as typeof managementRead)
  const pending=store.load('status',{});auth.identity.rol='moderador';release(managementFixture('status'));await expect(pending).rejects.toThrow('invalidada');expect(store.peek('status',{}).data).toBeUndefined()
})
test('incident period expiration is anchored to backend time and leaves devices cached',async()=>{
  let clock=1000,calls=0
  const read=(async(a,p)=>{calls++;const r=managementFixture(a,p);if(a==='summary'){r.generated_at='2026-09-16T04:59:59Z';r.period.to='2026-09-15'}return r}) as typeof managementRead
  const store=new ManagementStore('admin-test',bootstrapFixture,()=>{},read,undefined,undefined,()=>clock)
  await store.load('summary',{});await store.load('list',{});expect(store.peek('summary',{}).expiresAt).toBe(2000)
  clock=2001;expect(store.peek('summary',{}).data).toBeUndefined();expect(store.peek('list',{}).data).toBeDefined();await store.load('summary',{});expect(calls).toBe(3)
})
test('mutation invalidates an older in-flight family detail without resurrecting it',async()=>{
  let release!: (r:unknown)=>void
  const read=(async(a,p)=>a==='detail'?new Promise(r=>{release=r}):managementFixture(a,p)) as typeof managementRead
  const mutate=(async(a,p)=>mutationFixture(a,p)) as typeof managementMutate
  const store=new ManagementStore('admin-test',bootstrapFixture,()=>{},read,mutate)
  const payload={family_key:'fp',page:0,page_size:100}, pending=store.load('detail',payload)
  await store.mutation('ignore_30d',{family_key:'fp',scope:'global'},4);release(managementFixture('detail',payload));await expect(pending).rejects.toThrow('invalidada');expect(store.peek('detail',payload).data).toBeUndefined()
})
test('Edge failure releases receipt only with a rejected preview or failed-ledger replay',()=>{
  const id='operation-1', body={ok:false,codigo:'CATALOG_UPLOAD_FAILED',operation_id:id}
  try{validatePublication(body,id)}catch(e){expect((e as ManagementError).uncertain).toBe(true)}
  try{validatePublication({...body,replay:true},id)}catch(e){expect((e as ManagementError).uncertain).toBe(false)}
  try{validatePublication({...body,operation_id:'another',replay:true},id)}catch(e){expect((e as ManagementError).uncertain).toBe(true)}
  try{validatePublication({...body,codigo:'NO_APPROVED_CATALOG_CHANGES',resultado:{ok:false}},id)}catch(e){expect((e as ManagementError).uncertain).toBe(false)}
  expect(()=>validatePublication({ok:true,codigo:'CATALOG_PUBLISHED',operation_id:'another'},id)).toThrow('otra operación')
})
test('different Auth users never share a management dataset',async()=>{
  const read=(async(a,p)=>managementFixture(a,p)) as typeof managementRead, auth=bootstrapFixture()
  const first=new ManagementStore('admin-test',()=>auth,()=>{},read);await first.load('status',{})
  const other={...auth,identity:{...auth.identity,id:'other'}}
  const second=new ManagementStore('other',()=>other,()=>{},read);expect(second.peek('status',{}).data).toBeUndefined()
  first.dispose();expect(first.peek('status',{}).data).toBeUndefined()
})
