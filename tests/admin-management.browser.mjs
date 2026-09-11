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
  if(action==='catalog_changes') {
    const price=r.rows[0]
    const urgent={...price,propuesta_fingerprint:'add-fingerprint',cambio_id:'change-add',tipo:'agregar_producto',seccion:'urgente',producto:'Producto urgente',c_interno:456,datos:{precio:4},catalogo_actual:{...price.catalogo_actual,producto:null,precio:null}}
    const approvedRow={...price,propuesta_fingerprint:'name-fingerprint',cambio_id:'change-name',tipo:'nombre',estado:'aprobado',producto:'Nombre vigente',datos:{producto_nuevo:'Nombre propuesto'}}
    const ignoredRow={...price,propuesta_fingerprint:'code-fingerprint',cambio_id:'change-code',tipo:'codigo',estado:'ignorado',datos:{c_barras_nuevo:'987654321'}}
    const incorporatedRow={...price,propuesta_fingerprint:'delete-fingerprint',cambio_id:'change-delete',tipo:'eliminar_producto',estado:'incorporado'}
    const rows=[price,urgent,approvedRow,ignoredRow,incorporatedRow]
    r.rows=rows.filter(change=>!p.estado||change.estado===p.estado).slice(p.offset,p.offset+p.limit)
    r.counts={pendiente:2,aprobado:1,ignorado:1,incorporado:1,urgentes_pendientes:1,cambios_pendientes:1,producto_aprobado:1,grupo_aprobado:0}
  }
  if(action==='reference') {
    r.categories.push({id:'cat-empty',nombre:'Sin grupos'})
    r.groups.push({...r.groups[0],id:'unique',nombre:'Agua individual',unidades_por_paquete:null,precio_paquete:null})
    r.groups.push({...r.groups[0],id:'incomplete',nombre:'Grupo con un nombre largo para verificar legibilidad sin truncamiento agresivo',unidades_por_paquete:null,precio_paquete:null})
  }
  if(action==='groups') {
    const base=r.rows[0]
    r.rows=[base,{...base,id:'unique',nombre:'Agua individual',tipo:'Único',sku_count:1,precio:1},{...base,id:'incomplete',nombre:'Grupo con un nombre largo para verificar legibilidad sin truncamiento agresivo',sku_count:4,precio:3.5}]
      .filter(g=>(!p.tipo||g.tipo===p.tipo)&&(!p.categoria_id||g.categoria_id===p.categoria_id)&&(!p.buscar||g.nombre.toLowerCase().includes(p.buscar.toLowerCase())))
      .slice(p.offset,p.offset+p.limit)
  }
  if(action==='catalog_changes'&&approved)r.rows=r.rows.filter(change=>change.propuesta_fingerprint!=='price-fingerprint')
  if(action==='summary'){const family=r.families[0];family.suppressed_cases=suppressed?2:0;family.pending_cases=suppressed?0:2;family.resolved_cases=0;family.active_cases=2;family.active=true;family.family_state=suppressed?'suprimida':'pendiente';family.resolved_at=null;family.active_suppression_until=suppressed?'2026-10-04T12:00:00Z':null;family.scope_suppression_until=suppressed&&!p.site_id?'2026-10-04T12:00:00Z':null;family.reactivate_available=!!family.scope_suppression_until;family.deletion_proposed=deletion}
  if(action==='list')r.devices=r.devices.filter(d=>deviceStates.get(d.id)!=='removed').map(d=>({...d,estado:deviceStates.get(d.id)??d.estado}))
  return fulfill(r)
})
const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
const nav=label=>page.getByRole('navigation',{name:'Módulos administrativos'}).getByRole('button',{name:label,exact:true}).click()
const close=()=>page.getByRole('dialog').last().getByRole('button',{name:'Cerrar',exact:true}).click()
try{
  await page.goto('http://127.0.0.1:5209/admin/catalogo');await page.getByRole('button',{name:/Revisar propuesta/}).first().waitFor();assert.equal(count('bootstrap'),1);assert.equal(count('publication_preview'),0)
  const catalog=page.locator('.admin-catalog')
  assert.equal(await catalog.getByRole('button',{name:'Pendientes 2'}).getAttribute('aria-pressed'),'true')
  assert.equal(await catalog.getByRole('button',{name:'Todas'}).count(),0)
  assert.deepEqual(await catalog.locator('.admin-catalog__section--urgent thead th').allTextContents(),['Tipo','Nombre','C. Interno','Precio','Acciones'])
  assert.deepEqual(await catalog.locator('.admin-catalog__section--emerging thead th').allTextContents(),['Tipo','Nombre','Actual','Nuevo valor','Acciones'])
  assert.equal(await catalog.getByRole('button',{name:/Revisar propuesta/}).count()>0,true)
  await catalog.getByRole('button',{name:'Aprobados 1'}).click();await catalog.getByText('Nombre propuesto',{exact:true}).waitFor();assert.equal(await catalog.getByRole('button',{name:'Aprobados 1'}).getAttribute('aria-pressed'),'true')
  await catalog.getByRole('button',{name:'Ignorados 1'}).click();await catalog.getByText('987654321',{exact:true}).waitFor()
  await catalog.getByRole('button',{name:'Incorporados 1'}).click();await catalog.getByText('Eliminar producto',{exact:true}).waitFor()
  await catalog.getByRole('button',{name:'Pendientes 2'}).click();await catalog.getByText('Producto urgente',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Revisar propuesta: Bebida prueba',exact:true}).click();assert.equal(await page.getByRole('dialog').locator('pre').count(),0);await page.getByRole('button',{name:'Aprobar',exact:true}).click();await page.getByRole('heading',{name:'Resolver precio del grupo'}).waitFor();await page.getByRole('button',{name:'Actualizar precio de todo el grupo'}).click();await page.getByRole('dialog').waitFor({state:'detached'})
  await page.getByRole('button',{name:'Revisar publicación'}).click();await page.getByRole('button',{name:'Confirmar publicación'}).click();await page.getByRole('button',{name:'Reintentar publicación'}).waitFor();await page.reload();await page.getByRole('button',{name:'Recuperar publicación'}).click();await page.getByRole('button',{name:'Reintentar publicación'}).click();await page.getByText(/CATALOG_PUBLISHED/).waitFor();await close();assert.equal(count('publish'),2)
  await nav('Grupos');
  const groups=page.locator('.admin-groups'),table=groups.getByRole('table'),groupRow=()=>table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Bebidas agrupadas',exact:true})})
  await groupRow().waitFor()
  assert.deepEqual(await table.locator('thead th').allTextContents(),['Grupo','Categoría','Agrupación','Precio','Paquete','Acciones'])
  assert.equal(await groups.locator('.admin-v2-cards').count(),0)
  await groupRow().getByText('2 SKU',{exact:true}).waitFor()
  assert.match(await groupRow().locator('td').nth(2).innerText(),/S\/\s*2\.00/)
  assert.match(await groupRow().locator('td').nth(3).innerText(),/x6 · S\/\s*10\.00/)
  const unique=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Agua individual'})})
  assert.equal(await unique.locator('td').nth(1).innerText(),'Único')
  assert.equal(await unique.locator('td').nth(3).innerText(),'—')
  await table.getByText('Sin configurar',{exact:true}).waitFor()
  const requests=calls.length
  await groupRow().getByRole('button',{name:'Integrantes de Bebidas agrupadas',exact:true}).click()
  await page.locator('#group-members-group-1').waitFor()
  assert.equal(await groupRow().getByRole('button',{name:/Integrantes/}).getAttribute('aria-expanded'),'true')
  await groupRow().getByRole('button',{name:/Integrantes/}).click()
  assert.equal(calls.length,requests,'Integrantes uses already loaded rows')
  await groups.getByLabel('Tipo').selectOption('Único')
  await unique.waitFor();await groupRow().waitFor({state:'detached'})
  assert.equal(calls.filter(c=>c.action==='groups').at(-1).payload.tipo,'Único')
  await nav('Catálogo');await page.getByRole('button',{name:/Revisar propuesta/}).first().waitFor()
  await nav('Grupos')
  await groupRow().waitFor()
  await groups.getByLabel('Categoría').selectOption('cat-empty')
  await groups.getByText('No hay grupos para los filtros seleccionados.').waitFor()
  await nav('Catálogo');await page.getByRole('button',{name:/Revisar propuesta/}).first().waitFor()
  await nav('Grupos');await groupRow().waitFor()
  const beforeSearch=count('groups')
  await groups.getByLabel('Buscar grupo').fill('Agua')
  assert.equal(count('groups'),beforeSearch,'Typing does not query a partial dataset')
  await groups.getByRole('button',{name:'Buscar',exact:true}).click()
  await groupRow().waitFor({state:'detached'});await unique.waitFor()
  assert.equal(calls.filter(c=>c.action==='groups').at(-1).payload.buscar,'Agua')
  await groups.getByLabel('Buscar grupo').fill('')
  await groups.getByRole('button',{name:'Buscar',exact:true}).click()
  await groupRow().waitFor()
  assert.equal(await groups.getByRole('button',{name:'Grupos',exact:true}).getAttribute('aria-pressed'),'true')
  if(process.env.SOLOG_MANAGEMENT_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_MANAGEMENT_SCREENSHOT.replace('.png','-groups.png'),fullPage:true})
  await page.setViewportSize({width:900,height:900})
  assert.ok(await groups.locator('.admin-groups__table').evaluate(e=>e.scrollWidth>e.clientWidth),'Tablet table scrolls horizontally')
  assert.ok(await table.getByRole('rowheader',{name:/Grupo con un nombre largo/}).evaluate(e=>getComputedStyle(e).whiteSpace==='normal'))
  if(process.env.SOLOG_MANAGEMENT_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_MANAGEMENT_SCREENSHOT.replace('.png','-groups-tablet.png'),fullPage:true})
  await page.setViewportSize({width:1440,height:1000})
  await groupRow().getByRole('button',{name:'Editar Bebidas agrupadas',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Nombre actualizado');failMutation=true;await page.getByRole('button',{name:'Guardar cambio'}).click();await page.getByRole('dialog').getByRole('button',{name:'Reintentar misma operación'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByText(/replay confirmado|confirmada \(replay\)/).first().waitFor()
  await groupRow().getByRole('button',{name:'Precio por paquete de Bebidas agrupadas',exact:true}).click();await page.getByLabel('Nuevo precio por paquete').fill('12');await page.getByRole('button',{name:'Actualizar precio x6',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'})
  await page.getByRole('button',{name:'Crear grupo',exact:true}).click();await page.getByRole('dialog').getByLabel('Nombre',{exact:true}).fill('Grupo nuevo');await page.getByRole('dialog').getByLabel('Categoría').selectOption('cat-1');await page.getByLabel('Precio unitario',{exact:true}).fill('2');await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();await page.getByRole('button',{name:'Guardar cambio'}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.deepEqual(calls.filter(c=>c.action==='group_change_save').at(-1).payload.member_codes,[123,124])
  await page.getByRole('button',{name:'Productos',exact:true}).click();await page.getByRole('button',{name:'Clasificar'}).first().click();await page.getByLabel('Modalidad').selectOption('Único');await page.getByRole('button',{name:'Guardar cambio'}).click();await page.getByRole('dialog').waitFor({state:'detached'})
  await nav('Incidencias');await page.getByText('2 activos · 0 resueltos').waitFor();assert.equal(count('detail'),0);await page.getByRole('button',{name:/Ver repeticiones/}).click();await page.getByRole('dialog').getByText('Sede A',{exact:true}).waitFor();await close();await page.getByRole('button',{name:/Ver repeticiones/}).click();await close();assert.equal(count('detail'),1)
  failMutation=true;await page.getByRole('button',{name:'Ignorar 30 días',exact:true}).click();await page.getByRole('button',{name:'Reintentar misma operación'}).click();await page.getByText('Suprimida',{exact:true}).waitFor();await page.getByLabel('Ámbito de incidencias').selectOption('site-a');await page.getByRole('button',{name:'Reactivar incidencia',exact:true}).waitFor({state:'detached'});await page.getByRole('button',{name:'Ignorar 30 días',exact:true}).waitFor();await page.getByLabel('Ámbito de incidencias').selectOption('');await page.getByRole('button',{name:'Reactivar incidencia',exact:true}).click();await page.getByText('Pendiente',{exact:true}).waitFor();await page.getByRole('button',{name:'Proponer eliminación',exact:true}).click();await page.getByText('La propuesta de eliminación quedó pendiente para revisión en Catálogo.').waitFor()
  if(process.env.SOLOG_MANAGEMENT_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_MANAGEMENT_SCREENSHOT.replace('.png','-incidents.png'),fullPage:true})
  await nav('Dispositivos');await page.getByRole('heading',{name:'Tablets por sede',exact:true}).waitFor();assert.equal(await page.getByLabel('Sede de dispositivos').count(),0);await page.getByRole('article',{name:'Solicitud de Sede A',exact:true}).getByRole('button',{name:'Reemplazar tablet',exact:true}).click();domainError=true;await page.getByRole('button',{name:'Confirmar reemplazar'}).click();await page.getByRole('alert').waitFor();await close()
  await page.getByRole('article',{name:'Solicitud de Sede A',exact:true}).getByRole('button',{name:'Reemplazar tablet',exact:true}).click();failMutation=true;await page.getByRole('button',{name:'Confirmar reemplazar'}).click();await page.getByRole('dialog').getByRole('button',{name:'Reintentar misma operación'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByText(/replay confirmado|confirmada \(replay\)/).first().waitFor();await page.getByRole('article',{name:'Tablet de Sede A',exact:true}).getByRole('button',{name:'Revocar',exact:true}).click();await page.getByRole('button',{name:'Confirmar revocar'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByRole('article',{name:'Tablet de Sede A',exact:true}).getByText('No hay tablet autorizada.').waitFor()
  await page.getByRole('article',{name:'Solicitud de Sede B',exact:true}).getByRole('button',{name:'Rechazar',exact:true}).click();await page.getByRole('button',{name:'Confirmar rechazar'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByText('No hay solicitudes pendientes.').waitFor()
  if(process.env.SOLOG_MANAGEMENT_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_MANAGEMENT_SCREENSHOT.replace('.png','-devices.png'),fullPage:true})
  await nav('Dashboard');await page.getByRole('heading',{name:'Sede A',exact:true}).waitFor();const cards=count('dashboard_cards');await nav('Dispositivos');await page.getByRole('heading',{name:'Sede B',exact:true}).waitFor();await nav('Dashboard');await page.getByRole('heading',{name:'Sede A',exact:true}).waitFor();assert.equal(count('dashboard_cards'),cards)
  await nav('Catálogo');await page.getByRole('button',{name:/Revisar propuesta/}).first().waitFor();if(process.env.SOLOG_MANAGEMENT_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_MANAGEMENT_SCREENSHOT.replace('.png','-catalog.png'),fullPage:true})
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,calls:calls.length,bytes,actions:[...new Set(calls.map(c=>c.action))],productionRequests:0,errors},null,2))
}finally{await browser.close();await server.close()}
