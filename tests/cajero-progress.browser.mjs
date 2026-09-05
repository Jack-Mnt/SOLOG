import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { cashierFixture, startedFixture } from './fixtures/cashier-v4.mjs'
const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({ server: { host: '127.0.0.1', port: 5209, strictPort: true },
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-progress.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only') } })
await server.listen()
const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
const context = await browser.newContext()
const bootstrap = cashierFixture()
const base = bootstrap.panel_state.groups[0]
bootstrap.panel_state.groups = [
  { ...base, grupo_id: 'p', nombre: 'Positivo', stock_teorico: 4 },
  { ...base, grupo_id: 'z', nombre: 'Cero múltiple', stock_teorico: 0,
    productos: [{ c_interno: 20534, producto: 'Lemonade', marca: 'Marca oculta', precio: 4 },
      { c_interno: 20535, producto: 'Cherry', marca: 'Marca oculta', precio: 4 }] },
  { ...base, grupo_id: 'z2', nombre: 'Otro cero', stock_teorico: 0, categoria_id: 'cat-2', categoria: 'Agua' },
  { ...base, grupo_id: 'n', nombre: 'Negativo', stock_teorico: -1 },
  { ...base, grupo_id: 'covered', cobertura_periodo: true, requiere_conteo: false },
]
bootstrap.panel_state.count_queue = ['p', 'z', 'z2', 'n']
bootstrap.panel_state.review_queue = []
bootstrap.panel_state.kpis = { groups_total: 5, coverage_counted: 1, coverage_percent: 20, count_pending: 4, review_pending: 0 }
let state = startedFixture(bootstrap)
const user = { id: bootstrap.identity.id, email: 'cashier@example.test', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: bootstrap.server_now }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated',
  role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }]
  .map(p => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.') + '.test'
const calls = []
await context.route('**/*', async route => {
  const url = new URL(route.request().url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'solog-progress.test') return route.abort()
  const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  if (url.pathname.includes('/auth/v1/token')) return reply({ access_token: jwt, refresh_token: 'test',
    expires_in: 3600, token_type: 'bearer', user })
  if (url.pathname.includes('/auth/v1/user')) return reply(user)
  const rpc = url.pathname.split('/').at(-1)
  const body = route.request().postDataJSON()
  calls.push({ rpc, body })
  if (rpc === 'rpc_solog_route_v2') return reply({ contract_version: 2, generated_at: bootstrap.server_now,
    identity: bootstrap.identity, route: '/cajero' })
  if (rpc === 'rpc_solog_cashier_bootstrap_v2') return reply({ ...bootstrap, session_state: state,
    panel_state: { ...state, basis: bootstrap.panel_state.basis, source: 'session', frozen: true } })
  assert.equal(rpc, 'rpc_solog_cashier_mutate_v2')
  assert.equal(body.p_action, 'save_batch')
  const ids = new Set(body.p_payload.items.map(item => item.grupo_id))
  state = structuredClone(state)
  state.groups.forEach(g => { if (ids.has(g.grupo_id)) { g.cobertura_periodo = true; g.requiere_conteo = false } })
  state.count_queue = state.count_queue.filter(id => !ids.has(id))
  state.kpis = { ...state.kpis, coverage_counted: 3, coverage_percent: 60, count_pending: 2 }
  return reply({ contract_version: 2, generated_at: bootstrap.server_now, action: 'save_batch', replay: false,
    revisions: { ...bootstrap.revisions, operational: 11 }, conteo_id: state.session.id,
    saved: ids.size, state, items: body.p_payload.items.map(item => ({ ...item,
      detalle_id: 'saved-' + item.grupo_id, stock_teorico: 0, diferencia: 1, estado_diferencia: 'Recontar' })) })
})
try {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:5209/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  const coverage = page.getByRole('button', { name: 'Cobertura de la quincena', exact: true })
  await coverage.waitFor()
  assert.match(await coverage.textContent(), /1 \/ 5/)
  assert.equal(await page.getByText('Pendientes', { exact: true }).count(), 0)
  const home = () => page.getByRole('navigation', { name: 'Panel Cajero' }).getByRole('button', { name: 'Inicio', exact: true }).click()
  const stock = type => page.getByRole('button', { name: new RegExp('^Stock ' + type) })
  await page.getByRole('button', { name: 'Abrir Stock 0', exact: true }).click()
  await stock('0').waitFor()
  assert.equal(await stock('0').getAttribute('aria-pressed'), 'true')
  assert.match(await stock('0').textContent(), /0\/2 contados/)
  const before = calls.length
  await page.getByRole('button', { name: /Abarrotes/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /Cero múltiple/ }).click()
  const toggle = dialog.getByRole('button', { name: 'Productos incluidos', exact: true })
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
  await toggle.click()
  assert.deepEqual(await dialog.locator('.cajero-capture-products li').allTextContents(), ['Lemonade#20534', 'Cherry#20535'])
  assert.equal(await dialog.getByText('Marca oculta').count(), 0)
  await toggle.click()
  assert.equal(await dialog.locator('.cajero-capture-products').count(), 0)
  await dialog.getByRole('button', { name: '1', exact: true }).click()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: /Abarrotes/ }).click()
  await dialog.getByRole('button', { name: /Cero múltiple/ }).click()
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  assert.match(await stock('0').textContent(), /1\/2 contados/)
  assert.match(await page.getByRole('button', { name: /Agua/ }).textContent(), /0\/1 contados/)
  await home()
  assert.match(await coverage.textContent(), /2 \/ 5/)
  assert.match(await page.getByRole('button', { name: 'Abrir Stock 0' }).textContent(), /1\/2/)
  await page.getByRole('button', { name: 'Abrir Stock negativo' }).click()
  assert.equal(await stock('negativo').getAttribute('aria-pressed'), 'true')
  await stock('positivo').click()
  assert.equal(await stock('positivo').getAttribute('aria-pressed'), 'true')
  await stock('negativo').click()
  await page.getByRole('button', { name: /Abarrotes/ }).click()
  await dialog.getByRole('button', { name: /Negativo/ }).click()
  assert.equal(await toggle.count(), 0)
  await dialog.getByRole('button', { name: '1', exact: true }).click()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  assert.equal(calls.length, before, 'Captura, acordeón y navegación sin requests ni N+1')
  await home()
  assert.match(await coverage.textContent(), /3 \/ 5/)
  await page.locator('article').filter({ hasText: 'Pendientes de envío' }).getByRole('button').click()
  await page.waitForFunction(() => !document.querySelector('article.cajero-home-metric--pending'))
  assert.match(await coverage.textContent(), /3 \/ 5/)
  assert.match(await page.getByRole('button', { name: 'Abrir Stock 0' }).textContent(), /0\/1/)
  assert.match(await page.getByRole('button', { name: 'Abrir Stock negativo' }).textContent(), /0\/0/)
  await coverage.click()
  assert.equal(new URL(page.url()).search, '')
  assert.equal(await stock('positivo').getAttribute('aria-pressed'), 'true')
  assert.match(await stock('0').textContent(), /0\/1 contados/)
  assert.equal(calls.filter(c => c.body.p_action === 'save_batch').length, 1)
  assert.deepEqual(errors, [])
  console.log('PASS Inicio incompleto, cobertura local/autoritativa, tipos/categorías, filtros, SKU y envío global')
} finally {
  await context.close()
  await browser.close()
  await server.close()
}
