// SOLOG Cajero Full — navegador real + V6/V7 simuladas. Nunca usa Supabase remoto.
// Ejecutar: node tests/cajero-full.browser.mjs
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const module = process.env.SOLOG_PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
  : await import('@playwright/test')
const { chromium } = module.default ?? module
const userId = '12345678-1234-4123-8123-1234567890ab'
const sid = '12345678-1234-4123-8123-1234567890ac'
const snapshot = '12345678-1234-4123-8123-1234567890ad'
const category = '12345678-1234-4123-8123-1234567890ae'
const groupA = '12345678-1234-4123-8123-1234567890af'
const groupB = '12345678-1234-4123-8123-1234567890b0'
const sidB = '12345678-1234-4123-8123-1234567890c1'
const snapshotB = '12345678-1234-4123-8123-1234567890c2'
const deviceToken = 'a'.repeat(64)
const journalKey = 'solog.full2.' + userId + '.' + deviceToken
const iso = n => new Date(n).toISOString()
const serverStart = Date.parse('2026-10-26T09:15:00.000Z')

class SimulatedFull {
  constructor({ recovery = false, lostResponse = null, priorityChange = false, recount = false,
    rejectSave = false, timeOffsetMinutes = null, lostResponseNth = 1, productDetails = false, homeScenario = null } = {}) {
    this.homeScenario = homeScenario
    this.now = serverStart + (timeOffsetMinutes ?? (recovery ? 51 : 0)) * 60_000
    this.rejectSave = rejectSave
    this.expires = serverStart + 50 * 60_000
    this.lostResponse = lostResponse
    this.lostResponseNth = lostResponseNth
    this.appliedPerAction = new Map()
    this.lost = false
    this.finished = false
    this.observations = new Set()
    this.receipts = new Map()
    this.calls = []
    this.groups = [this.group(groupA, 'Grupo A'), this.group(groupB, 'Grupo B')]
    if (productDetails) {
      this.groups[0].members = Array.from({ length: 16 }, (_, i) => ({
        c_interno: 21001 + i, product: `BEBIDA SABOR ${i + 1} CON NOMBRE EXTENSO`,
        barcode: i === 0 ? '7750000000001' : null, price: 5,
      }))
      this.groups[0].member_codes = this.groups[0].members.map(p => p.c_interno)
      this.groups[0].units_per_package = 12
      this.groups[0].package_price = 44
    }
    if (priorityChange) this.groups[1].priority_class = 'shift_coverage'
    // Una ronda cubierta no puede conservar trabajo de round_coverage.
    // El backend puede, en cambio, priorizar revisión y después diario.
    if (homeScenario === 'A2' || homeScenario === 'C') {
      this.groups[0].action = 'recount'
      this.groups[0].priority_class = 'review_regular'
      this.groups[0].recount_detail_id = '12345678-1234-4123-8123-1234567890b3'
      this.groups[1].action = 'daily'
      this.groups[1].priority_class = 'shift_coverage'
    }
    if (recount) {
      this.groups[0].action = 'recount'
      this.groups[0].priority_class = 'review_regular'
      this.groups[0].recount_detail_id = '12345678-1234-4123-8123-1234567890b3'
      this.groups[1].action = 'none'
      this.groups[1].priority_class = 'none'
    }
  }
  group(id, name) {
    return {
      group_id: id, group_name: name, category_id: category,
      category_name: 'Pruebas', reference_snapshot_id: snapshot, groups_revision: 1,
      stock_theoretical: 10, member_codes: [1001],
      members: [{ c_interno: 1001, product: name, barcode: null, price: 5 }],
      price: 5, units_per_package: null, package_price: null,
      action: 'coverage', priority_class: 'round_coverage', recount_detail_id: null,
    }
  }
  session() {
    const status = this.finished ? 'finished'
      : this.now >= this.expires + 7200000 ? 'expired'
        : this.now >= this.expires ? 'recovery' : 'active'
    return {
      session_id: sid, status, session_started_at: iso(serverStart - 60_000),
      reference_snapshot_id: snapshot, reference_snapshot_captured_at: iso(serverStart - 600_000),
      reference_stock_expires_at: iso(serverStart - 600_000 + 7200000),
      capture_interval_number: 1, capture_interval_starts_at: iso(serverStart - 600_000),
      capture_interval_ends_at: iso(this.expires), session_expires_at: iso(this.expires),
      pending_delivery_until: iso(this.expires + 7200000), groups_revision: 1,
      capture_allowed: status === 'active', pending_delivery_allowed: status === 'active' || status === 'recovery',
    }
  }
  envelope(code, data, replay = false) {
    return {
      contract_version: 2, ok: true, code, server_now: iso(this.now),
      retryable: false, request_id: '12345678-1234-4123-8123-1234567890b1',
      data: replay ? { ...data, replay: true } : data,
    }
  }
  bootstrap() {
    const state = this.session()
    const noSession = this.homeScenario === 'A1' || this.homeScenario === 'A2'
    const fullyCovered = this.homeScenario === 'A2' || this.homeScenario === 'C'
    const active = !noSession && state.status === 'active', recovery = !noSession && state.status === 'recovery'
    return this.envelope('CASHIER_STATE', {
      timezone: 'America/Lima',
      stock: {
        snapshot_id: snapshot, snapshot_captured_at: iso(serverStart - 600_000),
        snapshot_confirmed_at: iso(serverStart - 570_000),
        stock_expires_at: iso(serverStart - 600_000 + 7200000),
        is_fresh: true, is_fallback: false, catalog_version: 1, groups_revision: 1,
      },
      operational_summary: {
        basis: { coverage_round: 2,
          round_starts_at: iso(this.now - 5 * 86400000),
          round_ends_at: iso(this.now + 5 * 86400000) },
        coverage_total: this.groups.length,
        coverage_counted: fullyCovered ? this.groups.length : this.groups.filter(g => g.action === 'none').length,
        coverage_pending: fullyCovered ? 0 : this.groups.filter(g => g.action !== 'none').length,
        coverage_percent: fullyCovered ? 100 : Math.round(this.groups.filter(g => g.action === 'none').length * 1000 / this.groups.length) / 10,
        review_pending: this.groups.filter(g => g.action === 'recount').length,
        daily_pending: this.groups.filter(g => g.action === 'daily').length,
        next_action: this.groups.some(g => g.action === 'coverage') ? 'coverage'
          : this.groups.some(g => g.action === 'recount') ? 'review'
            : this.groups.some(g => g.action === 'daily') ? 'daily' : 'none',
      },
      session: active ? state : null,
      recovery_sessions: recovery ? [state] : [],
      groups: active ? this.groups.map(g => ({ ...g, coverage_pending_round: !fullyCovered && g.action !== 'none' })) : [],
      confirmed_observation_ids: active ? [...this.observations] : [],
      recovery_manifests: recovery ? [{ session_id: sid, observation_ids: [...this.observations] }] : [],
      recovery_delivery_states: recovery ? [{
        session_id: sid, groups_revision: 1, current_priority_class: 'round_coverage',
        eligible_groups: this.groups.filter(g => g.action !== 'none').map(g => ({
          group_id: g.group_id, action: g.action, priority_class: g.priority_class,
          recount_detail_id: null, reference_snapshot_id: snapshot,
        })),
      }] : [],
      capabilities: {
        can_start_session: noSession, can_capture_in_current_session: active,
        block_reason: noSession ? null : 'SESSION_ALREADY_ACTIVE',
      },
    })
  }
  mutate(action, payload) {
    this.calls.push({ action, payload: structuredClone(payload) })
    const key = payload.operation_id
    assert.equal(payload.device_token, deviceToken)
    assert.match(key, /^[0-9a-f-]{36}$/i)
    const fingerprint = JSON.stringify({ action, payload })
    const prior = this.receipts.get(key)
    if (prior) {
      assert.equal(prior.fingerprint, fingerprint, 'Un replay nunca debe cambiar UUID o payload')
      return this.envelope(prior.code, prior.data, true)
    }
    const items = payload.items ?? []
    if (action === 'save_batch' && this.rejectSave) {
      return {
        contract_version: 2, ok: false, code: 'PRIORITY_CONFLICT',
        server_now: iso(this.now), request_id: '12345678-1234-4123-8123-1234567890b1',
        retryable: false, data: null, errors: [],
      }
    }
    if (action === 'save_batch' || action === 'recount_save_batch') {
      assert.equal(payload.session_id, sid)
      assert.ok(items.length > 0 && items.length <= 500)
      for (const item of items) {
        assert.ok(!this.observations.has(item.client_observation_id), 'Observación duplicada')
        this.observations.add(item.client_observation_id)
        const group = this.groups.find(g => g.group_id === item.grupo_id ||
          g.recount_detail_id === item.detalle_id)
        assert.ok(group, 'Grupo enviado fuera del scope de prueba')
        group.action = 'none'; group.priority_class = 'none'
      }
    } else if (action === 'finish') {
      assert.equal(payload.session_id, sid)
      assert.deepEqual(payload.delivery_manifest, {
        observation_ids: [...this.observations].sort(), client_queue_empty: true,
      }, 'finish debe transportar el manifiesto completo')
      this.finished = true
    } else {
      throw new Error('Acción inesperada en fixture de sesión activa: ' + action)
    }
    const result = {
      action, replay: false, session: this.session(),
      affected_groups: this.groups.filter(g => items.some(item =>
        item.grupo_id === g.group_id || item.detalle_id === g.recount_detail_id)),
      observation_results: items.map((item, i) => ({
        client_observation_id: item.client_observation_id,
        detail_id: '12345678-1234-4123-8123-' + String(i + 1).padStart(12, '0'),
        state: 'Coincide', difference: 0, replay: false,
      })),
    }
    const code = action === 'finish' ? 'SESSION_FINISHED' : 'OBSERVATIONS_CONFIRMED'
    this.receipts.set(key, { fingerprint, code, data: result })
    const index = (this.appliedPerAction.get(action) ?? 0) + 1
    this.appliedPerAction.set(action, index)
    if (!this.lost && this.lostResponse === action && index === this.lostResponseNth) {
      this.lost = true
      return null // La mutación se aplicó; se pierde exclusivamente su respuesta.
    }
    return this.envelope(code, result)
  }
}

// Dos sesiones distintas y simultáneas: A en recuperación, B capturando.
class SimulatedCoexistingFull extends SimulatedFull {
  constructor() {
    super({ recovery: true })
    this.groupsB = [{ ...this.groups[1], reference_snapshot_id: snapshotB }]
    this.observationsB = new Set()
  }
  sessionB() {
    const start = this.expires + 1000
    const expires = start + 3600000
    const reference = this.expires - 300000
    return {
      ...this.session(), session_id: sidB, status: 'active',
      session_started_at: iso(start), reference_snapshot_id: snapshotB,
      reference_snapshot_captured_at: iso(reference),
      reference_stock_expires_at: iso(reference + 7200000),
      capture_interval_number: 2, capture_interval_starts_at: iso(start),
      capture_interval_ends_at: iso(expires), session_expires_at: iso(expires),
      pending_delivery_until: iso(expires + 7200000),
      capture_allowed: true, pending_delivery_allowed: true,
    }
  }
  bootstrap() {
    const base = super.bootstrap().data
    const reference = this.expires - 300000
    return this.envelope('CASHIER_STATE', {
      ...base,
      session: this.sessionB(),
      recovery_sessions: this.finished ? [] : [this.session()],
      recovery_delivery_states: this.finished ? [] : [{
        session_id: sid, groups_revision: 1,
        current_priority_class: 'round_coverage',
        eligible_groups: [this.groups[0]].filter(g => g.action !== 'none').map(g => ({
          group_id: g.group_id, action: g.action, priority_class: g.priority_class,
          recount_detail_id: null, reference_snapshot_id: snapshot,
        })),
      }],
      recovery_manifests: this.finished ? [] :
        [{ session_id: sid, observation_ids: [...this.observations] }],
      groups: this.groupsB.map(g => ({ ...g, coverage_pending_round: g.action !== 'none' })),
      confirmed_observation_ids: [...this.observationsB],
      stock: {
        ...base.stock, snapshot_id: snapshotB,
        snapshot_captured_at: iso(reference),
        snapshot_confirmed_at: iso(reference + 30000),
        stock_expires_at: iso(reference + 7200000),
      },
      capabilities: {
        can_start_session: false, can_capture_in_current_session: true,
        block_reason: 'SESSION_ALREADY_ACTIVE',
      },
    })
  }
  mutate(action, payload) {
    if (payload.session_id !== sidB) return super.mutate(action, payload)
    this.calls.push({ action, payload: structuredClone(payload) })
    assert.equal(action, 'save_batch', 'Solo se permite registro B en esta simulación')
    assert.equal(payload.device_token, deviceToken)
    const fingerprint = JSON.stringify({ action, payload })
    const prior = this.receipts.get(payload.operation_id)
    if (prior) {
      assert.equal(prior.fingerprint, fingerprint)
      return this.envelope(prior.code, prior.data, true)
    }
    for (const item of payload.items) {
      assert.equal(item.grupo_id, groupB)
      assert.ok(!this.observationsB.has(item.client_observation_id))
      this.observationsB.add(item.client_observation_id)
    }
    this.groupsB[0].action = 'none'
    this.groupsB[0].priority_class = 'none'
    const result = {
      action, replay: false, session: this.sessionB(),
      affected_groups: this.groupsB,
      observation_results: payload.items.map((item, i) => ({
        client_observation_id: item.client_observation_id,
        detail_id: '12345678-1234-4123-8123-' + String(i + 7).padStart(12, '0'),
        state: 'Coincide', difference: 0, replay: false,
      })),
    }
    this.receipts.set(payload.operation_id, {
      code: 'OBSERVATIONS_CONFIRMED', data: result, fingerprint,
    })
    return this.envelope('OBSERVATIONS_CONFIRMED', result)
  }
}

const supabaseModule = [
  "const user = { id: '" + userId + "', email: 'cajero@browser.test' };",
  "const session = { user, access_token: 'browser-simulated' };",
  "export const supabase = {",
  "  auth: {",
  "    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),",
  "    getSession: async () => ({ data: { session }, error: null }),",
  "    signOut: async () => ({ error: null }),",
  "    signInWithPassword: async () => ({ error: null })",
  "  },",
  "  rpc: async (name, args) => {",
  "    const response = await fetch('/__solog_full_browser_rpc__', {",
  "      method: 'POST', headers: { 'Content-Type': 'application/json' },",
  "      body: JSON.stringify({ name, args })",
  "    });",
  "    return { data: await response.json(), error: null };",
  "  }",
  "};",
].join('\n')

const server = await createServer({ server: { host: '127.0.0.1', port: 5212, strictPort: true } })
await server.listen()
// Chromium administrado por Playwright por defecto; solo usar binario externo si se solicita.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER
    ? { executablePath: process.env.SOLOG_TEST_BROWSER }
    : {}),
})
const target = 'http://127.0.0.1:5212/cajero'

async function scenario(options, run) {
  const fake = options.coexisting ? new SimulatedCoexistingFull() : new SimulatedFull(options)
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } })
  const failures = [], external = []
  await context.addInitScript(token => localStorage.setItem('solog.device_token.v1', token), deviceToken)
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') {
      external.push(url.href); return route.abort()
    }
    if (url.pathname === '/src/lib/supabase.ts') {
      return route.fulfill({ contentType: 'application/javascript', body: supabaseModule })
    }
    if (url.pathname !== '/__solog_full_browser_rpc__') return route.continue()
    const { name, args } = route.request().postDataJSON()
    if (name === 'rpc_solog_cashier_bootstrap_v6') {
      fake.bootstrapAttempts = (fake.bootstrapAttempts ?? 0) + 1
      if (options.bootstrapError === 'always' ||
        (options.bootstrapError === 'untilRetry' && !fake.allowBootstrapRetry) ||
        (options.bootstrapError === 'once' && !fake.bootstrapFailureSent)) {
        fake.bootstrapFailureSent = true
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          contract_version: 2, ok: false,
          code: options.bootstrapError === 'always' ? 'DEVICE_UNAUTHORIZED' : 'FULL_TEMP_UNAVAILABLE',
          server_now: iso(fake.now), retryable: options.bootstrapError !== 'always',
          request_id: '12345678-1234-4123-8123-1234567890b1', data: null, errors: [],
        }) })
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(fake.bootstrap()) })
    }
    if (name !== 'rpc_solog_cashier_mutate_v7') {
      failures.push('RPC no permitida: ' + name)
      return route.abort()
    }
    try {
      const response = fake.mutate(args.p_action, args.p_payload)
      if (response === null) return route.abort('failed')
      // Barrera exclusiva del test multitab: mantener la primera confirmación remota
      // sin respuesta mientras la segunda pestaña pulsa Registrar conteo.
      if (fake.holdFirstBatch && args.p_action === 'save_batch' && !fake.firstBatchHeld) {
        fake.firstBatchHeld = true
        await new Promise(resolve => { fake.releaseHeldBatch = resolve })
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) })
    } catch (e) {
      failures.push(String(e))
      return route.abort()
    }
  })
  const createPage = async ({ waitForHome = true } = {}) => {
    const page = await context.newPage()
    page.setDefaultTimeout(12000)
    page.on('pageerror', e => failures.push(e.message))
    await page.goto(target)
    if (waitForHome) await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    return page
  }
  try {
    await run({ fake, context, createPage })
    assert.deepEqual(failures, [], 'Fallos JS/RPC de la simulación')
    assert.deepEqual(external, [], 'Ninguna solicitud debe llegar a servicios externos')
  } finally { await context.close() }
}

const journal = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), journalKey)
async function eventually(predicate, message, timeout = 12000) {
  const deadline = Date.now() + timeout
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(predicate(), message)
}
async function waitPending(page, count) {
  await page.waitForFunction(({ key, count }) => {
    const record = JSON.parse(localStorage.getItem(key) || '{}')
    return (record.pending || []).length === count
  }, { key: journalKey, count })
}
async function saveGroup(page, groupName) {
  const navigation = page.getByRole('navigation', { name: 'Panel Cajero' })
  await navigation.getByRole('button', { name: 'Conteo' }).click()
  await page.getByRole('button', { name: /Pruebas.*contados/ }).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: new RegExp(groupName) }).click()
  const calculator = modal.locator('.cajero-calculator__keys')
  await calculator.getByRole('button', { name: '1', exact: true }).click()
  await calculator.getByRole('button', { name: '0', exact: true }).click()
  await modal.getByRole('button', { name: 'Continuar', exact: true }).click()
  await modal.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await navigation.getByRole('button', { name: 'Inicio', exact: true }).click()
}

const failures = []
async function check(title, options, test) {
  try { await scenario(options, test); console.log('PASS Full browser: ' + title) }
  catch (e) { failures.push(title); console.error('FAIL Full browser: ' + title, e) }
}
try {
  await check('bootstrap Full: error transitorio permite reintento explícito', {
    // StrictMode puede iniciar más de un bootstrap antes de mostrar el error.
    // Persistir la avería hasta la acción humana hace determinista esta prueba.
    bootstrapError: 'untilRetry',
  }, async ({ fake, createPage }) => {
    const page = await createPage({ waitForHome: false })
    await page.getByText('No se pudo cargar Cajero').waitFor()
    assert.ok(fake.bootstrapAttempts >= 1, 'Debe existir al menos un intento V6 fallido')
    const attemptsBeforeRetry = fake.bootstrapAttempts
    assert.equal(await page.getByRole('heading', { name: 'Inicio', exact: true }).count(), 0)
    assert.equal(fake.calls.length, 0, 'El error V6 no debe producir mutaciones')
    fake.allowBootstrapRetry = true
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    assert.ok(fake.bootstrapAttempts > attemptsBeforeRetry, 'Reintentar debe emitir un nuevo bootstrap V6')
    assert.equal(fake.calls.length, 0, 'Retry de bootstrap nunca escribe una mutación')
  })
  await check('bootstrap Full: dispositivo denegado bloquea captura y ofrece salida segura', {
    bootstrapError: 'always',
  }, async ({ fake, createPage }) => {
    const page = await createPage({ waitForHome: false })
    await page.getByText('No se pudo cargar Cajero').waitFor()
    await page.getByText('Este dispositivo aún no está autorizado.').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Iniciar conteo' }).count(), 0)
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await page.getByText('No se pudo cargar Cajero').waitFor()
    assert.equal(fake.calls.length, 0, 'Dispositivo rechazado nunca puede escribir')
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByRole('dialog', { name: 'Cerrar sesión' }).waitFor()
  })
  for (const homeScenario of ['A1', 'A2', 'B', 'C']) {
    await check('Inicio: presentación A1/A2/B/C · ' + homeScenario, {
      homeScenario,
    }, async ({ createPage }) => {
      const page = await createPage()
      await page.waitForFunction(() => Boolean(document.querySelector('.cajero-coverage-card, .cajero-period-complete')))
      const flow = page.locator('.cajero-home-flow')
      const completed = page.locator('.cajero-period-complete')
      const coverage = page.locator('.cajero-coverage-card')
      const indicator = page.getByRole('button', { name: 'Estado del inventario' })
      assert.equal(await indicator.locator('svg').count(), 0, 'Indicador de stock solo muestra el punto')
      assert.equal(await indicator.locator('.cajero-stock-indicator__dot').count(), 1)
      if (homeScenario === 'B') {
        await page.getByText('grupos pendientes').waitFor()
        await page.locator('.cajero-home-metrics--stock').getByText('por contar').first().waitFor()
        await page.locator('.cajero-home-metrics--stacked').getByText('por recontar').first().waitFor()
      }
      if (homeScenario === 'A1' || homeScenario === 'A2') {
        assert.equal(await flow.count(), 1, 'Flujo operativo debe aparecer en A1 y A2')
        assert.equal(await page.getByRole('button', { name: 'Iniciar conteo' }).count(), 1)
        assert.equal(await page.getByText('Pendientes de registro').count(), 0)
        await flow.getByRole('button', { name: 'Revisar' }).click()
        await flow.getByText('Recuenta los casos que requieren una nueva verificación física.').waitFor()
      } else {
        assert.equal(await flow.count(), 0, 'Flujo operativo no se muestra durante sesión')
        assert.equal(await page.getByText('Pendientes de registro').count(), 1)
      }
      assert.equal(await completed.count(), homeScenario === 'A2' || homeScenario === 'C' ? 1 : 0)
      assert.equal(await coverage.count(), homeScenario === 'A1' || homeScenario === 'B' ? 1 : 0)
      assert.equal(await page.locator('.cajero-home-metrics--stock').count(), homeScenario === 'B' ? 1 : 0)
      if (homeScenario === 'A2' || homeScenario === 'C') {
        assert.equal(await page.locator('.cajero-home-metrics--operations .cajero-home-metric').count(), 2)
        assert.equal(await page.locator('.cajero-home-metrics--operations').getByText('Revisar').count(), 1)
        assert.equal(await page.locator('.cajero-home-metrics--operations').getByText('Conteo diario').count(), 1)
        if (homeScenario === 'A2') {
          assert.equal(await page.locator('.cajero-home-metrics--operations button').count(), 0,
            'Los KPI pre-sesión informan pero no autorizan navegar')
        } else {
          assert.equal(await page.locator('.cajero-home-metrics--operations button').count(), 1,
            'Solo Revisar puede abrirse cuando la prioridad Full es review_regular')
        }
      }
      for (const width of [390, 768, 1280]) {
        await page.setViewportSize({ width, height: 820 })
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        assert.equal(overflow, false, 'No puede existir desborde horizontal a ' + width + ' px')
      }
    })
  }
  await check('Inicio B: Stock 0/negativo sincroniza la URL y filtros de conteo', {}, async ({ createPage }) => {
    const page = await createPage()
    await page.locator('.cajero-home-metrics--stock').getByRole('button', { name: /Stock 0/ }).click()
    assert.equal(new URL(page.url()).searchParams.get('stock'), 'zero')
    await page.getByRole('button', { name: /Stock negativo/ }).click()
    assert.equal(new URL(page.url()).searchParams.get('stock'), 'negative')
    await page.getByRole('button', { name: /Stock positivo/ }).click()
    assert.equal(new URL(page.url()).searchParams.get('stock'), 'positive')
    await page.getByRole('navigation', { name: 'Panel Cajero' })
      .getByRole('button', { name: 'Inicio', exact: true }).click()
    assert.equal(new URL(page.url()).searchParams.has('stock'), false)
  })
  await check('Inicio B: borrador provisional no completa la ronda', {}, async ({ createPage }) => {
    const page = await createPage()
    await saveGroup(page, 'Grupo A')
    const card = page.locator('.cajero-coverage-card')
    await card.getByText('1 provisional').waitFor()
    assert.equal(await page.locator('.full-local-issues').count(), 0,
      'Un borrador normal no debe mostrar la tarjeta de diagnóstico')
    assert.equal(await page.locator('.cajero-period-complete').count(), 0)
    assert.equal(await page.getByText('Pendientes de registro').count(), 1)
  })
  await check('tarjeta activa Full: popup de SKU y foco sin alterar conteos ni consultar servidor', {
    productDetails: true,
  }, async ({ fake, createPage }) => {
    const page = await createPage()
    await page.getByRole('navigation', { name: 'Panel Cajero' })
      .getByRole('button', { name: 'Conteo' }).click()
    await page.getByRole('button', { name: /Pruebas.*contados/ }).click()
    const modal = page.locator('.cajero-capture-modal')
    await modal.getByRole('button', { name: /Grupo A/ }).click()
    assert.equal(await modal.locator('.cajero-capture-detail__card details').count(), 0)
    assert.equal(await modal.locator('.cajero-capture-detail__card dl > div').count(), 4)
    const buttons = modal.locator('.cajero-capture-detail__actions > button')
    assert.deepEqual(await buttons.evaluateAll(nodes => nodes.map(el => el.getAttribute('aria-label'))),
      ['Ver productos incluidos', 'Agregar observación'])
    const before = fake.calls.length
    const opener = modal.getByRole('button', { name: 'Ver productos incluidos' })
    await opener.click()
    const detail = page.getByRole('dialog', { name: 'Productos incluidos' })
    await detail.waitFor()
    assert.equal(await detail.locator('.cajero-productos-dialog__list > li').count(), 16)
    await detail.getByText(/16 productos/).waitFor()
    await detail.getByText('Unidades por paquete', { exact: true }).waitFor()
    await detail.getByText('Precio por paquete', { exact: true }).waitFor()
    await detail.getByText('Precio unitario', { exact: true }).waitFor()
    assert.match((await detail.locator('.cajero-productos-dialog__prices strong').first().textContent()) ?? '', /S\/\s*5[.,]00/)
    assert.equal(await detail.locator('.cajero-productos-dialog__list .cajero-productos-dialog__price').count(), 0)
    assert.equal(await detail.locator('.cajero-productos-dialog__list .cajero-productos-dialog__code').count(), 16)
    assert.equal(await detail.locator('.cajero-productos-dialog__list .cajero-productos-dialog__name').count(), 16)
    const close = detail.getByRole('button', { name: 'Cerrar productos incluidos' })
    assert.equal(await close.evaluate(el => document.activeElement === el), true)
    await page.keyboard.press('Tab')
    const scroll = detail.getByRole('region', { name: 'Detalle de productos incluidos' })
    assert.equal(await scroll.evaluate(el => document.activeElement === el), true)
    await page.keyboard.press('Shift+Tab')
    assert.equal(await close.evaluate(el => document.activeElement === el), true)
    await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'detached' })
    assert.equal(await opener.evaluate(el => document.activeElement === el), true)
    assert.equal(await modal.count(), 1)
    await opener.click()
    await detail.getByRole('button', { name: 'Cerrar productos incluidos' }).click()
    await detail.waitFor({ state: 'detached' })
    assert.equal(await opener.evaluate(el => document.activeElement === el), true)
    await opener.click()
    await page.locator('.cajero-productos-backdrop').click({ position: { x: 4, y: 4 } })
    await detail.waitFor({ state: 'detached' })
    assert.equal(await opener.evaluate(el => document.activeElement === el), true)
    assert.equal(fake.calls.length, before)
    assert.equal((await journal(page)).drafts[sid]?.length ?? 0, 0)

    // El espacio sobrante queda sobre la calculadora, no bajo la navegación.
    const panelBox = await modal.boundingBox()
    const navBox = await modal.locator('.cajero-capture-detail__navigation').boundingBox()
    const calculatorBox = await modal.locator('.cajero-calculator').boundingBox()
    assert.ok(panelBox && navBox && calculatorBox)
    assert.ok(panelBox.y + panelBox.height - (navBox.y + navBox.height) < 65,
      'Navegación debe permanecer junto al borde inferior de captura')
    // La barra sticky puede superponerse visualmente al contenido desplazable
    // antes de hacer scroll. Verificar orden estructural y accesibilidad real,
    // no comparar bounding boxes de un estado intermedio del scroll.
    const calculatorBeforeNav = await modal.evaluate(root => {
      const calculator = root.querySelector('.cajero-calculator')
      const navigation = root.querySelector('.cajero-capture-detail__navigation')
      return !!calculator && !!navigation &&
        Boolean(calculator.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    assert.ok(calculatorBeforeNav, 'Calculadora debe preceder a la navegación en el flujo')
    await modal.locator('.cajero-calculator__keys button').last().click({ trial: true })
    await modal.locator('.cajero-capture-detail__navigation button').last().click({ trial: true })
    await modal.getByRole('button', { name: 'Agregar observación' }).click()
    const observation = page.getByRole('dialog', { name: 'Motivo y observación' })
    await observation.waitFor()
    await page.keyboard.press('Escape')
    await observation.waitFor({ state: 'detached' })
    assert.equal(await modal.count(), 1)
  })
  await check('tarjeta Full con un SKU: detalle disponible sin desplegable', {}, async ({ createPage }) => {
    const page = await createPage()
    await page.getByRole('navigation', { name: 'Panel Cajero' })
      .getByRole('button', { name: 'Conteo' }).click()
    await page.getByRole('button', { name: /Pruebas.*contados/ }).click()
    const modal = page.locator('.cajero-capture-modal')
    await modal.getByRole('button', { name: /Grupo A/ }).click()
    await modal.getByRole('button', { name: 'Ver productos incluidos' }).click()
    const detail = page.getByRole('dialog', { name: 'Productos incluidos' })
    await detail.getByText(/1 producto/).waitFor()
    assert.equal(await detail.locator('.cajero-productos-dialog__list > li').count(), 1)
    assert.equal(await detail.getByText('Configuración de paquete del grupo').count(), 0)
    await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'detached' })
    assert.equal(await modal.count(), 1)
  })
  await check('save_batch aceptado sin respuesta: replay exacto y sin duplicar', {
    lostResponse: 'save_batch',
  }, async ({ fake, createPage }) => {
    const page = await createPage()
    await saveGroup(page, 'Grupo A')
    assert.equal((await journal(page)).drafts[sid].length, 1)
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    await waitPending(page, 1)
    assert.equal(fake.observations.size, 1)
    await page.locator('.full-local-issues > summary').click()
    await page.getByRole('button', { name: 'Reintentar operaciones' }).click()
    await waitPending(page, 0)
    const saves = fake.calls.filter(x => x.action === 'save_batch')
    assert.equal(saves.length, 2)
    assert.deepEqual(saves[0].payload, saves[1].payload)
    assert.equal((await journal(page)).drafts[sid]?.length ?? 0, 0)
    assert.equal(fake.observations.size, 1)
  })

  await check('finish aceptado sin respuesta: replay después de desaparecer del bootstrap', {
    lostResponse: 'finish',
  }, async ({ fake, createPage }) => {
    const page = await createPage()
    await page.getByRole('button', { name: 'Finalizar conteo' }).click()
    await waitPending(page, 1)
    assert.equal(fake.finished, true)
    // El finish ya aceptado se reproduce con su UUID original incluso después de +2 h.
    fake.now = fake.expires + 7200000 + 60_000
    await page.reload()
    await waitPending(page, 0)
    const finishes = fake.calls.filter(x => x.action === 'finish')
    assert.equal(finishes.length, 2)
    assert.deepEqual(finishes[0].payload, finishes[1].payload)
    assert.equal(fake.receipts.size, 1)
  })

  await check('recovery: entrega borrador capturado antes de expiración y autocierra', {
    recovery: true,
  }, async ({ fake, context, createPage }) => {
    const draft = {
      clientObservationId: '12345678-1234-4123-8123-1234567890b2',
      sessionId: sid, referenceSnapshotId: snapshot, groupsRevision: 1,
      groupId: groupA, action: 'coverage', recountDetailId: null,
      physical: 10, reason: null, note: null,
      countedAt: iso(serverStart + 40 * 60_000), expression: '10',
    }
    await context.addInitScript(({ key, uid, token, sessionId, record }) => {
      localStorage.setItem(key, JSON.stringify({
        version: 2, userId: uid, deviceToken: token, pending: [],
        confirmed: {}, panels: {}, drafts: { [sessionId]: [record] },
      }))
    }, { key: journalKey, uid: userId, token: deviceToken, sessionId: sid, record: draft })
    const page = await createPage()
    await page.waitForFunction(key => {
      const j = JSON.parse(localStorage.getItem(key) || '{}')
      return (j.pending || []).length === 0 && (j.drafts?.['12345678-1234-4123-8123-1234567890ac']?.length ?? 0) === 0
    }, journalKey)
    await eventually(() => fake.finished, 'El autocierre de recovery no se confirmó')
    assert.equal(fake.finished, true)
    assert.equal(fake.observations.size, 1)
    assert.deepEqual(fake.calls.map(c => c.action), ['save_batch', 'finish'])
  })


  await check('reconteo: registra recount_save_batch y termina con manifiesto', {
    recount: true,
  }, async ({ fake, createPage }) => {
    const page = await createPage()
    await page.getByRole('navigation', { name: 'Panel Cajero' })
      .getByRole('button', { name: 'Revisar' }).click()
    await page.getByRole('button', { name: /Grupo A/ }).click()
    const modal = page.getByRole('dialog')
    await modal.locator('.cajero-calculator__keys').getByRole('button', { name: '1', exact: true }).click()
    await modal.locator('.cajero-calculator__keys').getByRole('button', { name: '0', exact: true }).click()
    await modal.getByRole('button', { name: 'Continuar', exact: true }).click()
    await modal.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.getByRole('navigation', { name: 'Panel Cajero' })
      .getByRole('button', { name: 'Inicio', exact: true }).click()
    assert.equal((await journal(page)).drafts[sid][0].action, 'recount')
    await page.getByRole('button', { name: 'Finalizar conteo' }).click()
    await eventually(() => fake.finished, 'El reconteo no confirmó su cierre')
    const recountCalls = fake.calls.filter(x => x.action === 'recount_save_batch')
    assert.equal(recountCalls.length, 1)
    assert.equal(recountCalls[0].payload.items[0].detalle_id,
      '12345678-1234-4123-8123-1234567890b3')
    assert.deepEqual(fake.calls.map(c => c.action), ['recount_save_batch', 'finish'])
    assert.equal(fake.observations.size, 1)
  })

  await check('prioridad cambia tras primer batch y el segundo se envía por separado', {
    priorityChange: true,
  }, async ({ fake, createPage }) => {
    const page = await createPage()
    await saveGroup(page, 'Grupo A')
    await page.evaluate(({ key, groupId, sessionId }) => {
      const data = JSON.parse(localStorage.getItem(key))
      const first = data.drafts[sessionId][0]
      data.drafts[sessionId].push({
        ...first, clientObservationId: crypto.randomUUID(),
        groupId, physical: 11, expression: '11',
      })
      localStorage.setItem(key, JSON.stringify(data))
    }, { key: journalKey, groupId: groupB, sessionId: sid })
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    await eventually(() => fake.observations.size === 2, 'No se confirmó el segundo batch')
    const batches = fake.calls.filter(c => c.action === 'save_batch')
    assert.equal(batches.length, 2)
    assert.deepEqual(batches.map(c => c.payload.items.map(i => i.grupo_id)), [[groupA], [groupB]])
    assert.equal((await journal(page)).drafts[sid]?.length ?? 0, 0)
  })

  await check('rechazo definitivo: bloquea finish y no reenvía operación', {
    rejectSave: true,
  }, async ({ fake, createPage }) => {
    const page = await createPage()
    await saveGroup(page, 'Grupo A')
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).pending
      .some(item => item.status === 'rejected'), journalKey)
    const before = fake.calls.length
    await page.locator('.full-local-issues > summary').click()
    assert.equal(await page.getByRole('button', { name: 'Reintentar operaciones' }).isDisabled(), true)
    await page.getByRole('button', { name: 'Finalizar conteo' }).click()
    await page.getByText('Hay un rechazo definitivo. Requiere revisión antes de finalizar.').waitFor()
    assert.equal(fake.calls.length, before)
    assert.equal(fake.finished, false)
    assert.equal(fake.observations.size, 0)
    assert.equal((await journal(page)).pending[0].status, 'rejected')
  })

  await check('almacenamiento fallido: no inventa borrador ni envía RPC', {},
    async ({ fake, createPage }) => {
      const page = await createPage()
      await page.evaluate(() => {
        const original = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith('solog.full2.'))
            throw new DOMException('Storage de prueba bloqueado', 'QuotaExceededError')
          return original.call(this, key, value)
        }
      })
      const navigation = page.getByRole('navigation', { name: 'Panel Cajero' })
      await navigation.getByRole('button', { name: 'Conteo' }).click()
      await page.getByRole('button', { name: /Pruebas.*contados/ }).click()
      const modal = page.getByRole('dialog')
      await modal.getByRole('button', { name: /Grupo A/ }).click()
      await modal.locator('.cajero-calculator__keys').getByRole('button', { name: '1', exact: true }).click()
      await modal.locator('.cajero-calculator__keys').getByRole('button', { name: '0', exact: true }).click()
      await modal.getByRole('button', { name: 'Continuar', exact: true }).click()
      await modal.getByRole('alert').getByText('Storage de prueba bloqueado').waitFor()
      assert.equal((await journal(page)).drafts[sid]?.length ?? 0, 0)
      assert.equal(fake.calls.filter(c => c.action === 'save_batch').length, 0)
    })

  await check('límite exacto +2h: no hace nuevos envíos fuera de la ventana', {
    timeOffsetMinutes: 170,
  }, async ({ fake, context, createPage }) => {
    const draft = {
      clientObservationId: '12345678-1234-4123-8123-1234567890b2',
      sessionId: sid, referenceSnapshotId: snapshot, groupsRevision: 1,
      groupId: groupA, action: 'coverage', recountDetailId: null,
      physical: 10, reason: null, note: null,
      countedAt: iso(serverStart + 40 * 60_000), expression: '10',
    }
    await context.addInitScript(({ key, uid, token, sessionId, record }) => {
      localStorage.setItem(key, JSON.stringify({
        version: 2, userId: uid, deviceToken: token, pending: [],
        confirmed: {}, panels: {}, drafts: { [sessionId]: [record] },
      }))
    }, { key: journalKey, uid: userId, token: deviceToken, sessionId: sid, record: draft })
    const page = await createPage()
    await page.waitForTimeout(800)
    assert.equal(fake.session().status, 'expired')
    assert.equal(fake.calls.length, 0)
    assert.equal(fake.finished, false)
    assert.equal((await journal(page)).drafts[sid]?.length, 1)
  })


  await check('segundo lote confirmado con respuesta perdida: replay exclusivo del segundo UUID', {
    priorityChange: true, lostResponse: 'save_batch', lostResponseNth: 2,
  }, async ({ fake, createPage }) => {
    const page = await createPage()
    await saveGroup(page, 'Grupo A')
    await page.evaluate(({ key, groupId, sessionId }) => {
      const data = JSON.parse(localStorage.getItem(key))
      const first = data.drafts[sessionId][0]
      data.drafts[sessionId].push({
        ...first, clientObservationId: crypto.randomUUID(),
        groupId, physical: 11, expression: '11',
      })
      localStorage.setItem(key, JSON.stringify(data))
    }, { key: journalKey, groupId: groupB, sessionId: sid })
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    // Un pending = 1 también ocurre transitoriamente ANTES de enviar el primer batch.
    // Esperar el segundo receipt remoto aplicado, seguido de su outbox local preparado.
    await eventually(() => fake.observations.size === 2,
      'El segundo lote no se aplicó en backend simulado')
    await page.waitForFunction(({ key, sessionId, secondGroup }) => {
      const record = JSON.parse(localStorage.getItem(key) || '{}')
      const pending = record.pending ?? []
      return pending.length === 1 && pending[0].action === 'save_batch' &&
        JSON.parse(pending[0].exactPayload).items?.[0]?.grupo_id === secondGroup &&
        (record.confirmed?.[sessionId]?.length ?? 0) === 1 &&
        (record.drafts?.[sessionId]?.length ?? 0) === 1
    }, { key: journalKey, sessionId: sid, secondGroup: groupB })
    const persisted = await journal(page)
    assert.equal(persisted.drafts[sid]?.length, 1, 'Solo segundo borrador incierto')
    assert.equal(persisted.confirmed[sid].length, 1, 'Primer lote confirmado localmente')
    assert.equal(fake.observations.size, 2, 'El segundo lote fue aplicado en backend simulado')
    await page.locator('.full-local-issues > summary').click()
    await page.getByRole('button', { name: 'Reintentar operaciones' }).click()
    await waitPending(page, 0)
    const calls = fake.calls.filter(c => c.action === 'save_batch')
    assert.equal(calls.length, 3)
    assert.deepEqual(calls.map(c => c.payload.items.map(i => i.grupo_id)),
      [[groupA], [groupB], [groupB]])
    assert.deepEqual(calls[1].payload, calls[2].payload)
    assert.notEqual(calls[0].payload.operation_id, calls[1].payload.operation_id)
    assert.equal((await journal(page)).drafts[sid]?.length ?? 0, 0)
    assert.equal(fake.observations.size, 2)
  })

  await check('recovery A y sesión B activa: scopes y manifiestos independientes', {
    coexisting: true,
  }, async ({ fake, context, createPage }) => {
    const draftA = {
      clientObservationId: '12345678-1234-4123-8123-1234567890b2',
      sessionId: sid, referenceSnapshotId: snapshot, groupsRevision: 1,
      groupId: groupA, action: 'coverage', recountDetailId: null,
      physical: 10, reason: null, note: null,
      countedAt: iso(serverStart + 40 * 60_000), expression: '10',
    }
    await context.addInitScript(({ key, uid, token, sessionId, record }) => {
      localStorage.setItem(key, JSON.stringify({
        version: 2, userId: uid, deviceToken: token, pending: [],
        confirmed: {}, panels: {}, drafts: { [sessionId]: [record] },
      }))
    }, { key: journalKey, uid: userId, token: deviceToken, sessionId: sid, record: draftA })
    const page = await createPage()
    await eventually(() => fake.finished, 'Recovery A no logró cerrar')
    assert.equal(fake.observations.size, 1)
    assert.equal(fake.observationsB.size, 0)
    assert.deepEqual(fake.calls.slice(0, 2).map(c => [c.action, c.payload.session_id]), [
      ['save_batch', sid], ['finish', sid],
    ])
    await saveGroup(page, 'Grupo B')
    const outbox = await journal(page)
    assert.equal(outbox.drafts[sidB]?.length, 1)
    assert.equal(outbox.drafts[sid]?.length ?? 0, 0)
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    await eventually(() => fake.observationsB.size === 1, 'El conteo B no se confirmó')
    assert.equal(fake.calls.at(-1).action, 'save_batch')
    assert.equal(fake.calls.at(-1).payload.session_id, sidB)
    assert.equal(fake.receipts.size, 3, 'Dos operaciones A y una B, con scopes independientes')
    assert.equal(fake.observations.size, 1)
    assert.equal(fake.observationsB.size, 1)
  })


  await check('frontera exacta de expiración: prohíbe nuevas capturas y entrega solo el borrador previo', {
    timeOffsetMinutes: 50,
  }, async ({ fake, context, createPage }) => {
    const capturedAt = iso(serverStart + 40 * 60_000)
    const draft = {
      clientObservationId: '12345678-1234-4123-8123-1234567890b2',
      sessionId: sid, referenceSnapshotId: snapshot, groupsRevision: 1,
      groupId: groupA, action: 'coverage', recountDetailId: null,
      physical: 10, reason: null, note: null, countedAt: capturedAt, expression: '10',
    }
    assert.equal(fake.now, fake.expires, 'La fixture inicia en el milisegundo de expiración')
    assert.equal(fake.session().capture_allowed, false)
    await context.addInitScript(({ key, uid, token, sessionId, record }) => {
      localStorage.setItem(key, JSON.stringify({
        version: 2, userId: uid, deviceToken: token, pending: [],
        confirmed: {}, panels: {}, drafts: { [sessionId]: [record] },
      }))
    }, { key: journalKey, uid: userId, token: deviceToken, sessionId: sid, record: draft })
    const page = await createPage()
    await eventually(() => fake.finished, 'No hubo autocierre en el límite exacto')
    assert.equal(fake.observations.size, 1)
    assert.deepEqual(fake.calls.map(c => c.action), ['save_batch', 'finish'])
    const saved = fake.calls[0].payload.items[0]
    assert.equal(saved.contado_at, capturedAt, 'No debe reemplazar la marca temporal previa')
    assert.equal(saved.client_observation_id, draft.clientObservationId)
    assert.equal(fake.calls[0].payload.session_id, sid)
    assert.equal((await journal(page)).drafts[sid]?.length ?? 0, 0)
    assert.equal(await page.getByRole('button', { name: 'Iniciar conteo' }).count(), 1)
  })

  await check('aislamiento local: outboxes de otro usuario y dispositivo permanecen intactos', {},
    async ({ fake, context, createPage }) => {
      const foreignUser = '12345678-1234-4123-8123-1234567890d1'
      const foreignToken = 'b'.repeat(64)
      const userKey = 'solog.full2.' + foreignUser + '.' + deviceToken
      const deviceKey = 'solog.full2.' + userId + '.' + foreignToken
      const foreignDraft = {
        clientObservationId: '12345678-1234-4123-8123-1234567890d2',
        sessionId: sid, referenceSnapshotId: snapshot, groupsRevision: 1,
        groupId: groupA, action: 'coverage', recountDetailId: null,
        physical: 10, reason: null, note: null,
        countedAt: iso(serverStart + 30 * 60_000), expression: '10',
      }
      const record = (uid, token) => JSON.stringify({
        version: 2, userId: uid, deviceToken: token, pending: [],
        confirmed: {}, panels: {}, drafts: { [sid]: [foreignDraft] },
      })
      const originalUser = record(foreignUser, deviceToken)
      const originalDevice = record(userId, foreignToken)
      await context.addInitScript(({ keyUser, keyDevice, valueUser, valueDevice }) => {
        localStorage.setItem(keyUser, valueUser)
        localStorage.setItem(keyDevice, valueDevice)
      }, { keyUser: userKey, keyDevice: deviceKey,
        valueUser: originalUser, valueDevice: originalDevice })
      const page = await createPage()
      assert.equal(fake.calls.length, 0, 'No se deben reintentar outboxes ajenos')
      await saveGroup(page, 'Grupo B')
      await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
      await eventually(() => fake.observations.size === 1, 'No se confirmó el trabajo del usuario actual')
      assert.equal(fake.calls.filter(c => c.action === 'save_batch').length, 1)
      const values = await page.evaluate(({ keyUser, keyDevice }) => ({
        user: localStorage.getItem(keyUser), device: localStorage.getItem(keyDevice),
      }), { keyUser: userKey, keyDevice: deviceKey })
      assert.equal(values.user, originalUser, 'Outbox ajeno por usuario modificado')
      assert.equal(values.device, originalDevice, 'Outbox ajeno por dispositivo modificado')
      assert.equal(fake.calls[0].payload.device_token, deviceToken)
      assert.equal(fake.calls[0].payload.items[0].grupo_id, groupB)
    })

  await check('dos pestañas con Registrar simultáneo: un único batch bajo navigator.locks', {},
    async ({ fake, createPage }) => {
      const a = await createPage(), b = await createPage()
      await saveGroup(a, 'Grupo A')
      await saveGroup(b, 'Grupo B')
      assert.equal((await journal(a)).drafts[sid].length, 2)
      // El primer batch queda aplicado en el backend simulado, pero sin respuesta.
      // La segunda pestaña pulsa mientras la primera aún posee el lock.
      fake.holdFirstBatch = true
      const firstClick = a.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
      try {
        await eventually(() => typeof fake.releaseHeldBatch === 'function',
          'La primera pestaña no llegó al backend simulado')
        await b.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
      } finally {
        fake.releaseHeldBatch?.()
      }
      await firstClick
      await eventually(() => fake.observations.size === 2, 'No se confirmaron ambos grupos')
      await a.waitForFunction(key => {
        const j = JSON.parse(localStorage.getItem(key))
        return (j.pending ?? []).length === 0 && (j.drafts?.['12345678-1234-4123-8123-1234567890ac']?.length ?? 0) === 0
      }, journalKey)
      await b.waitForFunction(key => {
        const j = JSON.parse(localStorage.getItem(key))
        return (j.pending ?? []).length === 0 && (j.drafts?.['12345678-1234-4123-8123-1234567890ac']?.length ?? 0) === 0
      }, journalKey)
      assert.equal(fake.calls.filter(c => c.action === 'save_batch').length, 1,
        'Dos pestañas no deben generar batches duplicados')
      assert.deepEqual(fake.calls[0].payload.items.map(item => item.grupo_id).sort(),
        [groupA, groupB].sort())
    })

  await check('dos pestañas: borradores de grupos distintos y un único batch', {},
    async ({ fake, createPage }) => {
      const a = await createPage(), b = await createPage()
      await saveGroup(a, 'Grupo A')
      await saveGroup(b, 'Grupo B')
      await a.waitForFunction(key => {
        const j = JSON.parse(localStorage.getItem(key) || '{}')
        return (j.drafts?.['12345678-1234-4123-8123-1234567890ac']?.length ?? 0) === 2
      }, journalKey)
      await a.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
      await a.waitForFunction(key => {
        const j = JSON.parse(localStorage.getItem(key) || '{}')
        return (j.drafts?.['12345678-1234-4123-8123-1234567890ac']?.length ?? 0) === 0
      }, journalKey)
      assert.equal(fake.observations.size, 2)
      assert.equal(fake.calls.filter(c => c.action === 'save_batch').length, 1)
    })
} finally {
  await browser.close()
  await server.close()
}
if (failures.length) {
  console.error('FAIL: ' + failures.length + ' escenarios Full browser: ' + failures.join(', '))
  process.exitCode = 1
} else {
  console.log('PASS: escenarios Full browser simulados; 0 solicitudes externas.')
}
