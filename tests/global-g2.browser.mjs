// Same explicit backend case across Dashboard, Control and both real XLSX downloads.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { scenario, generated } from './fixtures/global-g2.mjs'
import { responseFixture } from './fixtures/admin-v2.mjs'
const require = createRequire(import.meta.url)
const { unzipSync, strFromU8 } = createRequire(require.resolve('write-excel-file/package.json'))('fflate')
async function workbook(download, page) {
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const files = Object.fromEntries(Object.entries(unzipSync(Buffer.concat(chunks))).map(([k,v])=>[k,strFromU8(v)]))
  return page.evaluate(files => {
    const xml = s => new DOMParser().parseFromString(s,'application/xml')
    const strings = files['xl/sharedStrings.xml'] ? [...xml(files['xl/sharedStrings.xml']).querySelectorAll('si')].map(n=>n.textContent) : []
    const names = [...xml(files['xl/workbook.xml']).querySelectorAll('sheet')].map(n=>n.getAttribute('name'))
    return Object.fromEntries(names.map((name,i)=>[name,Object.fromEntries([...xml(files['xl/worksheets/sheet'+(i+1)+'.xml']).querySelectorAll('c')].map(c=>[c.getAttribute('r'),c.getAttribute('t')==='s'?strings[Number(c.querySelector('v').textContent)]:c.querySelector('v,t')?.textContent??'']))]))
  },files)
}
const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({server:{host:'127.0.0.1',port:5211,strictPort:true},define:{
  'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://solog-g2.test'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('test-only-key'),
}})
await server.listen()
const browser = await chromium.launch({headless:true,executablePath:process.env.SOLOG_TEST_BROWSER})
const context = await browser.newContext({viewport:{width:1440,height:960},timezoneId:'Asia/Tokyo'})
const user = {id:'admin-test',email:'g2@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:generated}
const exp = Math.floor(Date.now()/1000)+3600
const jwt = [{alg:'HS256',typ:'JWT'},{sub:user.id,role:'authenticated',aud:'authenticated',exp}].map(p=>Buffer.from(JSON.stringify(p)).toString('base64url')).join('.')+'.test'
await context.addInitScript(({user,jwt,exp})=>localStorage.setItem('sb-solog-g2-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user})),{user,jwt,exp})
const s = scenario(), calls = [], errors = []
await context.route('**/*',async route=>{
  const url = new URL(route.request().url())
  if(url.hostname==='127.0.0.1')return route.continue()
  if(url.hostname!=='solog-g2.test'){errors.push('External '+url.hostname);return route.abort()}
  const fulfill = value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)})
  if(url.pathname==='/auth/v1/user')return fulfill(user)
  const rpc = url.pathname.split('/').at(-1), body = route.request().postDataJSON(), p = body.p_payload
  const allowed = ['rpc_solog_admin_bootstrap_v2','rpc_solog_operational_v2','rpc_solog_control_export_v2','rpc_solog_details_v2']
  assert.ok(allowed.includes(rpc),'Unexpected RPC '+rpc)
  const action = rpc==='rpc_solog_admin_bootstrap_v2'?'bootstrap':rpc==='rpc_solog_control_export_v2'?'export':body.p_action
  calls.push({rpc,action,p})
  if(rpc==='rpc_solog_details_v2')return fulfill(action==='summary'?s.summary:s.details)
  if(action==='shift_grid') { assert.equal(p.site_id,'site-a'); return fulfill({...s.grid,period:{...s.grid.period,key:p.period}}) }
  if(action==='daily_detail'){assert.equal(p.origin_date,'2026-09-15');return fulfill(s.daily)}
  if(action==='control_page')return fulfill({...s.control,period:{...s.control.period,key:p.period}})
  if(action==='export'){assert.deepEqual(p,{site_id:'site-a',period:'previous_biweekly'});return fulfill(s.admin)}
  return fulfill(responseFixture(action,p))
})
const page = await context.newPage(); page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
try {
  await page.goto('http://127.0.0.1:5211/admin')
  await page.getByRole('button',{name:'Ver turnos de Sede A'}).click()
  await page.getByRole('button',{name:'Abrir día 2026-09-15'}).click()
  const row = page.getByRole('dialog').locator('tbody tr')
  await row.getByText('Grupo 0 · Confirmada').waitFor()
  assert.match(await row.innerText(),/-2/)
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  await page.getByRole('button',{name:'Control',exact:true}).click()
  await page.getByText('Grupo 0',{exact:true}).waitFor()
  assert.match(await page.locator('tbody tr').innerText(),/Confirmada/)
  assert.match(await page.locator('tbody tr').innerText(),/-2/)
  await page.getByRole('button',{name:'DESCARGAR AJUSTE',exact:true}).click()
  await page.getByRole('dialog').getByLabel('Período de exportación').selectOption('previous_biweekly')
  let event = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button',{name:/Descargar Excel/}).click()
  const admin = await workbook(await event,page)
  assert.deepEqual(Object.keys(admin),['Resumen','Ajustes','Por recontar','Inconsistentes','Todas'])
  assert.equal(admin.Ajustes.G2,'-2');assert.equal(admin.Ajustes.H2,'-7.5')
  assert.match(admin.Ajustes.C2,/15\/09\/26/);assert.match(admin.Ajustes.C2,/23:59|11:59 p\. m\./)
  await page.goto('http://127.0.0.1:5211/detalles')
  await page.getByLabel('Período de exportación').selectOption('previous_biweekly')
  event = page.waitForEvent('download')
  await page.getByRole('button',{name:'Descargar Excel',exact:true}).click()
  const details = await workbook(await event,page)
  assert.equal(details.Diferencias.C2,admin.Ajustes.A2)
  assert.equal(details.Diferencias.H2,admin.Ajustes.G2)
  assert.equal(details.Diferencias.I2,admin.Ajustes.H2)
  assert.equal(Math.floor(Number(details.Diferencias.A2)),(Date.UTC(2026,8,15)-Date.UTC(1899,11,30))/86400000)
  assert.equal(details.Resumen.B4,'01/09/2026 — 15/09/2026')
  assert.deepEqual(errors,[])
  console.log('PASS G2: Dashboard/Control + 5-sheet Admin/2-sheet Details XLSX; same origin/value/state, later-period recount, Tokyo browser preserves Lima; '+calls.length+' simulated RPCs; 0 production')
} finally { await context.close();await browser.close();await server.close() }
