// A1–A3 against simulated Auth/RPC only; production requests are blocked.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { adminNow, responseFixture } from './fixtures/admin-v2.mjs'
const require = createRequire(import.meta.url)
const { unzipSync, strFromU8 } = createRequire(require.resolve('write-excel-file/package.json'))('fflate')
export async function runAdminV2Browser() {
  const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
  const server = await createServer({ server: { host: '127.0.0.1', port: 5208, strictPort: true }, define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-admin-v2.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  } })
  await server.listen()
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const user = { id: 'admin-test', email: 'admin@example.test', role: 'authenticated', app_metadata: {}, user_metadata: { rol: 'cajero' }, aud: 'authenticated', created_at: adminNow }
  const exp = Math.floor(Date.now()/1000)+3600
  const jwt = [{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp}].map(p=>Buffer.from(JSON.stringify(p)).toString('base64url')).join('.')+'.test'
  await context.addInitScript(({user,jwt,exp})=>localStorage.setItem('sb-solog-admin-v2-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test',expires_at:exp,expires_in:3600,token_type:'bearer',user})),{user,jwt,exp})
  const calls=[], errors=[]
  let bytes=0, empty=false, denied=false, revision=10
  const count=a=>calls.filter(c=>c.action===a).length
  await context.route('**/*', async route=>{
    const url=new URL(route.request().url())
    if(url.hostname==='127.0.0.1')return route.continue()
    if(url.hostname!=='solog-admin-v2.test'){errors.push('Unexpected external '+url.hostname);return route.abort()}
    const fulfill=(data,status=200)=>{const body=JSON.stringify(data);bytes+=Buffer.byteLength(body);return route.fulfill({status,contentType:'application/json',body})}
    if(url.pathname==='/auth/v1/user')return fulfill(user)
    if(url.pathname==='/auth/v1/logout')return fulfill({})
    const rpc=url.pathname.split('/').at(-1), body=route.request().postDataJSON()
    assert.ok(['rpc_solog_admin_bootstrap_v2','rpc_solog_operational_v2','rpc_solog_control_export_v2'].includes(rpc),'No v1 or other modules: '+rpc)
    const action=rpc==='rpc_solog_admin_bootstrap_v2'?'bootstrap':rpc==='rpc_solog_control_export_v2'?'export':body.p_action
    const p=body.p_payload;calls.push({rpc,action,payload:p})
    if(action==='bootstrap'||action==='dashboard_cards')assert.deepEqual(p,{})
    if(action==='shift_grid')assert.deepEqual(Object.keys(p).sort(),['period','site_id'])
    if(action==='control_page'){assert.equal(p.page_size,100);assert.equal('cursor' in p,false);if(p.period!=='custom')assert.equal('date_from' in p||'date_to' in p,false)}
    if(action==='export')assert.deepEqual(Object.keys(p).sort(),['period','site_id'])
    if(denied)return fulfill({code:'P0001',message:'SOLOG_ADMIN_ROLE_REQUIRED'},400)
    const response=responseFixture(action,p)
    if(response.revisions.operational!==undefined)response.revisions.operational=revision
    if(action==='bootstrap')response.allowed_sites.forEach(s=>s.operational_revision=revision)
    if(action==='dashboard_cards')response.sites.forEach(s=>s.operational_revision=revision)
    if(action==='export'&&empty){for(const key of ['adjustments','pending_recount','inconsistent','all'])response[key]=[];for(const key of Object.keys(response.summary))response.summary[key]=0}
    return fulfill(response)
  })
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
  try {
    await page.goto('http://127.0.0.1:5208/admin')
    await page.getByRole('heading',{name:'Sede A',exact:true}).waitFor()
    assert.equal(count('bootstrap'),1);assert.equal(count('dashboard_cards'),1);assert.equal(calls.length,2)
    assert.equal(await page.getByRole('progressbar').count(),2)
    await page.getByText('Completada',{exact:true}).waitFor()
    await page.getByText('Sin snapshot confirmado',{exact:false}).waitFor()
    let resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name))
    assert.equal(resources.some(u=>/admin\.control\.v2\.tsx|admin\.catalogo|admin\.grupos|admin\.incidencias|admin\.dispositivos|write-excel-file/.test(u)),false)
    await page.getByRole('button',{name:'Ver turnos de Sede A'}).click()
    await page.getByRole('button',{name:'Abrir día 2026-09-03'}).waitFor()
    assert.equal(count('shift_grid'),1);assert.equal(count('daily_detail'),0)
    assert.match(await page.locator('tr').filter({has:page.locator('th',{hasText:'Total'})}).innerText(),/30%/)
    await page.getByRole('button',{name:'Abrir día 2026-09-03'}).click()
    await page.getByRole('dialog').getByText('Grupo 0 · Confirmada').waitFor()
    await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    await page.getByRole('button',{name:'Abrir día 2026-09-03'}).click()
    assert.equal(count('daily_detail'),1)
    await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    await page.getByLabel('Quincena de turnos').selectOption('previous_biweekly')
    await page.getByRole('button',{name:'Abrir día 2026-08-31'}).waitFor()
    await page.getByLabel('Quincena de turnos').selectOption('current_biweekly')
    await page.getByRole('button',{name:'Abrir día 2026-09-03'}).waitFor()
    assert.equal(count('shift_grid'),2)
    await page.getByRole('button',{name:'Ver turnos de Sede B'}).click()
    const siteB=page.getByRole('article',{name:'Sede Sede B'})
    await siteB.getByRole('button',{name:'Abrir día 2026-09-03'}).waitFor()
    assert.match(await siteB.locator('tr').filter({has:page.locator('th',{hasText:'Total'})}).innerText(),/0%/)
    if(process.env.SOLOG_ADMIN_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_ADMIN_SCREENSHOT.replace('.png','-dashboard.png'),fullPage:true})
    await page.getByRole('button',{name:'Control',exact:true}).click()
    await page.getByText('Grupo 99',{exact:true}).waitFor();assert.equal(count('control_page'),1);assert.equal(count('control_detail'),0)
    await page.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByText('Grupo 100',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Anterior',exact:true}).click();await page.getByText('Grupo 0',{exact:true}).waitFor();assert.equal(count('control_page'),2)
    await page.getByRole('button',{name:'Ver cronología de Grupo 0',exact:true}).click();await page.getByRole('dialog').getByText('Diferencia vigente',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('button',{name:'Ver cronología de Grupo 0',exact:true}).click();assert.equal(count('control_detail'),1)
    await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.getByRole('heading',{name:'Sede A',exact:true}).waitFor();assert.equal(count('dashboard_cards'),1)
    await page.getByRole('button',{name:'Control',exact:true}).click();await page.getByText('Grupo 99',{exact:true}).waitFor();assert.equal(count('control_page'),2)
    await page.getByLabel('Período',{exact:true}).selectOption('custom');await page.getByLabel('Desde',{exact:true}).fill('2026-01-01');await page.getByLabel('Hasta',{exact:true}).fill('2026-05-01');assert.equal(await page.getByRole('button',{name:'Aplicar filtros'}).isDisabled(),true)
    await page.getByLabel('Hasta',{exact:true}).fill('2026-04-02');await page.getByRole('button',{name:'Aplicar filtros'}).click();await page.getByText('2026-01-01 — 2026-04-02',{exact:true}).waitFor()
    for(const period of ['current_biweekly','previous_biweekly']) {
      await page.getByRole('button',{name:'DESCARGAR AJUSTE',exact:true}).click()
      await page.getByLabel('Período de exportación').selectOption(period)
      const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar Excel'}).click()])
      const stream=await download.createReadStream(), chunks=[];for await(const chunk of stream)chunks.push(chunk)
      const zip=unzipSync(Buffer.concat(chunks));const xml=strFromU8(zip['xl/workbook.xml']);for(const name of ['Resumen','Ajustes','Por recontar','Inconsistentes','Todas'])assert.ok(xml.includes(name))
      const strings=strFromU8(zip['xl/sharedStrings.xml']);assert.ok(strings.includes('Teórico de reconteo'));assert.ok(strings.includes('Por recontar'))
      assert.ok(strFromU8(zip['xl/worksheets/sheet2.xml']).includes('<v>-2</v>'))
      const parsed=await page.evaluate(({strings,sheet})=>{
        const parse=t=>new DOMParser().parseFromString(t,'application/xml')
        const values=[...parse(strings).querySelectorAll('si')].map(n=>n.textContent)
        return [...parse(sheet).querySelector('row').querySelectorAll('c')].map(c=>c.getAttribute('t')==='s'?values[Number(c.querySelector('v').textContent)]:c.textContent)
      },{strings,sheet:strFromU8(zip['xl/worksheets/sheet4.xml'])})
      assert.deepEqual(parsed,['Grupo','Categoría','Fecha de origen','Teórico de conteo','Físico de conteo','Diferencia de conteo','Teórico de reconteo','Físico de reconteo','Diferencia de reconteo','Estado'])
      assert.match(download.suggestedFilename(),/SOLOG_Ajustes_Sede_A_/)
    }
    empty=true;await page.getByRole('button',{name:'DESCARGAR AJUSTE',exact:true}).click();await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar Excel'}).click()]);assert.equal(count('export'),3)
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('admin-operational'))),false)
    revision++;await page.getByRole('button',{name:'Actualizar Admin'}).click();await page.getByRole('heading',{name:'Consulta por sede'}).waitFor();await page.getByText('Grupo 99',{exact:true}).waitFor();assert.equal(count('bootstrap'),2)
    await page.setViewportSize({width:800,height:900});await page.getByRole('button',{name:'Alternar navegación'}).click()
    await page.getByRole('heading',{name:'Consulta por sede'}).scrollIntoViewIfNeeded()
    await page.waitForFunction(()=>document.querySelector('.admin-sidebar')?.getBoundingClientRect().width<=72)
    if(process.env.SOLOG_ADMIN_SCREENSHOT)await page.screenshot({path:process.env.SOLOG_ADMIN_SCREENSHOT,fullPage:false})
    denied=true;await page.getByRole('button',{name:'Actualizar Admin'}).click();await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();assert.equal(await page.getByText('Grupo 99',{exact:true}).count(),0)
    assert.deepEqual(errors,[])
    console.log(JSON.stringify({status:'PASS A1–A3 browser simulado',rpcCalls:calls.length,responseBytes:bytes,productionCalls:0,actions:Object.fromEntries(['bootstrap','dashboard_cards','shift_grid','daily_detail','control_page','control_detail','export'].map(a=>[a,count(a)]))}))
  } finally {await browser.close();await server.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runAdminV2Browser()
