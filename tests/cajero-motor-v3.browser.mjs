// Ejecutar con node tests/cajero-motor-v3.browser.mjs.
// Requiere Playwright disponible en SOLOG_PLAYWRIGHT_MODULE (sin instalar dependencias).
// Todas las RPC se simulan en un contexto aislado. No accede a Supabase real.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
const { chromium } = await import(process.env.SOLOG_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href : 'playwright')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5197, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-v3.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  },
})
await server.listen()
console.log('Servidor de pruebas listo')
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER ? { executablePath: process.env.SOLOG_TEST_BROWSER } : {}),
})
console.log('Navegador aislado iniciado')
const now = () => new Date().toISOString()
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'cashier@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now() }
const jwt = [ { alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 } ].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
const errors = []
const checks = []
const check = (label) => { checks.push(label); console.log('PASS ' + label) }
const group = (id) => ({
  grupo_id: id, nombre: 'Grupo ' + id, categoria_id: 'cat', categoria: 'Bebidas', categoria_orden: 1,
  precio: 4, stock_teorico: 10, cubierto_quincena: false, estado_stock: 'Cambio_reciente', productos: [],
})
async function scenario({ complete = false, available = true } = {}) {
  console.log('Escenario', { complete, available })
  const context = await browser.newContext()
  const state = {
    snapshot: 's1', complete, available, expired: false, superseded: false, failedSend: false,
    active: complete, normal: [group('normal')], daily: [], history: [], calls: [],
    review: complete ? ['Coincide', 'Confirmada', 'Inconsistente'].map((outcome, i) => ({
      ...group('review' + i), detalle_origen_id: 'detail' + i, estado_diferencia: 'Recontar',
      contado_at_original: now(), ultima_diferencia: -4, stock_posterior: 10,
      primer_snapshot_posterior_id: 'posterior', snapshot_reconteo_id: null, outcome,
    })) : [], frozen: new Map(), started: now(), expiration: new Date(Date.now() + 3600000).toISOString(),
  }
  const countId = 'count-original'
  const coverage = () => ({ grupos_contados: state.complete ? 3 : 0, grupos_totales: 3, pendientes: state.complete ? 0 : state.normal.length, porcentaje: state.complete ? 100 : 0, completa: state.complete, inaugurada: true, desde: '2026-08-16', hasta: '2026-08-31' })
  const bootstrap = () => ({
    usuario: { id: user.id, nombre: 'Cajero prueba', rol: 'cajero' },
    sede: { id: 'site', nombre: 'Huaca', activo: true },
    dispositivo: { id: 'device', estado: 'autorizado', sede_correcta: true, autorizado: true },
    sesion_activa: state.active && !state.expired ? { id: countId, iniciado_at: state.started, expira_at: state.expiration, grupos_guardados: state.history.length } : null,
    stock: state.available ? { disponible: true, snapshot_id: state.snapshot, snapshot_at: now(), confirmado_at: now(), puede_iniciar_conteo: true }
      : { disponible: false, snapshot_id: null, snapshot_at: null, confirmado_at: null, puede_iniciar_conteo: false },
    server_now: now(), cobertura_quincenal: coverage(),
    cobertura_diaria: { fecha: '2026-08-31', grupos_requeridos: state.daily.length, grupos_verificados: 0, pendientes: state.daily.length, porcentaje: 0, sin_requerimientos: state.daily.length === 0 },
    conteo_principal: { categorias: [{ id: 'cat', nombre: 'Bebidas', orden: 1, grupos_totales: 3, grupos_pendientes_quincena: state.normal.length }], stock_cero_pendientes: 0 },
    vistas_inteligentes: { conteo_diario: { cantidad: state.daily.length, habilitado: state.complete }, revisar: { cantidad: state.review.length, habilitado: state.complete } },
  })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'solog-v3.test') {
      errors.push('Tráfico externo inesperado: ' + url.hostname)
      return route.abort()
    }
    const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    const reject = (code) => fulfill({ code: 'P0001', message: code, details: '', hint: '' }, 400)
    if (url.pathname.includes('/auth/v1/token')) return fulfill({ access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user })
    if (url.pathname.includes('/auth/v1/user')) return fulfill(user)
    const { p_action: action, p_payload: payload } = request.postDataJSON()
    state.calls.push({ action, payload: structuredClone(payload) })
    if (action === 'bootstrap') return fulfill(bootstrap())
    if (action === 'status') return fulfill({
      ok: true, codigo: 'CASHIER_STATUS', server_now: now(), snapshot_actual_id: state.available ? state.snapshot : null,
      conteo_id: state.active && !state.expired ? countId : null,
      cobertura_quincenal_completa: state.complete, conteo_diario_pendientes: state.daily.length, revisar_pendientes: state.review.length,
    })
    if (action === 'start') {
      state.active = true
      return fulfill({ ok: true, codigo: 'COUNT_STARTED', conteo_id: countId, snapshot_actual_id: state.snapshot, snapshot_actual_at: now(), snapshot_confirmado_at: now(), iniciado_at: state.started, expira_at: state.expiration, server_now: now() })
    }
    if (action === 'groups') {
      assert.ok(['conteo', 'conteo_diario', 'revisar'].includes(payload.vista))
      const groups = payload.vista === 'conteo' ? state.normal : payload.vista === 'conteo_diario' ? state.daily : state.review
      const response = { conteo_id: countId, vista: payload.vista, snapshot_actual_id: state.snapshot, snapshot_actual_at: now(), grupos: groups.map((item) => ({ ...item, stock_teorico: state.snapshot === 's1' ? 10 : 20 })), server_now: now() }
      if (state.delayNextGroups) {
        state.delayNextGroups = false
        await new Promise((resolve) => {
          state.releaseGroups = resolve
          state.groupDelayed()
        })
      }
      return fulfill(response)
    }
    if (action === 'save_batch') {
      for (const item of payload.items) assert.deepEqual(Object.keys(item).sort(), ['client_observation_id', 'contado_at', 'grupo_id', 'stock_fisico'])
      if (state.failedSend) return fulfill({ message: 'Fallo simulado' }, 500)
      if (state.superseded) return reject('SOLOG_EXPIRED_SESSION_SUPERSEDED')
      const items = payload.items.map((item) => ({
        ...item, resultado: 'guardado', detalle_id: 'saved-' + item.grupo_id,
        snapshot_referencia_id: 's1', stock_teorico: 10, diferencia: -2, estado_diferencia: 'Recontar',
      }))
      state.normal = state.normal.filter((item) => !items.some((saved) => saved.grupo_id === item.grupo_id))
      state.daily = state.daily.filter((item) => !items.some((saved) => saved.grupo_id === item.grupo_id))
      return fulfill({ ok: true, codigo: 'COUNT_BATCH_SAVED', conteo_id: countId, items, errores: [], guardados: items.length, ya_guardados: 0, rechazados: 0, server_now: now() })
    }
    if (action === 'recount_start') {
      const item = state.review.find((item) => item.detalle_origen_id === payload.detalle_id)
      if (!item) return reject('SOLOG_RECOUNT_NOT_ELIGIBLE')
      if (!state.frozen.has(payload.detalle_id)) state.frozen.set(payload.detalle_id, { snapshot_reconteo_id: state.snapshot, stock_teorico_reconteo: state.snapshot === 's1' ? 10 : 20 })
      return fulfill({ ok: true, codigo: 'RECOUNT_STARTED', conteo_id: countId, detalle_id: payload.detalle_id, ...state.frozen.get(payload.detalle_id), server_now: now() })
    }
    if (action === 'recount') {
      if (state.failRecountBeforeSave) {
        state.failRecountBeforeSave = false
        return fulfill({ message: 'Fallo simulado' }, 500)
      }
      assert.ok(state.frozen.has(payload.detalle_id), 'recount_start debe preceder a recount')
      const item = state.review.find((item) => item.detalle_origen_id === payload.detalle_id)
      if (!item) return reject('SOLOG_RECOUNT_NOT_ELIGIBLE')
      const difference = item.outcome === 'Coincide' ? 0 : item.outcome === 'Confirmada' ? -1 : 3
      const result = { ok: true, codigo: 'RECOUNT_SAVED', conteo_id: countId, detalle_id: payload.detalle_id, ...state.frozen.get(payload.detalle_id), stock_reconteo: payload.stock_fisico, diferencia_reconteo: -2, diferencia: difference, estado_diferencia: item.outcome, recontado_at: payload.contado_at }
      state.review = state.review.filter((other) => other !== item)
      if (item.outcome === 'Inconsistente') state.daily.push(group(item.grupo_id))
      state.history.push({ detalle_id: payload.detalle_id, contado_at: item.contado_at_original, grupo_id: item.grupo_id, grupo: item.nombre, categoria_id: 'cat', categoria: 'Bebidas', stock_teorico: 100, stock_fisico: 1, diferencia: difference, estado_diferencia: item.outcome, precio: 4, valor_diferencia: difference * 4, stock_posterior: 10, stock_reconteo: payload.stock_fisico, recontado_at: payload.contado_at })
      if (state.loseRecountResponse) return route.abort('failed')
      return fulfill(result)
    }
    if (action === 'history') return fulfill({ ok: true, codigo: 'COUNT_HISTORY', periodo: payload.periodo, desde: '2026-08-31', hasta: '2026-09-01', items: state.history, server_now: now() })
    errors.push('RPC inesperada: ' + action)
    return reject('SOLOG_UNKNOWN_ERROR')
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(10000)
  await page.goto('http://127.0.0.1:5197/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-only-password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
  return { context, page, state }
}
async function nav(page, name) {
  await page.getByRole('navigation', { name: 'Panel Cajero' }).getByRole('button', { name, exact: true }).click()
}
async function capture(page) {
  await page.getByRole('button', { name: /Bebidas/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Grupo normal/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: '8', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByRole('dialog').locator('dd').filter({ hasText: /^8$/ }).waitFor()
}
async function pending(page) {
  return page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('solog.cajero.buffer.v4:')).map((key) => JSON.parse(sessionStorage.getItem(key))))
}
try {
  {
    const { context, page, state } = await scenario({ available: false })
    await page.getByText('No hay un inventario disponible.').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).count(), 0)
    check('login y sesión sin snapshot disponible')
    state.available = true
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
    check('primer snapshot disponible actualiza Inicio sin recargar')
    await context.close()
  }
  for (const superseded of [false, true]) {
    const { context, page, state } = await scenario()
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).click()
    await capture(page)
    const original = (await pending(page))[0]
    assert.equal(original.version, 4)
    state.snapshot = 's2'
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
    await nav(page, 'Inicio')
    await nav(page, 'Conteo')
    await page.getByRole('button', { name: /Bebidas/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Grupo normal/ }).click()
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).isEnabled(), true)
    assert.deepEqual((await pending(page))[0].items, original.items)
    assert.equal(state.calls.filter((call) => call.action === 'finish').length, 0)
    check('snapshot nuevo preserva sesión, captura y pendientes V4')
    state.expired = true
    state.superseded = superseded
    await page.reload()
    await page.getByRole('heading', { name: 'Conteo', exact: true }).waitFor()
    await nav(page, 'Inicio')
    await page.getByRole('button', { name: 'Enviar conteo', exact: true }).click()
    if (superseded) {
      await page.getByText(/Otra sesión comenzó/).waitFor()
      assert.deepEqual((await pending(page))[0].items, original.items)
      assert.equal((await pending(page))[0].envio_bloqueado, 'SOLOG_EXPIRED_SESSION_SUPERSEDED')
      const sent = state.calls.filter((call) => call.action === 'save_batch').length
      await page.getByRole('button', { name: 'Enviar conteo', exact: true }).click()
      assert.equal(state.calls.filter((call) => call.action === 'save_batch').length, sent)
      check('SUPERSEDED conserva buffer y no reenvía ni reasigna')
    } else {
      await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
      assert.equal((await pending(page)).length, 0)
      const sent = state.calls.find((call) => call.action === 'save_batch').payload
      assert.equal(sent.conteo_id, original.scope.conteo_id)
      assert.deepEqual(sent.items, original.items.map(({ client_observation_id, grupo_id, stock_fisico, contado_at }) => ({ client_observation_id, grupo_id, stock_fisico, contado_at })))
      check('recuperación de expirados usa UUID, timestamp, físico y sesión originales')
    }
    await context.close()
  }
  {
    const { context, page, state } = await scenario({ complete: true })
    await nav(page, 'Historial')
    await page.getByText('No hay observaciones para hoy.').waitFor()
    await nav(page, 'Revisar')
    await page.getByRole('button', { name: 'Revisar Grupo review0', exact: true }).waitFor()
    assert.equal(state.calls.filter((call) => call.action === 'recount_start').length, 0)
    for (const [i, outcome] of ['Coincide', 'Confirmada', 'Inconsistente'].entries()) {
      await page.getByRole('button', { name: 'Revisar Grupo review' + i, exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '8', exact: true }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => !document.querySelector('.cajero-calculator__keys button')?.disabled)
      const ref = state.frozen.get('detail' + i)
      if (i === 0) {
        state.snapshot = 's2'
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await page.reload()
        await page.getByRole('button', { name: 'Revisar Grupo review0', exact: true }).click()
        await page.waitForFunction(() => !document.querySelector('.cajero-calculator__keys button')?.disabled)
        assert.deepEqual(state.frozen.get('detail0'), ref)
        const theoretical = await page.getByRole('dialog').locator('dl div').filter({ has: page.locator('dt', { hasText: 'Stock TumiSoft' }) }).locator('dd').innerText()
        assert.equal(theoretical, '10')
        check('recount_start individual, snapshot durante reconteo y reanudación tras recarga')
      }
      await page.getByRole('dialog').getByRole('button', { name: '8', exact: true }).click()
      if (i === 1) state.failRecountBeforeSave = true
      await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click()
      if (i === 1) {
        await page.getByRole('button', { name: 'Consultar y reanudar', exact: true }).waitFor()
        const original = state.calls.filter((call) => call.action === 'recount').at(-1).payload
        await page.getByRole('button', { name: 'Consultar y reanudar', exact: true }).click()
        await page.waitForFunction(() => !document.querySelector('.cajero-calculator__keys button')?.disabled)
        await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click()
        await page.getByRole('dialog').locator('.control-state-badge', { hasText: outcome }).waitFor()
        assert.deepEqual(state.calls.filter((call) => call.action === 'recount').at(-1).payload, original)
        check('reintento de recount conserva detalle, físico y timestamp tras revalidación')
      }
      await page.getByRole('dialog').locator('.control-state-badge', { hasText: outcome }).waitFor()
      assert.equal((await pending(page)).length, 0)
      if (i === 2 && process.env.SOLOG_TEST_SCREENSHOT) {
        await page.screenshot({ path: process.env.SOLOG_TEST_SCREENSHOT, fullPage: true })
      }
      check('recount muestra resultado autoritativo ' + outcome)
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
    }
    await nav(page, 'Conteo diario')
    await page.getByRole('button', { name: /Bebidas/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Grupo review2/ }).waitFor()
    check('Inconsistente reaparece en la cola de Conteo Diario')
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
    await nav(page, 'Historial')
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Expandir detalle de Grupo review' + i, exact: true }).click()
    assert.equal(await page.locator('.cajero-history-list .control-state-badge').count(), 3)
    assert.equal(await page.getByText('Tipo', { exact: true }).count(), 0)
    check('Historial V3 conserva diferencias backend y muestra reconteos')
    await context.close()
  }
  {
    const { context, page, state } = await scenario({ complete: true })
    state.daily = [group('old')]
    state.delayNextGroups = true
    const delayed = new Promise((resolve) => { state.groupDelayed = resolve })
    await nav(page, 'Conteo diario')
    await delayed
    state.snapshot = 's2'
    state.daily = [group('new')]
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByRole('button', { name: /Bebidas/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Grupo new/ }).waitFor()
    const arrived = page.waitForResponse((response) => response.url().includes('/rpc/') && response.request().postDataJSON().p_action === 'groups')
    state.releaseGroups()
    await arrived
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: /Grupo old/ }).count(), 0)
    check('respuesta tardía de grupos no reinstala una cola anterior al snapshot')
    await context.close()
  }
  {
    const { context, page, state } = await scenario({ complete: true })
    state.loseRecountResponse = true
    await nav(page, 'Revisar')
    await page.getByRole('button', { name: 'Revisar Grupo review0', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('.cajero-calculator__keys button')?.disabled)
    await page.getByRole('dialog').getByRole('button', { name: '8', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('button', { name: 'Consultar y reanudar', exact: true }).click()
    await page.getByRole('dialog').getByText('Este grupo ya no requiere un reconteo.').waitFor()
    assert.equal(state.calls.filter((call) => call.action === 'recount').length, 1)
    assert.equal(state.history.length, 1)
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).isEnabled(), false)
    check('respuesta perdida de recount se reconcilia sin duplicar ni simular éxito')
    await context.close()
  }
  assert.deepEqual(errors, [])
  console.log('Resultado: ' + checks.length + ' comprobaciones UI; cero errores JS y cero solicitudes a Supabase real.')
} catch (error) {
  console.error(error)
  throw error
} finally {
  await browser.close()
  await server.close()
}
