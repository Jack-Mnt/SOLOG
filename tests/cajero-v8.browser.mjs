// V8: reloj controlado, RPC simuladas, ninguna conexión a producción.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { cashierFixture, startedFixture, capabilityFixture } from './fixtures/cashier-v4.mjs'

const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({ server: { host: '127.0.0.1', port: 5214, strictPort: true }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-v8.test'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
} })
await server.listen()
const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
async function scenario(command) {
  const context = await browser.newContext()
  const b = cashierFixture()
  const initialTime = Date.parse(b.server_now)
  b.start_capability.snapshot_expira_at = new Date(initialTime + 30 * 60000).toISOString()
  b.panel_state.kpis = { ...b.panel_state.kpis, coverage_counted: 2, coverage_percent: 100 }
  let state = startedFixture(b), revision = 10, backendTime = initialTime
  const calls = [], errors = []
  const user = { id: 'user-1', email: 'cashier@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: b.server_now }
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: 2100000000 }]
    .map(p => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.') + '.test'
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'solog-v8.test') return route.abort()
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (url.pathname.includes('/auth/v1/token')) return reply({ access_token: jwt, refresh_token: 'test', expires_in: 86400, token_type: 'bearer', user })
    if (url.pathname.includes('/auth/v1/user')) return reply(user)
    const rpc = url.pathname.split('/').at(-1), body = route.request().postDataJSON()
    calls.push({ rpc, body })
    const now = new Date(backendTime).toISOString()
    if (rpc === 'rpc_solog_route_v2') return reply({ contract_version: 2, generated_at: now, identity: b.identity, route: '/cajero' })
    if (rpc === 'rpc_solog_cashier_bootstrap_v2') {
      const active = state.session.estado === 'activo' && backendTime < Date.parse(state.session.recovery_until)
      return reply({ ...b, server_now: now, generated_at: now, revisions: { ...b.revisions, operational: revision },
        session_capability: capabilityFixture(active ? state : null, now),
        session_state: active ? state : null,
        panel_state: active ? { ...state, basis: b.panel_state.basis, source: 'session', frozen: true } : b.panel_state })
    }
    if (rpc === 'rpc_solog_cashier_history_v2') return reply({
      contract_version: 2, generated_at: now, period: 'today', date: '2026-09-03', revisions: { operational: revision },
      items: [{ detalle_id: 'history', grupo_id: 'group-1', grupo: 'Caso inconsistente', categoria: 'Abarrotes',
        stock_teorico: 10, stock_fisico: 20, diferencia: -5, precio: 4, valor_diferencia: -20, estado_diferencia: 'Inconsistente',
        contado_at: b.server_now, recontado_at: b.server_now, stock_reconteo: 5, stock_posterior: 10,
        stock_teorico_reconteo: 10, snapshot_referencia_id: 'snapshot-1', primer_snapshot_posterior_id: 'snapshot-2',
        snapshot_posterior_id: 'snapshot-2', snapshot_reconteo_id: 'snapshot-2' }],
    })
    assert.equal(rpc, 'rpc_solog_cashier_mutate_v2')
    const { p_action: action, p_payload: payload } = body
    assert.ok(['save_batch', 'recount_save_batch', 'finish'].includes(action))
    assert.ok(backendTime < Date.parse(state.session.recovery_until))
    const response = { contract_version: 2, generated_at: now, action, replay: false,
      conteo_id: state.session.id, revisions: { ...b.revisions, operational: ++revision } }
    state = structuredClone(state)
    if (action !== 'finish') {
      assert.equal(payload.items.length, 1)
      assert.equal(payload.items[0].contado_at, b.server_now, 'timestamp de captura original')
      response.saved = 1
      if (action === 'save_batch') {
        state.count_queue = []; state.kpis.count_pending = 0
        response.items = [{ ...payload.items[0], detalle_id: 'normal' }]
      } else {
        state.review_queue = []; state.kpis.review_pending = 0
        response.items = [{ ...payload.items[0], grupo_id: 'group-2', snapshot_reconteo_id: 'snapshot-1',
          stock_teorico_reconteo: 10, stock_reconteo: 8, diferencia_reconteo: -2, diferencia: -2,
          estado_diferencia: 'Confirmada', valor_diferencia: -8, recontado_at: now }]
      }
    } else state.session.estado = 'finalizado'
    return reply({ ...response, state })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', e => errors.push(e.message))
  await page.clock.install({ time: new Date(initialTime) })
  // Congelar solo la hora de captura; los timers siguen funcionando.
  await page.clock.setFixedTime(new Date(initialTime))
  try {
    await page.goto('http://127.0.0.1:5214/login')
    await page.getByLabel('Correo electrónico').fill(user.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    const nav = page.getByRole('navigation', { name: 'Panel Cajero' })
    const before = calls.length
    await nav.getByRole('button', { name: 'Conteo diario', exact: true }).click()
    await page.getByRole('button', { name: /Abarrotes/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Grupo conteo/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: '9', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await nav.getByRole('button', { name: 'Revisar', exact: true }).click()
    await page.getByRole('button', { name: 'Revisar Grupo revisión', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '8', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await nav.getByRole('button', { name: 'Inicio', exact: true }).click()
    const card = page.locator('article').filter({ hasText: 'Pendientes de envío' })
    assert.equal(await card.locator('strong').textContent(), '2')
    assert.equal(calls.length, before, 'captura local sin requests')

    await page.clock.setSystemTime(new Date(initialTime))
    await page.clock.fastForward(20 * 60000 + 100)
    await page.getByText('La sesión se bloqueó por inactividad.', { exact: true }).waitFor()
    assert.equal(calls.length, before, 'inactividad no provoca requests')
    assert.equal(await card.locator('strong').textContent(), '2')
    assert.equal(await card.getByRole('button').isEnabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Finalizar conteo', exact: true }).isEnabled(), true)
    await page.getByRole('heading', { name: 'Inicio', exact: true }).click()
    await page.getByText('La sesión se bloqueó por inactividad.', { exact: true }).waitFor({ state: 'hidden' })
    assert.equal(await page.getByRole('button', { name: 'Continuar conteo', exact: true }).isEnabled(), true)

    backendTime = initialTime + 31 * 60000
    await page.clock.setSystemTime(new Date(backendTime))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByText('Sesión en recuperación.', { exact: true }).waitFor()
    const limit = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(Date.parse(state.session.recovery_until))
    assert.ok((await page.getByRole('alert').first().textContent()).includes(limit))
    assert.equal(await card.locator('strong').textContent(), '2')
    assert.equal(calls.length, before, 'active → recovery sin requests')
    await nav.getByRole('button', { name: 'Revisar', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Revisar Grupo revisión', exact: true }).isDisabled(), true)
    await nav.getByRole('button', { name: 'Conteo diario', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: /Abarrotes/ }).isDisabled(), true)
    assert.equal(await page.getByRole('dialog').count(), 0)
    await nav.getByRole('button', { name: 'Inicio', exact: true }).click()

    if (command === 'expired') {
      backendTime = Date.parse(state.session.recovery_until)
      await page.clock.setSystemTime(new Date(backendTime))
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      await page.getByText('La sesión de conteo venció.', { exact: true }).waitFor()
      assert.equal(await card.locator('strong').textContent(), '0')
      assert.equal(await card.getByRole('button').isDisabled(), true)
      assert.equal(await page.getByRole('button', { name: 'Finalizar conteo', exact: true }).isDisabled(), true)
      assert.equal(calls.length, before, 'expiración definitiva no envía ni finaliza')
      await page.getByRole('button', { name: 'Consultar estado de sesión', exact: true }).click()
      await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
      assert.equal(calls.filter(c => c.body?.p_action).length, 0)
    } else if (command === 'reload') {
      await page.reload()
      await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
      assert.equal(await card.locator('strong').textContent(), '0')
      assert.equal(calls.filter(c => c.body?.p_action).length, 0)
    } else {
      if (command === 'normal') {
        await nav.getByRole('button', { name: 'Conteo diario', exact: true }).click()
        await page.getByRole('button', { name: 'Enviar conteo', exact: true }).click()
      } else await (command === 'finish' ? page.getByRole('button', { name: 'Finalizar conteo', exact: true }) : card.getByRole('button')).click()
      const expected = command === 'normal' ? ['save_batch'] : command === 'finish' ? ['save_batch', 'recount_save_batch', 'finish'] : ['save_batch', 'recount_save_batch']
      await page.waitForFunction(() => !document.body.textContent.includes('Enviando…'))
      assert.deepEqual(calls.filter(c => c.body?.p_action).map(c => c.body.p_action), expected)
    }
    if (command === 'global') {
      await nav.getByRole('button', { name: 'Historial', exact: true }).click()
      await page.getByRole('button', { name: 'Expandir detalle de Caso inconsistente' }).click()
      const style = await page.locator('.cajero-history-value--discarded').evaluateAll(nodes => nodes.map(n => {
        const s = getComputedStyle(n)
        const probe = document.createElement('span'); probe.style.color = 'var(--danger, #b42318)'; n.append(probe)
        const expected = getComputedStyle(probe).color; probe.remove()
        return { color: s.color, expected, decoration: s.textDecorationLine }
      }))
      assert.equal(style.length, 2)
      for (const s of style) { assert.equal(s.color, s.expected); assert.equal(s.decoration, 'line-through') }
      assert.equal(await page.locator('.cajero-history-list__detail').evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').length), 3)
    }
    assert.deepEqual(errors, [])
    console.log('PASS V8 browser:', command)
  } finally { await context.close() }
}
try {
  for (const command of ['normal', 'global', 'finish', 'expired', 'reload']) await scenario(command)
} finally { await browser.close(); await server.close() }
