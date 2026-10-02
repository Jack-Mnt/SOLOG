// Productive V4 smoke: real React/router/auth surfaces, mocked RPCs, external traffic blocked.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { cashierV4Bootstrap, cashierV4Mutation, cashierV4Panel, cashierV4Ids as ids } from './fixtures/cashier-v4.mjs'

const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({ server: { host: '127.0.0.1', port: 5210, strictPort: true }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-cashier-v4.test'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only'),
} })
await server.listen()
const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
const user = { id: ids.user, email: 'cashier@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-01T00:00:00Z' }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }]
  .map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'

async function scenario({ startAction = 'coverage', round = 1, initial = 'pre_session', recovery = false, richCoverage = false, expiredWithDraft = false, expiredWithoutDraft = false, autocloseError = null, startTimeout = false, finishFailure = false, startRefreshError = false } = {}, run) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } })
  const calls = [], errors = []
  let startAttempts = 0, finishAttempts = 0, batchAttempts = 0
  let confirmedBatch = null
  let b = cashierV4Bootstrap(initial, { next_action: initial === 'pre_session' ? 'coverage' : startAction, ronda: round })
  if (recovery) b = cashierV4Bootstrap('active_recovery', { next_action: 'coverage' })
  if (richCoverage) {
    const original = b.panel_state.groups.find(g => g.grupo_id === ids.coverage)
    const added = [10, 0, -3].map((stock, index) => ({ ...original, grupo_id: `20000000-0000-4000-8000-00000000000${index + 1}`, nombre: `Grupo adicional ${index}`, stock_teorico: stock }))
    b.panel_state.groups.push(...added)
    b.panel_state.coverage_queue = [added[0].grupo_id, ids.coverage, added[1].grupo_id, added[2].grupo_id]
    b.panel_state.kpis.coverage_total = 7; b.panel_state.kpis.coverage_pending = 5; b.panel_state.kpis.coverage_percent = 2 / 7 * 100; b.panel_state.kpis.coverage_queue_pending = 4
  }
  if (recovery) {
    const scope = { usuario_id: ids.user, sede_id: ids.site, dispositivo_id: ids.device, conteo_id: ids.recovery, groups_revision: 6 }
    const panelA = cashierV4Panel({ next_action: 'coverage' })
    const delivery = { conteo_id: ids.recovery, groups_revision: 6, review_queue: [], coverage_queue: panelA.coverage_queue,
      daily_queue: [], kpis: { ...panelA.kpis, daily_pending: 0 }, next_action: 'coverage' }
    const observation = { kind: 'normal', scope, client_observation_id: ids.observation, grupo_id: ids.coverage,
      stock_fisico: 10, contado_at: b.recovery_sessions[0].iniciado_at }
    const key = 'solog.cashier-v4.session.v1:' + [scope.usuario_id, scope.sede_id, scope.dispositivo_id, scope.conteo_id, scope.groups_revision].join(':')
    const record = { version: 1, scope, normal: [observation], recount: [], delivery_state: delivery, prepared: null, issue: null, finished: false }
    await context.addInitScript(({ key, record }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(record)) }, { key, record })
  }
  if (expiredWithDraft) {
    assert.equal(initial, 'active')
    const panel = b.panel_state
    const scope = { usuario_id: ids.user, sede_id: ids.site, dispositivo_id: ids.device,
      conteo_id: panel.session.id, groups_revision: panel.basis.groups_revision }
    const delivery = { conteo_id: scope.conteo_id, groups_revision: scope.groups_revision,
      review_queue: panel.review_queue, coverage_queue: panel.coverage_queue, daily_queue: panel.daily_queue,
      kpis: panel.kpis, next_action: panel.next_action }
    const recount = startAction === 'review'
    const observation = recount ? { kind: 'recount', scope, detalle_id: ids.detail, grupo_id: ids.review,
      stock_fisico: 10, contado_at: panel.session.iniciado_at }
      : { kind: 'normal', scope, client_observation_id: ids.observation, grupo_id: ids.coverage,
        stock_fisico: 10, contado_at: panel.session.iniciado_at }
    const key = 'solog.cashier-v4.session.v1:' + [scope.usuario_id, scope.sede_id, scope.dispositivo_id, scope.conteo_id, scope.groups_revision].join(':')
    const record = { version: 1, scope, normal: recount ? [] : [observation], recount: recount ? [observation] : [], delivery_state: delivery, prepared: null, issue: null, finished: false }
    await context.addInitScript(({ key, record }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(record)) }, { key, record })
    b.server_now = new Date(Date.parse(panel.session.expira_at) + 1000).toISOString()
    b.generated_at = b.server_now
  }
  if (expiredWithoutDraft) {
    b.server_now = new Date(Date.parse(b.panel_state.session.expira_at) + 1000).toISOString()
    b.generated_at = b.server_now
  }
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'solog-cashier-v4.test') return route.abort()
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (url.pathname.includes('/auth/v1/token')) return reply({ access_token: jwt, refresh_token: 'test', expires_in: 3600, token_type: 'bearer', user })
    if (url.pathname.includes('/auth/v1/user')) return reply(user)
    if (url.pathname.includes('/auth/v1/logout')) { calls.push({ rpc: 'auth_logout', body: {} }); return reply({}) }
    const rpc = url.pathname.split('/').at(-1), body = route.request().postDataJSON()
    calls.push({ rpc, body })
    if (rpc === 'rpc_solog_route_v2') return reply({ contract_version: 2, generated_at: b.server_now, identity: b.identity, route: '/cajero' })
    if (rpc === 'rpc_solog_cashier_bootstrap_v4') return reply(b)
    if (rpc === 'rpc_solog_cashier_history_v2') return reply({ contract_version: 2, generated_at: b.server_now, period: body.p_payload.period,
      date: round === 1 ? '2026-10-03' : '2026-10-10', revisions: b.revisions, items: [{
        detalle_id: ids.detail, grupo_id: ids.coverage, grupo: 'Grupo histórico inválido', categoria: 'Abarrotes', stock_teorico: 1, stock_fisico: 2, diferencia: 1,
        precio: 4, valor_diferencia: 4, estado_diferencia: 'Inválido', contado_at: b.server_now, recontado_at: null,
        snapshot_referencia_id: null, primer_snapshot_posterior_id: null, snapshot_posterior_id: null, snapshot_reconteo_id: null,
        stock_posterior: null, stock_teorico_reconteo: null, stock_reconteo: null,
      }] })
    assert.equal(rpc, 'rpc_solog_cashier_mutate_v4')
    const action = body.p_action, payload = body.p_payload
    if (expiredWithDraft || expiredWithoutDraft) {
      const localRecord = await page.evaluate(conteoId => Object.keys(localStorage)
        .filter(key => key.startsWith('solog.cashier-v4.session.v1:'))
        .map(key => JSON.parse(localStorage.getItem(key))).find(record => record.scope.conteo_id === conteoId), payload.conteo_id)
      assert.equal(localRecord.prepared.operation_id, payload.operation_id, 'Operación persistida antes del RPC')
      assert.equal(localRecord.scope.groups_revision, payload.expected_groups_revision)
    }
    if (action === 'start') {
      startAttempts++
      if (startRefreshError && startAttempts === 1) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'SOLOG_STOCK_EXPIRED', details: '', hint: '' }) })
      const result = cashierV4Mutation('start', { next_action: startAction, ronda: round })
      b = cashierV4Bootstrap('active', { next_action: startAction, ronda: round })
      if (startTimeout && startAttempts === 1) return route.abort('timedout')
      if (startTimeout && startAttempts > 1) result.replay = true
      return reply(result)
    }
    const result = cashierV4Mutation(action, { ronda: round })
    result.conteo_id = payload.conteo_id
    if (action === 'finish') {
      if (finishFailure && ++finishAttempts === 1) return route.abort('timedout')
      if (payload.conteo_id === ids.recovery) {
        const session = b.recovery_sessions.find(session => session.id === payload.conteo_id)
        result.session_capability.expira_at = session.expira_at
        result.session_capability.recovery_until = session.recovery_until
        b.recovery_sessions = []
      }
      else b = cashierV4Bootstrap('pre_session', { next_action: 'coverage', ronda: round })
      return reply(result)
    }
    batchAttempts++
    if (confirmedBatch) return reply({ ...confirmedBatch, replay: true })
    if (autocloseError && autocloseError !== 'timeout' && batchAttempts === 1) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: autocloseError, details: '', hint: '' }) })
    }
    const isRecovery = payload.conteo_id === ids.recovery
    const cap = isRecovery ? b.recovery_sessions[0].session_capability : b.panel_state.session_capability
    result.session_capability = cap
    result.saved = payload.items.length
    result.items = payload.items.map(item => action === 'save_batch' ? { ...item, detalle_id: ids.savedDetail, stock_teorico: 10,
      diferencia: item.stock_fisico - 10, estado_diferencia: item.stock_fisico === 10 ? 'Coincide' : 'Recontar' }
      : { ...result.items[0], stock_reconteo: item.stock_fisico, recontado_at: item.contado_at })
    result.panel_delta.session_capability = cap
    if (!isRecovery && action === 'save_batch' && payload.items[0].grupo_id === ids.daily) {
      result.panel_delta.daily_queue = []; result.panel_delta.kpis.daily_pending = 0
      result.panel_delta.kpis.coverage_pending = 0; result.panel_delta.kpis.coverage_counted = 4; result.panel_delta.kpis.coverage_percent = 100
      result.panel_delta.kpis.coverage_blocked_waiting_snapshot = 0
      result.panel_delta.groups_patch = [{ ...result.panel_delta.groups_patch[0], grupo_id: ids.daily }]
    }
    if (isRecovery) {
      result.panel_delta.review_queue = []; result.panel_delta.coverage_queue = []; result.panel_delta.daily_queue = []
      result.panel_delta.kpis.review_pending = 0; result.panel_delta.kpis.coverage_queue_pending = 0; result.panel_delta.kpis.daily_pending = 0
      result.panel_delta.next_action = 'none'
    } else {
      const d = result.panel_delta
      b.panel_state = { ...b.panel_state, groups: b.panel_state.groups.map(g => ({ ...g, ...d.groups_patch.find(p => p.grupo_id === g.grupo_id) })),
        review_queue: d.review_queue, coverage_queue: d.coverage_queue, daily_queue: d.daily_queue, kpis: d.kpis, next_action: d.next_action }
    }
    if (autocloseError === 'timeout' && batchAttempts === 1) {
      confirmedBatch = structuredClone(result)
      return route.abort('timedout') // Backend applied; response lost. Retry returns its exact replay.
    }
    return reply(result)
  })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000)
  try {
    await page.goto('http://127.0.0.1:5210/login')
    await page.getByLabel('Correo electrónico').fill(user.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('test')
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Actualizar panel', exact: true }).count(), 0)
    await run(page, calls)
    assert.equal(calls.some(c => /cashier_(bootstrap|mutate)_v3/.test(c.rpc)), false)
    assert.deepEqual(errors, [])
  } catch (error) {
    console.error('SMOKE DIAGNOSTIC', calls.map(c => ({ rpc: c.rpc, action: c.body.p_action })), await page.locator('body').innerText())
    throw error
  } finally { await context.close() }
}
async function capture(page, review = false, daily = false) {
  if (review) await page.getByRole('button', { name: 'Revisar Grupo recount' }).click()
  else {
    await page.getByRole('button', { name: /Abarrotes.*pendiente/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: daily ? /Grupo daily/ : /Grupo coverage/ }).click()
  }
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '1', exact: true }).click()
  await dialog.getByRole('button', { name: '0', exact: true }).click()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  if (!review) await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
}
const nav = page => page.getByRole('navigation', { name: 'Panel Cajero' })
const localRecords = page => page.evaluate(() => Object.keys(localStorage)
  .filter(key => key.startsWith('solog.cashier-v4.session.v1:')).map(key => JSON.parse(localStorage.getItem(key))))
const noTechnicalLifecycle = async page => {
  assert.doesNotMatch(await page.locator('body').innerText(), /Recovery|Sesión vencida/i)
}
const mutations = calls => calls.filter(call => call.rpc === 'rpc_solog_cashier_mutate_v4')
try {
  await scenario({ initial: 'active', expiredWithoutDraft: true }, async (page, calls) => {
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
    assert.deepEqual(mutations(calls).map(call => call.body.p_action), ['finish'])
    const records = await localRecords(page)
    assert.equal(records.find(record => record.scope.conteo_id === ids.session).finished, true)
    assert.equal(await nav(page).getByRole('button', { name: 'Conteo', exact: true }).count(), 0)
    assert.equal(await nav(page).getByRole('button', { name: 'Historial', exact: true }).count(), 1)
    await noTechnicalLifecycle(page)
    console.log('PASS A expiry sin drafts: un finish, sin batch, Inicio y cleanup')
  })
  await scenario({ initial: 'active', expiredWithDraft: true, startAction: 'review' }, async (page, calls) => {
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
    const sent = mutations(calls)
    assert.deepEqual(sent.map(call => call.body.p_action), ['recount_save_batch', 'finish'])
    assert.deepEqual(sent[0].body.p_payload.items, [{ detalle_id: ids.detail, stock_fisico: 10, contado_at: cashierV4Panel().session.iniciado_at }])
    assert.equal(sent[0].body.p_payload.conteo_id, ids.session)
    assert.equal(sent[0].body.p_payload.expected_groups_revision, 7)
    await noTechnicalLifecycle(page)
    console.log('PASS B recount pre-expiry: payload original y finish automático')
  })
  for (const error of ['timeout', 'SOLOG_OPERATION_IN_PROGRESS']) {
    await scenario({ initial: 'active', expiredWithDraft: true, autocloseError: error }, async (page, calls) => {
      await page.getByText('Estamos verificando si el último envío fue recibido.', { exact: true }).waitFor()
      const before = await localRecords(page), prepared = before[0].prepared
      assert.equal(prepared.status, error === 'timeout' ? 'uncertain' : 'in_progress')
      assert.equal(await page.getByRole('button', { name: 'Descartar conteos', exact: true }).count(), 0)
      assert.equal(mutations(calls).some(call => call.body.p_action === 'finish'), false)
      if (error === 'timeout') {
        await page.reload()
        await page.getByText('Estamos verificando si el último envío fue recibido.', { exact: true }).waitFor()
        assert.deepEqual((await localRecords(page))[0].prepared, prepared)
        assert.deepEqual((await localRecords(page))[0].normal, before[0].normal)
        assert.equal(mutations(calls).length, 1, 'Reload no crea un retry automático')
      }
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
      await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
      const sent = mutations(calls)
      assert.deepEqual(sent.map(call => call.body.p_action), ['save_batch', 'save_batch', 'finish'])
      assert.deepEqual(sent[1].body.p_payload, sent[0].body.p_payload)
      assert.equal((await localRecords(page))[0].normal.length, 0)
      assert.equal((await localRecords(page))[0].finished, true)
      await noTechnicalLifecycle(page)
      console.log(`PASS C/D ${error}: evidencia, retry exacto y un finish confirmado`)
    })
  }
  await scenario({ initial: 'active', expiredWithDraft: true, autocloseError: 'SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT' }, async (page, calls) => {
    await page.getByRole('button', { name: 'Descartar conteos', exact: true }).waitFor()
    await page.getByText('Envío pendiente', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Reintentar envío', exact: true }).isVisible(), true)
    const before = await localRecords(page), count = mutations(calls).length
    await page.getByRole('button', { name: 'Descartar conteos', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Descartar conteos pendientes' })
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
    assert.deepEqual(await localRecords(page), before)
    assert.equal(mutations(calls).length, count)
    await page.getByRole('button', { name: 'Descartar conteos', exact: true }).click()
    await dialog.getByRole('button', { name: 'Descartar', exact: true }).click()
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
    assert.deepEqual(mutations(calls).map(call => call.body.p_action), ['save_batch', 'finish'])
    const record = (await localRecords(page))[0]
    assert.equal(record.finished, true); assert.equal(record.normal.length, 0)
    await noTechnicalLifecycle(page)
    console.log('PASS E rechazo definitivo: Cancelar conserva, Descartar confirmado → finish')
  })
  for (const code of ['SOLOG_IDEMPOTENCY_CONFLICT', 'SOLOG_SESSION_DELIVERY_NOT_ALLOWED']) {
    await scenario({ initial: 'active', expiredWithDraft: true, autocloseError: code }, async (page, calls) => {
      await page.getByRole('alert').first().waitFor()
      assert.equal(await page.getByRole('button', { name: 'Descartar conteos', exact: true }).count(), 0)
      const records = await localRecords(page)
      assert.equal(records[0].normal.length, 1)
      assert.equal(records[0].prepared.operation_id, mutations(calls)[0].body.p_payload.operation_id)
      assert.equal(mutations(calls).length, 1)
      await noTechnicalLifecycle(page)
      console.log(`PASS E/conflicto ${code}: sin descarte ni pérdida de evidencia`)
    })
  }
  await scenario({ initial: 'active' }, async (page, calls) => {
    await nav(page).getByRole('button', { name: 'Conteo', exact: true }).click()
    await page.getByRole('button', { name: /Abarrotes.*pendiente/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Grupo coverage/ }).click()
    const dialog = page.getByRole('dialog'), before = calls.length
    assert.deepEqual(await dialog.locator('.cajero-calculator__keys button').allTextContents(),
      ['7', '8', '9', 'C', '4', '5', '6', '×', '1', '2', '3', '+', '0', 'x6', 'x12', '⌫'])
    const button = name => dialog.getByRole('button', { name, exact: true })
    const result = dialog.locator('.cajero-calculator__display strong')
    await button('2').click(); await button('Multiplicar por 6').click()
    assert.equal(await result.textContent(), '12')
    await button('Limpiar expresión').click(); await button('2').click(); await button('Multiplicar por 12').click()
    assert.equal(await result.textContent(), '24')
    await button('Limpiar expresión').click(); await button('2').focus()
    await page.keyboard.type('3+2*4')
    assert.equal(await result.textContent(), '11')
    await page.keyboard.press('Backspace'); await page.keyboard.type('5')
    assert.equal(await result.textContent(), '13')
    await page.keyboard.press('Delete'); await page.keyboard.type('10')
    await button('Continuar').click()
    await dialog.getByRole('button', { name: /Grupo coverage/ }).click()
    assert.equal(await result.textContent(), '10')
    await button('Cerrar').click()
    assert.equal(calls.length, before, 'Capturar y reabrir un draft no consulta RPC')
    console.log('PASS calculadora compartida: teclas, atajos, teclado y draft local')
  })
  await scenario({ startTimeout: true }, async (page, calls) => {
    assert.equal(await page.getByRole('button', { name: 'Actualizar', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).click()
    await page.getByRole('button', { name: 'Reintentar inicio', exact: true }).waitFor()
    await page.reload()
    await page.getByRole('button', { name: 'Reintentar inicio', exact: true }).click()
    await page.getByRole('heading', { name: 'Conteo', exact: true }).waitFor()
    const starts = calls.filter(c => c.body.p_action === 'start')
    assert.equal(starts.length, 2); assert.deepEqual(starts[1].body.p_payload, starts[0].body.p_payload)
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('solog.cashier-v4.start.v1:'))), false)
    console.log('PASS start perdido → reload active → replay con mismo UUID/payload')
  })
  await scenario({ initial: 'active' }, async (page, calls) => {
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '¿Salir del conteo?' })
    await confirmation.waitFor()
    assert.equal(calls.filter(c => c.body.p_action || c.rpc === 'auth_logout').length, 0)
    await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click()
    assert.equal(await confirmation.count(), 0)
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByRole('dialog', { name: '¿Salir del conteo?' }).getByRole('button', { name: 'Salir', exact: true }).click()
    await page.getByLabel('Correo electrónico').waitFor()
    assert.deepEqual(calls.filter(c => c.body.p_action || c.rpc === 'auth_logout').map(c => c.body.p_action ?? c.rpc), ['finish', 'auth_logout'])
    console.log('PASS active limpio → confirmación de salida → finish → auth logout')
  })
  await scenario({ initial: 'active' }, async (page, calls) => {
    await nav(page).getByRole('button', { name: 'Conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Conteo', exact: true }).waitFor(); await capture(page)
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByRole('dialog', { name: '¿Salir del conteo?' }).getByRole('button', { name: 'Salir', exact: true }).click()
    await page.getByLabel('Correo electrónico').waitFor()
    assert.deepEqual(calls.filter(c => c.body.p_action || c.rpc === 'auth_logout').map(c => c.body.p_action ?? c.rpc), ['save_batch', 'finish', 'auth_logout'])
    console.log('PASS draft active → confirmar Salir → save → finish → auth logout')
  })
  await scenario({ initial: 'active', finishFailure: true }, async (page, calls) => {
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByRole('dialog', { name: '¿Salir del conteo?' }).getByRole('button', { name: 'Salir', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.equal(calls.some(c => c.rpc === 'auth_logout'), false)
    assert.equal(await page.getByRole('heading', { name: 'Inicio', exact: true }).isVisible(), true)
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByRole('dialog', { name: '¿Salir del conteo?' }).getByRole('button', { name: 'Salir', exact: true }).click()
    await page.getByLabel('Correo electrónico').waitFor()
    const finishes = calls.filter(c => c.body.p_action === 'finish'); assert.deepEqual(finishes[1].body.p_payload, finishes[0].body.p_payload)
    console.log('PASS finish perdido conserva auth → segundo Salir conserva operación')
  })
  await scenario({ startRefreshError: true }, async page => {
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).click()
    const update = page.getByRole('alert').getByRole('button', { name: 'Actualizar', exact: true })
    await update.click()
    await page.getByRole('button', { name: 'Reintentar inicio', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Actualizar', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Reintentar inicio', exact: true }).click()
    await page.getByRole('heading', { name: 'Conteo', exact: true }).waitFor()
    console.log('PASS requiresRefresh → CTA contextual → bootstrap válido → retry')
  })
  await scenario({}, async (page, calls) => {
    await page.getByText('Cobertura quincenal 1', { exact: true }).waitFor()
    assert.equal(await page.getByText('Stock 0', { exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Conteo', exact: true }).waitFor()
    assert.equal(await page.getByText('1 pendientes', { exact: true }).count() > 0, true)
    await capture(page)
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    await page.getByText('Hay grupos esperando una actualización de stock para poder continuar.', { exact: true }).waitFor()
    assert.equal(await nav(page).getByRole('button', { name: 'Conteo', exact: true }).count(), 0)
    assert.equal(await nav(page).getByRole('button', { name: 'Historial', exact: true }).count(), 1)
    await page.getByRole('button', { name: 'Finalizar conteo', exact: true }).click()
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
    assert.deepEqual(calls.filter(c => c.rpc === 'rpc_solog_cashier_mutate_v4').map(c => c.body.p_action), ['start', 'save_batch', 'finish'])
    console.log('PASS pre-session → start coverage → draft → save/delta → waiting → finish')
  })
  await scenario({ startAction: 'review' }, async (page, calls) => {
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Revisar', exact: true }).waitFor()
    await page.evaluate(() => { history.pushState(null, '', '/cajero/conteo'); dispatchEvent(new PopStateEvent('popstate')) })
    await page.waitForURL('**/cajero/revisar')
    await capture(page, true)
    assert.equal(await page.getByRole('button', { name: 'Registrar conteo', exact: true }).count(), 0)
    await nav(page).getByRole('button', { name: 'Inicio', exact: true }).click()
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    assert.equal(calls.at(-1).body.p_action, 'recount_save_batch')
    await nav(page).getByRole('button', { name: 'Conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Conteo', exact: true }).waitFor()
    console.log('PASS race summary coverage → start review → guard → recount/delta coverage')
  })
  await scenario({ initial: 'active', recovery: true }, async (page, calls) => {
    await page.getByRole('button', { name: 'Continuar conteo', exact: true }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.includes('Continuar conteo')).disabled)
    const recoveryActions = calls.filter(c => c.body.p_payload?.conteo_id === ids.recovery)
    assert.deepEqual(recoveryActions.map(c => c.body.p_action), ['save_batch', 'finish'])
    assert.equal(recoveryActions[0].body.p_payload.expected_groups_revision, 6)
    assert.equal(await page.getByText('Recovery', { exact: false }).count(), 0)
    await page.getByRole('button', { name: 'Continuar conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Conteo', exact: true }).waitFor()
    await capture(page)
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    assert.equal(calls.at(-1).body.p_payload.conteo_id, ids.session)
    console.log('PASS recovery A se autocierra → B conserva captura y envío')
  })
  await scenario({ initial: 'active', expiredWithDraft: true }, async (page, calls) => {
    await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
    const actions = calls.filter(c => c.rpc === 'rpc_solog_cashier_mutate_v4').map(c => c.body.p_action)
    assert.deepEqual(actions, ['save_batch', 'finish'])
    assert.equal(await page.getByText('Recovery', { exact: false }).count(), 0)
    assert.equal(await page.getByText('Sesión vencida', { exact: false }).count(), 0)
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => {
      try { const record = JSON.parse(localStorage.getItem(key)); return record?.version === 1 && record?.finished === true } catch { return false }
    })), true)
    console.log('PASS expiry + draft → autocierre transparente → save → finish')
  })
  await scenario({ round: 2 }, async page => {
    await page.getByText('Cobertura quincenal 2', { exact: true }).waitFor()
    if (process.env.SOLOG_V4_SCREENSHOT) await page.screenshot({ path: process.env.SOLOG_V4_SCREENSHOT, fullPage: true })
    console.log('PASS ronda 2 pre-session sin stock inventado')
  })
  await scenario({ initial: 'active', startAction: 'daily' }, async (page, calls) => {
    await nav(page).getByRole('button', { name: 'Historial', exact: true }).click()
    await page.getByRole('heading', { name: 'Historial', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Expandir detalle de Grupo histórico inválido' }).click()
    await page.getByText('Grupo histórico inválido', { exact: true }).waitFor()
    assert.equal(calls.at(-1).rpc, 'rpc_solog_cashier_history_v2')
    await nav(page).getByRole('button', { name: 'Conteo diario', exact: true }).click()
    await page.getByRole('heading', { name: 'Conteo diario', exact: true }).waitFor()
    await capture(page, false, true)
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    assert.equal(calls.at(-1).body.p_payload.items[0].grupo_id, ids.daily)
    console.log('PASS Historial V2 Inválido + Diario queue/capture/save V4')
  })
  await scenario({ initial: 'active', startAction: 'coverage', richCoverage: true }, async page => {
    await nav(page).getByRole('button', { name: 'Conteo', exact: true }).click()
    await page.getByRole('heading', { name: 'Conteo', exact: true }).waitFor()
    await page.getByRole('button', { name: /Stock positivo.*2 pendientes/ }).waitFor()
    await page.getByRole('button', { name: /Abarrotes.*2 pendientes/ }).click()
    const names = await page.getByRole('dialog').locator('.cajero-capture-summary__rows strong').allTextContents()
    assert.deepEqual(names, ['Grupo adicional 0', 'Grupo coverage'])
    if (process.env.SOLOG_V4_SCREENSHOT) await page.screenshot({ path: process.env.SOLOG_V4_SCREENSHOT + '.capture.png', fullPage: true })
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
    for (const label of ['Stock 0', 'Stock negativo']) {
      await page.getByRole('button', { name: new RegExp(label + '.*1 pendientes') }).click()
      await page.getByRole('button', { name: /Abarrotes.*1 pendientes/ }).click()
      assert.equal(await page.getByRole('dialog').locator('.cajero-capture-summary__rows strong').count(), 1)
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
    }
    assert.equal(await page.getByText('Grupo none', { exact: true }).count(), 0)
    console.log('PASS queues orden backend + tiles positive/zero/negative pendientes')
  })
} finally { await browser.close(); await server.close() }
