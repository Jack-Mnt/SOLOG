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
const deviceToken = 'a'.repeat(64)
const journalKey = 'solog.full2.' + userId + '.' + deviceToken
const iso = n => new Date(n).toISOString()
const serverStart = Date.parse('2026-10-26T09:15:00.000Z')

class SimulatedFull {
  constructor({ recovery = false, lostResponse = null, priorityChange = false, recount = false,
    rejectSave = false, timeOffsetMinutes = null } = {}) {
    this.now = serverStart + (timeOffsetMinutes ?? (recovery ? 51 : 0)) * 60_000
    this.rejectSave = rejectSave
    this.expires = serverStart + 50 * 60_000
    this.lostResponse = lostResponse
    this.lost = false
    this.finished = false
    this.observations = new Set()
    this.receipts = new Map()
    this.calls = []
    this.groups = [this.group(groupA, 'Grupo A'), this.group(groupB, 'Grupo B')]
    if (priorityChange) this.groups[1].priority_class = 'shift_coverage'
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
    const active = state.status === 'active', recovery = state.status === 'recovery'
    return this.envelope('CASHIER_STATE', {
      timezone: 'America/Lima',
      stock: {
        snapshot_id: snapshot, snapshot_captured_at: iso(serverStart - 600_000),
        snapshot_confirmed_at: iso(serverStart - 570_000),
        stock_expires_at: iso(serverStart - 600_000 + 7200000),
        is_fresh: true, is_fallback: false, catalog_version: 1, groups_revision: 1,
      },
      session: active ? state : null,
      recovery_sessions: recovery ? [state] : [],
      groups: active ? this.groups : [],
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
        can_start_session: false, can_capture_in_current_session: active,
        block_reason: 'SESSION_ALREADY_ACTIVE',
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
    if (!this.lost && this.lostResponse === action) {
      this.lost = true
      return null // La mutación se aplicó; se pierde exclusivamente su respuesta.
    }
    return this.envelope(code, result)
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
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER
    ? { executablePath: process.env.SOLOG_TEST_BROWSER }
    : { channel: 'chrome' }),
})
const target = 'http://127.0.0.1:5212/cajero'

async function scenario(options, run) {
  const fake = new SimulatedFull(options)
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
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(fake.bootstrap()) })
    }
    if (name !== 'rpc_solog_cashier_mutate_v7') {
      failures.push('RPC no permitida: ' + name)
      return route.abort()
    }
    try {
      const response = fake.mutate(args.p_action, args.p_payload)
      if (response === null) return route.abort('failed')
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) })
    } catch (e) {
      failures.push(String(e))
      return route.abort()
    }
  })
  const createPage = async () => {
    const page = await context.newPage()
    page.setDefaultTimeout(12000)
    page.on('pageerror', e => failures.push(e.message))
    await page.goto(target)
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
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
  await page.getByRole('button', { name: /Pruebas.*grupos disponibles/ }).click()
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
  await check('save_batch aceptado sin respuesta: replay exacto y sin duplicar', {
    lostResponse: 'save_batch',
  }, async ({ fake, createPage }) => {
    const page = await createPage()
    await saveGroup(page, 'Grupo A')
    assert.equal((await journal(page)).drafts[sid].length, 1)
    await page.getByRole('button', { name: 'Registrar conteo', exact: true }).click()
    await waitPending(page, 1)
    assert.equal(fake.observations.size, 1)
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
      await page.getByRole('button', { name: /Pruebas.*grupos disponibles/ }).click()
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
  console.log('PASS: 9 escenarios Full browser simulados; 0 solicitudes externas.')
}
