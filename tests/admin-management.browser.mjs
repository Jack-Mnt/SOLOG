// A4–A6 browser simulation. All non-local traffic is intercepted; never production.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { bootstrapFixture, responseFixture } from './fixtures/admin-v2.mjs'
import { managementFixture, mutationFixture } from './fixtures/admin-management.mjs'
const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({server:{host:'127.0.0.1',port:5209,strictPort:true},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://solog-admin-v2.test'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('test-only')}})
await server.listen()
const browser=await chromium.launch({headless:true,executablePath:process.env.SOLOG_TEST_BROWSER})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const user={id:'admin-test',email:'admin@example.test',role:'authenticated',app_metadata:{},user_metadata:{rol:'cajero'},aud:'authenticated',created_at:'2026-09-04T12:00:00Z'}
const exp=Math.floor(Date.now()/1000)+3600,jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp}].map(p=>Buffer.from(JSON.stringify(p)).toString('base64url')).join('.')+'.test'
await context.addInitScript(({user,jwt,exp})=>localStorage.setItem('sb-solog-admin-v2-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user})),{user,jwt,exp})
const calls=[],errors=[],revisions={groups:3,catalog:5,incidents:4,devices:2}, deviceStates=new Map(), mutationLedger=new Map()
let failMutation=false, domainError=false, publishAttempts=0, bytes=0, approved=false, suppressed=false, deletion=false
const count=a=>calls.filter(c=>c.action===a).length
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue()
  if(url.hostname!=='solog-admin-v2.test'){errors.push('External '+url.hostname);return route.abort()}
  const fulfill=(r,status=200)=>{const body=JSON.stringify(r);bytes+=Buffer.byteLength(body);return route.fulfill({status,contentType:'application/json',body})}
  if(url.pathname==='/auth/v1/user')return fulfill(user)
  if(url.pathname==='/auth/v1/logout')return fulfill({})
  const rpc=url.pathname.split('/').at(-1),body=route.request().postDataJSON()
  if(rpc==='conexion-admin'){
    assert.deepEqual(Object.keys(body).sort(),['action','operation_id']);assert.equal(body.action,'publish_catalog');calls.push({rpc,action:'publish',payload:body})
    if(!publishAttempts++)return fulfill({ok:false,codigo:'SOLOG_OPERATION_IN_PROGRESS'},409)
    assert.equal(body.operation_id,calls.find(c=>c.action==='publish').payload.operation_id)
    return fulfill({ok:true,codigo:'CATALOG_PUBLISHED',operation_id:body.operation_id,replay:true,version:6,completion_recorded:true})
  }
  assert.ok(['rpc_solog_admin_bootstrap_v2','rpc_solog_operational_v2','rpc_solog_admin_master_read_v2','rpc_solog_admin_master_v2','rpc_solog_admin_incidents_v2','rpc_solog_admin_devices_v2'].includes(rpc),'Only v2: '+rpc)
  const action=rpc==='rpc_solog_admin_bootstrap_v2'?'bootstrap':body.p_action,p=body.p_payload;calls.push({rpc,action,payload:p})
  if(action==='bootstrap'){const r=bootstrapFixture();r.revisions={groups:revisions.groups,catalog:revisions.catalog};r.allowed_sites.forEach(s=>{s.devices_revision=revisions.devices;s.incidents_revision=revisions.incidents});return fulfill(r)}
  if(rpc==='rpc_solog_operational_v2'){const r=responseFixture(action,p);if(r.revisions.groups!==undefined)r.revisions.groups=revisions.groups;return fulfill(r)}
  if(p.operation_id){
    assert.match(p.operation_id,/^[0-9a-f-]{36}$/)
    if(rpc==='rpc_solog_admin_devices_v2')assert.deepEqual(Object.keys(p).sort(),['device_id','expected_revision','operation_id'])
    if(domainError){domainError=false;return fulfill({code:'P0001',message:'SOLOG_DEVICE_REVISION_CONFLICT'},400)}
    if(mutationLedger.has(p.operation_id)){assert.deepEqual(mutationLedger.get(p.operation_id).payload,p);return fulfill({...mutationLedger.get(p.operation_id).result,replay:true})}
    if(rpc==='rpc_solog_admin_master_v2'){revisions.groups++;revisions.catalog++;if(action==='catalog_change_action')approved=p.action==='approve'}
    if(rpc==='rpc_solog_admin_incidents_v2'){revisions.incidents++;if(action==='ignore_30d')suppressed=true;if(action==='reactivate')suppressed=false;if(action==='propose_delete'){deletion=true;revisions.catalog++}}
    if(rpc==='rpc_solog_admin_devices_v2'){revisions.devices++;deviceStates.set(p.device_id,action==='revoke'||action==='reject'?'removed':'autorizado');if(action==='replace')deviceStates.set(p.device_id.replace('-1','-0'),'removed')}
    const result=mutationFixture(action,p,false,revisions)
    if(rpc==='rpc_solog_admin_devices_v2') {
      const rows=managementFixture('list',{site_id:result.site_id},revisions).devices.filter(d=>deviceStates.get(d.id)!=='removed').map(d=>({...d,estado:deviceStates.get(d.id)??d.estado}))
      const current=rows.find(d=>d.estado==='autorizado')
      result.authorized_device=current?{id:current.id,estado:current.estado,autorizado_at:current.autorizado_at,ultimo_acceso_at:current.ultimo_acceso_at}:null
      result.pending_devices=rows.filter(d=>d.estado==='pendiente').map(({id,estado,solicitado_por,solicitado_at,ultimo_acceso_at})=>({id,estado,solicitado_por,solicitado_at,ultimo_acceso_at}))
    }
    mutationLedger.set(p.operation_id,{payload:p,result})
    if(failMutation){failMutation=false;return route.abort('connectionfailed')}
    return fulfill(result)
  }
  if(['groups','group_products','catalog_changes'].includes(action)){assert.equal(p.limit,50);assert.ok(p.offset>=0);assert.equal('page' in p||'cursor' in p,false)}
  const r=managementFixture(action,p,revisions)
  if(action==='catalog_changes'&&approved)r.rows[0].estado='aprobado'
  if(action==='summary'){r.families[0].suppressed_cases=suppressed?2:0;r.families[0].pending_cases=suppressed?0:2;r.families[0].active_suppression_until=suppressed?'2026-10-04T12:00:00Z':null;r.families[0].deletion_proposed=deletion}
  if(action==='list')r.devices=r.devices.filter(d=>deviceStates.get(d.id)!=='removed').map(d=>({...d,estado:deviceStates.get(d.id)??d.estado}))
  return fulfill(r)
})
const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
const nav=label=>page.getByRole('navigation',{name:'Módulos administrativos'}).getByRole('button',{name:label,exact:true}).click()
const close=()=>page.getByRole('dialog').last().getByRole('button',{name:'Cerrar',exact:true}).click()
try{
  await page.goto('http://127.0.0.1:5209/admin/catalogo');await page.getByRole('button',{name:'Ver propuesta'}).waitFor();assert.equal(count('bootstrap'),1);assert.equal(count('publication_preview'),0)
  await page.getByRole('button',{name:'Ver propuesta'}).click();await page.getByRole('button',{name:'Aprobar',exact:true}).click();await page.getByRole('heading',{name:'Resolver precio del grupo'}).waitFor();await page.getByRole('button',{name:'Actualizar precio de todo el grupo'}).click();await page.getByRole('dialog').waitFor({state:'detached'})
  await page.getByRole('button',{name:'Revisar publicación'}).click();await page.getByRole('button',{name:'Confirmar publicación'}).click();await page.getByRole('button',{name:'Reintentar publicación'}).waitFor();await page.reload();await page.getByRole('button',{name:'Recuperar publicación'}).click();await page.getByRole('button',{name:'Reintentar publicación'}).click();await page.getByText(/CATALOG_PUBLISHED/).waitFor();await close();assert.equal(count('publish'),2)
  await nav('Grupos');await page.getByRole('heading',{name:'Bebidas agrupadas'}).waitFor();await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Nombre actualizado');failMutation=true;await page.getByRole('button',{name:'Guardar cambio'}).click();await page.getByRole('dialog').getByRole('button',{name:'Reintentar misma operación'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByText(/replay confirmado|confirmada \(replay\)/).first().waitFor()
  await page.getByRole('button',{name:'Precio por paquete',exact:true}).click();await page.getByLabel('Nuevo precio por paquete').fill('12');await page.getByRole('button',{name:'Actualizar precio x6',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'})
  await page.getByRole('button',{name:'Crear grupo',exact:true}).click();await page.getByRole('dialog').getByLabel('Nombre',{exact:true}).fill('Grupo nuevo');await page.getByRole('dialog').getByLabel('Categoría').selectOption('cat-1');await page.getByLabel('Precio unitario',{exact:true}).fill('2');await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();await page.getByRole('button',{name:'Guardar cambio'}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.deepEqual(calls.filter(c=>c.action==='group_change_save').at(-1).payload.member_codes,[123,124])
  await page.getByRole('button',{name:'Productos',exact:true}).click();await page.getByRole('button',{name:'Clasificar'}).first().click();await page.getByLabel('Modalidad').selectOption('Único');await page.getByRole('button',{name:'Guardar cambio'}).click();await page.getByRole('dialog').waitFor({state:'detached'})
  await nav('Incidencias');await page.getByText('2 casos · 7 apariciones · 2 sedes').waitFor();assert.equal(count('detail'),0);await page.getByRole('button',{name:/Ver repeticiones/}).click();await page.getByRole('dialog').getByText('Sede A',{exact:true}).waitFor();await close();await page.getByRole('button',{name:/Ver repeticiones/}).click();await close();assert.equal(count('detail'),1)
  failMutation=true;await page.getByRole('button',{name:'Ignore 30d',exact:true}).click();await page.getByRole('button',{name:'Reintentar misma operación'}).click();await page.getByText('0 pendientes · 2 suprimidos').waitFor();await page.getByRole('button',{name:'Reactivate',exact:true}).click();await page.getByText('2 pendientes · 0 suprimidos').waitFor();await page.getByRole('button',{name:'Propose deletion',exact:true}).click();await page.getByText('Eliminación propuesta en Catálogo.').waitFor()
  if(process.env.SOLOG_MANAGEMENT_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_MANAGEMENT_SCREENSHOT.replace('.png','-incidents.png'),fullPage:true})
  await nav('Dispositivos');await page.getByRole('heading',{name:'Sede A',exact:true}).waitFor();await page.getByLabel('Sede de dispositivos').selectOption('site-a');await page.getByRole('button',{name:'Autorizar',exact:true}).click();domainError=true;await page.getByRole('button',{name:'Confirmar autorizar'}).click();await page.getByRole('alert').waitFor();await close()
  await page.getByRole('button',{name:'Reemplazar',exact:true}).click();failMutation=true;await page.getByRole('button',{name:'Confirmar reemplazar'}).click();await page.getByRole('dialog').getByRole('button',{name:'Reintentar misma operación'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByText(/replay confirmado|confirmada \(replay\)/).first().waitFor();await page.getByRole('button',{name:'Revocar',exact:true}).click();await page.getByRole('button',{name:'Confirmar revocar'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByText('Sin dispositivos autorizados ni solicitudes.').waitFor()
  await page.getByLabel('Sede de dispositivos').selectOption('site-b');await page.getByRole('button',{name:'Rechazar',exact:true}).click();await page.getByRole('button',{name:'Confirmar rechazar'}).click();await page.getByRole('dialog').waitFor({state:'detached'})
  if(process.env.SOLOG_MANAGEMENT_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_MANAGEMENT_SCREENSHOT.replace('.png','-devices.png'),fullPage:true})
  await nav('Dashboard');await page.getByRole('heading',{name:'Sede A',exact:true}).waitFor();const cards=count('dashboard_cards');await nav('Dispositivos');await page.getByRole('heading',{name:'Sede B',exact:true}).waitFor();await nav('Dashboard');await page.getByRole('heading',{name:'Sede A',exact:true}).waitFor();assert.equal(count('dashboard_cards'),cards)
  await nav('Catálogo');await page.getByRole('button',{name:'Ver propuesta'}).waitFor();if(process.env.SOLOG_MANAGEMENT_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_MANAGEMENT_SCREENSHOT.replace('.png','-catalog.png'),fullPage:true})
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,calls:calls.length,bytes,actions:[...new Set(calls.map(c=>c.action))],productionRequests:0,errors},null,2))
}finally{await browser.close();await server.close()}
