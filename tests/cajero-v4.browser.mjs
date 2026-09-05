// Delta Cajero V7 con RPC simuladas y red externa bloqueada. No ejecuta el gate real.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { cashierFixture, startedFixture } from './fixtures/cashier-v4.mjs'
const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({ server: { host: '127.0.0.1', port: 5206, strictPort: true }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-v4.test'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
} })
await server.listen()
const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
const context = await browser.newContext()
const b = cashierFixture()
const secondReview = structuredClone(b.panel_state.groups[1])
Object.assign(secondReview, {
  grupo_id: 'group-3', nombre: 'Grupo revisión 2', detalle_reconteo_id: 'detail-second',
})
b.panel_state.groups.push(secondReview)
b.panel_state.review_queue.push({
  grupo_id: 'group-3', detalle_id: 'detail-second', ultima_diferencia: 1,
  contado_at: '2026-09-03T20:30:01.000Z',
})
b.panel_state.kpis = { groups_total: 3, coverage_counted: 2, coverage_percent: 67, count_pending: 1, review_pending: 2 }
const user = { id: b.identity.id, email: 'cashier@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: b.server_now }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
const calls = []
const errors = []
let state = null
let operational = 10
let lost = false
const ledger = new Map()
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'solog-v4.test') return route.abort()
  const fulfill = (data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  if (url.pathname.includes('/auth/v1/token')) return fulfill({ access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user })
  if (url.pathname.includes('/auth/v1/user')) return fulfill(user)
  if (url.pathname.includes('/auth/v1/logout')) return fulfill({})
  const rpc = url.pathname.split('/').at(-1)
  const body = route.request().postDataJSON()
  calls.push({ rpc, body })
  if (rpc === 'rpc_solog_route_v2') return fulfill({ contract_version: 2, generated_at: b.server_now, identity: b.identity, route: '/cajero' })
  if (rpc === 'rpc_solog_cashier_bootstrap_v2') {
    return fulfill({ ...b, revisions: { ...b.revisions, operational },
      ...(state?.session.estado === 'activo' ? { session_state: state, panel_state: { ...state, basis: b.panel_state.basis, source: 'session', frozen: true } } : {}) })
  }
  if (rpc === 'rpc_solog_cashier_history_v2') {
    assert.deepEqual(Object.keys(body), ['p_payload'])
    assert.deepEqual(Object.keys(body.p_payload), ['period'])
    const period = body.p_payload.period
    assert.ok(['today', 'yesterday'].includes(period))
    const item = {
      detalle_id: 'saved-detail', grupo_id: 'group-1', grupo: 'Histórico conteo', categoria: 'Abarrotes',
      stock_teorico: 10, stock_fisico: 9, diferencia: -1, precio: 2, valor_diferencia: -2, estado_diferencia: 'Recontar',
      contado_at: b.server_now, recontado_at: null, snapshot_referencia_id: 'snapshot-1',
      primer_snapshot_posterior_id: null, snapshot_posterior_id: null, snapshot_reconteo_id: null,
      stock_posterior: null, stock_teorico_reconteo: null, stock_reconteo: null,
    }
    return fulfill({ contract_version: 2, generated_at: b.server_now, period,
      date: period === 'today' ? '2026-09-03' : '2026-09-02',
      items: period === 'today' ? [item] : [], revisions: { operational } })
  }
  assert.equal(rpc, 'rpc_solog_cashier_mutate_v2', 'No se permite RPC legacy')
  const { p_action: action, p_payload: payload } = body
  assert.match(payload.operation_id, /^[0-9a-f-]{36}$/)
  if (ledger.has(payload.operation_id)) return fulfill({ ...ledger.get(payload.operation_id), replay: true })
  if (action === 'start') {
    assert.deepEqual(Object.keys(payload).sort(), ['device_token', 'operation_id'])
    state = startedFixture(b)
  } else {
    assert.equal(payload.expected_groups_revision, 7)
    assert.equal(payload.conteo_id, 'session-1')
  }
  const response = { contract_version: 2, generated_at: b.server_now, action, replay: false,
    revisions: { ...b.revisions, operational: ++operational }, conteo_id: 'session-1' }
  if (action === 'save_batch') {
    const item = payload.items[0]
    assert.equal(item.stock_fisico, 9)
    state.groups[0].requiere_conteo = false
    state.groups[0].cobertura_periodo = true
    state.groups[0].contado_detalle_id = 'saved-detail'
    state.count_queue = []
    state.kpis = { groups_total: 3, coverage_counted: 3, coverage_percent: 100, count_pending: 0, review_pending: 2 }
    response.saved = 1
    response.items = [{ ...item, detalle_id: 'saved-detail', stock_teorico: 10, diferencia: -1, estado_diferencia: 'Recontar' }]
  }
  if (action === 'recount_save_batch') {
    assert.equal(payload.items.length, 2)
    assert.deepEqual(Object.keys(payload.items[0]).sort(), ['contado_at', 'detalle_id', 'stock_fisico'])
    response.saved = payload.items.length
    response.items = payload.items.map((item) => {
      const group = state.review_queue.find((candidate) => candidate.detalle_id === item.detalle_id)
      return {
        detalle_id: item.detalle_id, grupo_id: group.grupo_id, snapshot_reconteo_id: 'snapshot-1',
        stock_teorico_reconteo: 10, stock_reconteo: item.stock_fisico,
        diferencia_reconteo: item.stock_fisico - 10, diferencia: item.stock_fisico - 10,
        estado_diferencia: item.stock_fisico === 10 ? 'Coincide' : 'Inconsistente',
        valor_diferencia: (item.stock_fisico - 10) * 4, recontado_at: item.contado_at,
      }
    })
    state.review_queue = []
    state.groups.filter((group) => group.requiere_reconteo).forEach((group) => { group.requiere_reconteo = false })
    state.kpis.review_pending = 0
  }
  if (action === 'finish') state.session.estado = 'finalizado'
  response.state = structuredClone(state)
  ledger.set(payload.operation_id, response)
  if (action === 'save_batch' && !lost) { lost = true; return route.abort('failed') }
  return fulfill(response)
})
const page = await context.newPage()
page.setDefaultTimeout(15000)
page.on('pageerror', (e) => errors.push(e.message))
try {
  await page.goto('http://127.0.0.1:5206/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
  assert.equal(calls.filter((c) => c.rpc === 'rpc_solog_cashier_bootstrap_v2').length, 1)
  await page.getByRole('navigation', { name: 'Panel Cajero' }).getByRole('button', { name: 'Conteo', exact: true }).click()
  await page.getByText('Grupo conteo', { exact: true }).waitFor()
  await page.getByRole('navigation', { name: 'Panel Cajero' }).getByRole('button', { name: 'Inicio', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).click()
  await page.getByRole('button', { name: /Stock positivo/ }).click()
  await page.getByRole('button', { name: /Abarrotes/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Grupo conteo/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: '9', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: /Enviar conteo/, exact: false }).first().click()
  await page.getByRole('alert').filter({ hasText: 'No se pudo' }).first().waitFor()
  await page.getByRole('button', { name: /Enviar conteo/, exact: false }).first().click()
  await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
  assert.equal(calls.filter((c) => c.body?.p_action === 'save_batch').length, 2)
  const batches = calls.filter((c) => c.body?.p_action === 'save_batch')
  assert.deepEqual(batches[0].body, batches[1].body)
  assert.equal(calls.filter((c) => c.rpc === 'rpc_solog_cashier_history_v2').length, 0, 'Historial no se precarga')
  const nav = page.getByRole('navigation', { name: 'Panel Cajero' })
  await nav.getByRole('button', { name: 'Historial', exact: true }).click()
  await page.getByText('Histórico conteo', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Expandir detalle de Histórico conteo' }).click()
  await page.getByText('3:30 PM', { exact: true }).waitFor()
  await page.getByRole('button', { name: /Por categorías/ }).click()
  await page.getByRole('button', { name: /Abarrotes/ }).click()
  await page.getByRole('button', { name: 'Ayer', exact: true }).click()
  await page.getByText('No hay observaciones para ayer.').waitFor()
  await page.getByRole('button', { name: 'Hoy', exact: true }).click()
  await page.getByText('Histórico conteo', { exact: true }).waitFor()
  await nav.getByRole('button', { name: 'Inicio', exact: true }).click()
  await nav.getByRole('button', { name: 'Historial', exact: true }).click()
  await page.getByText('Histórico conteo', { exact: true }).waitFor()
  assert.equal(calls.filter((c) => c.rpc === 'rpc_solog_cashier_history_v2').length, 2, 'Períodos completos reutilizados sin N+1')
  await page.getByRole('navigation', { name: 'Panel Cajero' }).getByRole('button', { name: 'Revisar', exact: true }).click()
  assert.deepEqual(await page.locator('.cajero-review-list__rows button strong').allTextContents(), ['Grupo revisión', 'Grupo revisión 2'])
  await page.getByRole('button', { name: 'Revisar Grupo revisión', exact: true }).click()
  const beforeDraft = calls.length
  await page.getByRole('dialog').getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '0', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Guardar/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Siguiente', exact: true }).click()
  await page.getByRole('dialog').getByRole('heading', { name: /Grupo revisión 2/ }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: '9', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Guardar/ }).click()
  assert.equal(calls.length, beforeDraft, 'Abrir, capturar y guardar draft no realizan requests')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: /Enviar conteo/ }).count(), 0)
  await nav.getByRole('button', { name: 'Inicio', exact: true }).click()
  await page.getByRole('button', { name: /Enviar conteo/, exact: false }).click()
  assert.equal(calls.filter((c) => c.body?.p_action === 'recount_save_batch').length, 1)
  assert.equal(calls.find((c) => c.body?.p_action === 'recount_save_batch').body.p_payload.items.length, 2)
  assert.equal(calls.filter((c) => ['recount_start', 'recount_save'].includes(c.body?.p_action)).length, 0)
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
  assert.equal(calls.filter((c) => c.rpc === 'rpc_solog_cashier_bootstrap_v2').length, 1)
  const persisted = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key) => /^solog\.cajero\.(buffer|expressions|recount|activity)\./.test(key)))
  assert.deepEqual(persisted, [])
  await page.clock.install({ time: Date.now() })
  await page.clock.setSystemTime(Date.now() + 121 * 60_000)
  const beforeFocus = calls.length
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
  await page.getByText('La sesión de conteo venció.', { exact: true }).waitFor()
  assert.equal(calls.length, beforeFocus, 'Reanudar comprueba expiración local sin RPC')
  await page.getByRole('navigation', { name: 'Panel Cajero' }).getByRole('button', { name: 'Inicio', exact: true }).click()
  await page.getByRole('button', { name: 'Finalizar conteo', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
  assert.equal(calls.filter((c) => c.rpc === 'rpc_solog_cashier_bootstrap_v2').length, 2)
  assert.deepEqual(errors, [])
  console.log('PASS Cajero V7: drafts locales, batch separado, cero reconteos unitarios, replay, orden, historial y cierre simulado')
} finally { await context.close(); await browser.close(); await server.close() }
