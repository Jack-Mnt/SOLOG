// Shell + Dispositivos UI. Every non-local request is intercepted; no production traffic.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { bootstrapFixture, responseFixture } from './fixtures/admin-v2.mjs'
import { managementFixture } from './fixtures/admin-management.mjs'

const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({ server: { host: '127.0.0.1', port: 5222, strictPort: true }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-admin-v2.test'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only'),
} })
await server.listen()
const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const now = new Date().toISOString()
const sites = ['Casuarinas', 'Unidad', 'Divino', 'Huaca', 'Cutervo'].map((nombre, i) => ({ id: 'site-' + i, nombre, operational_revision: 10, devices_revision: 2, incidents_revision: 4 }))
const user = { id: 'admin-test', email: 'admin@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now }
const exp = Math.floor(Date.now() / 1000) + 3600
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp }].map(p => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.') + '.test'
await context.addInitScript(({ user, jwt, exp }) => localStorage.setItem('sb-solog-admin-v2-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test', expires_at: exp, expires_in: 3600, token_type: 'bearer', user })), { user, jwt, exp })
const device = (siteIndex, state, suffix) => ({
  id: '84f12648-0000-4000-8000-0000000016' + suffix, site_id: sites[siteIndex].id, site: sites[siteIndex].nombre,
  estado: state, solicitado_por: 'cashier-' + siteIndex, solicitante: 'Cajero ' + sites[siteIndex].nombre,
  solicitado_at: now, autorizado_at: state === 'autorizado' ? now : null, ultimo_acceso_at: now, revision: 2,
})
let devices = [device(4, 'autorizado', '3f'), device(3, 'autorizado', '4f'), device(3, 'pendiente', '5f'), device(2, 'pendiente', '6f')]
const calls = [], errors = []
let failList = false, heldMutation
await context.route('**/*', async route => {
  const url = new URL(route.request().url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'solog-admin-v2.test') { errors.push('External: ' + url.hostname); return route.abort() }
  const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (url.pathname === '/auth/v1/user') return fulfill(user)
  if (url.pathname === '/auth/v1/logout') return fulfill({})
  const rpc = url.pathname.split('/').at(-1), body = route.request().postDataJSON()
  assert.ok(['rpc_solog_admin_bootstrap_v2', 'rpc_solog_operational_v2', 'rpc_solog_admin_devices_v2', 'rpc_solog_admin_master_read_v2', 'rpc_solog_admin_incidents_v2'].includes(rpc), rpc)
  const action = rpc === 'rpc_solog_admin_bootstrap_v2' ? 'bootstrap' : body.p_action, p = body.p_payload
  calls.push({ rpc, action, payload: p })
  if (action === 'bootstrap') return fulfill({ ...bootstrapFixture(), identity: { ...bootstrapFixture().identity, nombre: 'Gerencia' }, allowed_sites: sites })
  if (action === 'dashboard_cards') return fulfill({ ...responseFixture(action), sites: sites.map(site => ({ ...responseFixture(action).sites[0], site_id: site.id, site: site.nombre })) })
  if (rpc === 'rpc_solog_operational_v2') return fulfill(responseFixture(action, p))
  if (action === 'list') {
    assert.deepEqual(p, {})
    if (failList) { failList = false; return fulfill({ message: 'Fallo de lectura simulado', code: '500' }, 500) }
    return fulfill({ contract_version: 2, generated_at: now, devices })
  }
  if (rpc === 'rpc_solog_admin_devices_v2') {
    assert.deepEqual(Object.keys(p).sort(), ['device_id', 'expected_revision', 'operation_id'])
    assert.equal(action, 'authorize')
    const target = devices.find(d => d.id === p.device_id)
    assert.equal(target.site, 'Divino')
    assert.equal(p.expected_revision, target.revision)
    assert.match(p.operation_id, /^[0-9a-f-]{36}$/)
    await new Promise(resolve => { heldMutation = resolve })
    devices = devices.map(d => d.id === p.device_id ? { ...d, estado: 'autorizado', autorizado_at: now, revision: 3 } : d)
    const authorized = devices.find(d => d.id === p.device_id)
    return fulfill({ contract_version: 2, generated_at: now, replay: false, action, revisions: { devices: 3 }, site_id: target.site_id, authorized_device: authorized, pending_devices: [] })
  }
  return fulfill(managementFixture(action, p))
})
const page = await context.newPage()
page.setDefaultTimeout(12000)
page.on('pageerror', e => errors.push(e.message))
const nav = name => page.getByRole('navigation', { name: 'Módulos administrativos' }).getByRole('button', { name, exact: true }).click()
const headerSites = () => page.getByRole('group', { name: 'Sede administrativa' })
const count = action => calls.filter(call => call.action === action).length
const screenshot = async suffix => {
  if (process.env.SOLOG_SHELL_SCREENSHOT) await page.screenshot({ path: process.env.SOLOG_SHELL_SCREENSHOT.replace('.png', '-' + suffix + '.png'), fullPage: true, animations: 'disabled' })
}
try {
  await page.goto('http://127.0.0.1:5222/admin')
  await page.getByRole('heading', { name: 'Cutervo', exact: true }).waitFor()
  assert.deepEqual(await headerSites().getByRole('button').allTextContents(), ['Cutervo', 'Huaca', 'Divino', 'Unidad', 'Casua'])
  assert.equal(await headerSites().getByRole('button', { name: 'Cutervo', exact: true }).getAttribute('aria-pressed'), 'true')
  const dimensions = await headerSites().getByRole('button').evaluateAll(buttons => buttons.map(button => [button.getBoundingClientRect().width, button.getBoundingClientRect().height]))
  assert.ok(dimensions.every(size => JSON.stringify(size) === JSON.stringify(dimensions[0])))
  assert.deepEqual(await page.locator('.admin-main-tabs__label').allTextContents(), ['OPERACIÓN', 'GESTIÓN', 'APARIENCIA'])
  assert.equal(await page.getByRole('button', { name: /Actualizar Admin/ }).count(), 0)
  const initialCalls = calls.length
  for (const [name, palette] of [['Prisma', 'violet'], ['Natura', 'green'], ['Órbita', 'blue']]) {
    await page.getByRole('button', { name, exact: true }).click()
    assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), palette)
    assert.equal(await page.evaluate(() => localStorage.getItem('solog.palette.v1')), palette)
  }
  await headerSites().getByRole('button', { name: 'Huaca', exact: true }).click()
  assert.equal(calls.length, initialCalls)
  await nav('Control')
  await page.getByText('Grupo 99', { exact: true }).waitFor()
  assert.equal(calls.filter(c => c.action === 'control_page').at(-1).payload.site_id, 'site-3')
  assert.equal(await page.getByLabel('Sede', { exact: true }).inputValue(), 'site-3')
  await headerSites().getByRole('button', { name: 'Casua', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('select[aria-label="Sede"]').value === 'site-0')
  await page.getByText('Grupo 99', { exact: true }).waitFor()
  assert.equal(calls.filter(c => c.action === 'control_page').at(-1).payload.site_id, 'site-0')
  await page.getByLabel('Sede', { exact: true }).selectOption('site-3')
  await nav('Dashboard')
  assert.equal(await headerSites().getByRole('button', { name: 'Huaca', exact: true }).getAttribute('aria-pressed'), 'true')

  await nav('Dispositivos')
  await page.getByRole('heading', { name: 'Tablets por sede', exact: true }).waitFor()
  assert.equal(await page.locator('.admin-header').getByText('Puerto Rico', { exact: true }).count(), 1)
  assert.equal(await page.locator('.admin-header').getByRole('button').count(), 0)
  assert.equal(await page.locator('.admin-devices select').count(), 0)
  assert.equal(await page.locator('.admin-devices').getByRole('button', { name: /Actualizar/ }).count(), 0)
  assert.deepEqual(await page.locator('[aria-labelledby="admin-tablets-title"] h3').allTextContents(), ['Cutervo', 'Huaca', 'Divino', 'Unidad', 'Casua'])
  assert.equal(await page.getByRole('article', { name: 'Tablet de Divino', exact: true }).getByText('No hay tablet autorizada.').count(), 1)
  assert.equal(await page.getByRole('article', { name: 'Solicitud de Huaca', exact: true }).getByRole('button', { name: 'Reemplazar tablet', exact: true }).count(), 1)
  assert.equal(await page.getByRole('article', { name: 'Solicitud de Huaca', exact: true }).getByRole('button', { name: 'Autorizar', exact: true }).count(), 0)
  assert.equal(await page.getByRole('article', { name: 'Solicitud de Divino', exact: true }).getByRole('button', { name: 'Autorizar', exact: true }).count(), 1)
  const card = page.getByRole('article', { name: 'Tablet de Cutervo', exact: true })
  assert.match(await card.innerText(), /Último acceso · Hoy,/)
  const cardsText = await page.locator('.admin-devices').innerText()
  assert.equal(/84f12648|ID ·|Copiar|revisión/i.test(cardsText), false)
  assert.equal(await page.locator('.admin-devices .lucide-tablet').count(), 7)
  const themeSurfaces = []
  const beforeThemes = calls.length
  for (const [name, palette, icon] of [['Órbita', 'blue', 'orbit'], ['Prisma', 'violet', 'gem'], ['Natura', 'green', 'leaf']]) {
    const button = page.getByRole('button', { name, exact: true })
    assert.equal(await button.locator('.lucide-' + icon).count(), 1)
    await button.click()
    assert.equal(await button.getAttribute('aria-pressed'), 'true')
    themeSurfaces.push(await page.evaluate(() => {
      const bg = selector => getComputedStyle(document.querySelector(selector)).backgroundColor
      return { sidebar: bg('.admin-sidebar'), header: bg('.admin-header'), panel: bg('.admin-v2-workspace'), card: bg('.admin-device-card'), badge: bg('.admin-device-badge--authorized') }
    }))
    await screenshot('expanded-' + palette)
  }
  for (const surface of ['sidebar', 'header', 'panel']) assert.equal(new Set(themeSurfaces.map(theme => theme[surface])).size, 3)
  assert.ok(themeSurfaces.every(theme => theme.card === 'rgb(255, 255, 255)' && theme.badge === themeSurfaces[0].badge))
  assert.equal(calls.length, beforeThemes)
  assert.equal(await page.locator('.admin-sidebar .lucide-palette, .admin-sidebar details, .admin-appearance .palette-option').count(), 0)
  const globalContext = page.locator('.admin-site-context--global')
  const contextStyle = () => globalContext.evaluate(node => {
    const style = getComputedStyle(node)
    return [style.cursor, style.backgroundColor, style.boxShadow]
  })
  const beforeHover = await contextStyle()
  await globalContext.hover()
  assert.deepEqual(await contextStyle(), beforeHover)
  assert.equal(beforeHover[0], 'default')
  assert.equal(beforeHover[2], 'none')
  assert.equal(count('list'), 1)
  await screenshot('desktop')
  const singleColumn = async () => {
    const boxes = await page.locator('[aria-labelledby="admin-tablets-title"] article').evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(); return { x: r.x, width: r.width, top: r.top, bottom: r.bottom } }))
    assert.ok(boxes.every((box, i) => box.x === boxes[0].x && box.width === boxes[0].width && (!i || box.top >= boxes[i - 1].bottom)))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  await singleColumn()
  await page.getByRole('button', { name: 'Alternar navegación' }).click()
  await page.waitForFunction(() => document.querySelector('.admin-sidebar').getBoundingClientRect().width <= 72)
  const appearance = page.getByRole('region', { name: 'Apariencia' })
  assert.equal(await appearance.getByRole('button').count(), 3)
  assert.deepEqual(await appearance.getByRole('button').allTextContents(), ['', '', ''])
  assert.deepEqual(await appearance.locator('svg').evaluateAll(icons => icons.map(icon => icon.getAttribute('class').split(' ').find(name => ['lucide-orbit', 'lucide-gem', 'lucide-leaf'].includes(name)))), ['lucide-orbit', 'lucide-gem', 'lucide-leaf'])
  const iconBoxes = await appearance.getByRole('button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { x: r.x, top: r.top, bottom: r.bottom } }))
  assert.ok(iconBoxes.every((box, i) => box.x === iconBoxes[0].x && (!i || box.top >= iconBoxes[i - 1].bottom)))
  assert.equal(await appearance.evaluate(node => getComputedStyle(node).borderTopStyle), 'solid')
  assert.equal(await page.locator('.admin-sidebar__collapse').evaluate(node => getComputedStyle(node).borderTopStyle), 'solid')
  assert.equal(await page.locator('.admin-sidebar details, .admin-sidebar .lucide-palette').count(), 0)
  await page.getByRole('button', { name: 'Prisma', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Prisma', exact: true }).getAttribute('title'), 'Prisma')
  assert.equal(await page.getByRole('button', { name: 'Prisma', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'violet')
  await screenshot('collapsed')
  await page.setViewportSize({ width: 820, height: 1180 })
  await singleColumn()
  await screenshot('tablet-collapsed')
  await page.getByRole('button', { name: 'Alternar navegación' }).click()
  await page.waitForFunction(() => document.querySelector('.admin-sidebar').getBoundingClientRect().width >= 190)
  await singleColumn()
  await screenshot('tablet-expanded')
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('button', { name: 'Órbita', exact: true }).click()
  await page.getByRole('article', { name: 'Solicitud de Divino', exact: true }).getByRole('button', { name: 'Autorizar', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar autorizar' }).click()
  await page.waitForFunction(() => document.querySelector('.admin-dialog .button')?.disabled)
  assert.equal(await page.getByRole('button', { name: 'Confirmar autorizar' }).isDisabled(), true)
  assert.equal(await page.getByRole('article', { name: 'Solicitud de Huaca', exact: true }).getByRole('button', { name: 'Reemplazar tablet' }).isDisabled(), true)
  assert.equal(count('authorize'), 1)
  heldMutation()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.getByRole('article', { name: 'Tablet de Divino', exact: true }).getByText('Autorizado', { exact: true }).waitFor()
  assert.equal(count('list'), 2)
  await nav('Catálogo'); await page.getByRole('button', { name: 'Ver propuesta' }).waitFor()
  await nav('Grupos'); await page.getByRole('heading', { name: 'Bebidas agrupadas' }).waitFor()
  await nav('Incidencias'); await page.getByRole('button', { name: /Ver repeticiones/ }).waitFor()
  await nav('Dispositivos'); await page.getByRole('heading', { name: 'Tablets por sede' }).waitFor()
  assert.equal(count('list'), 2)
  devices = devices.filter(d => d.estado === 'autorizado')
  failList = true
  await page.reload()
  await page.locator('.admin-devices').getByRole('button', { name: 'Reintentar lectura', exact: true }).click()
  await page.getByText('No hay solicitudes pendientes.').waitFor()
  assert.ok((await page.locator('.admin-devices__empty').boundingBox()).height < 50)
  assert.equal(await page.locator('.admin-devices__empty').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)')
  await screenshot('empty')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, scenarios: ['sites/order/alias/scope', 'themes/persistence', 'navigation/cache', 'global devices', 'single-column desktop/tablet', 'theme surfaces / semantic badges / no technical data', 'authorize/pending guard', 'read retry', 'empty requests'], rpcCalls: calls.length, productionRequests: 0, errors }, null, 2))
} finally { if (heldMutation) heldMutation(); await browser.close(); await server.close() }
