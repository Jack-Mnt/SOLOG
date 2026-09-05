// Entradas pre-sesión de Cajero con RPC simulada y red externa bloqueada.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { cashierFixture, startedFixture } from './fixtures/cashier-v4.mjs'
import { canonicalKeys, verifyReviewCapture } from './cajero-capture.browser.mjs'

const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({
  server: { host: '127.0.0.1', port: 5208, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-entry.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  },
})
await server.listen()
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SOLOG_TEST_BROWSER,
})

async function runScenario({ routeLabel, buttonLabel, pathname, expectedGroups, sendCommand, captureScenario }) {
  const context = await browser.newContext()
  const bootstrap = cashierFixture()
  const secondReview = structuredClone(bootstrap.panel_state.groups[1])
  Object.assign(secondReview, {
    grupo_id: 'group-3',
    nombre: 'Grupo revisión 2',
    detalle_reconteo_id: 'detail-second',
  })
  bootstrap.panel_state.groups.push(secondReview)
  bootstrap.panel_state.review_queue.push({
    grupo_id: 'group-3',
    detalle_id: 'detail-second',
    ultima_diferencia: 1,
    contado_at: '2026-09-03T20:30:01.000Z',
  })
  bootstrap.panel_state.kpis = {
    groups_total: 3,
    coverage_counted: 3,
    coverage_percent: 100,
    count_pending: 0,
    review_pending: 2,
  }
  if (captureScenario) {
    for (let index = 3; index <= 15; index++) {
      const group = { ...secondReview, grupo_id: 'review-' + index, nombre: 'Grupo revisión ' + index,
        detalle_reconteo_id: 'detail-' + index, unidades_por_paquete: 6, precio_paquete: 20 }
      if (index === 7) group.productos = [
        { c_interno: 20534, producto: 'Lemonade', marca: 'Marca oculta', precio: 4 },
        { c_interno: 20535, producto: 'Cherry', marca: 'Marca oculta', precio: 4 },
      ]
      bootstrap.panel_state.groups.push(group)
      bootstrap.panel_state.review_queue.push({ grupo_id: group.grupo_id, detalle_id: group.detalle_reconteo_id,
        ultima_diferencia: 1, contado_at: new Date(Date.parse(bootstrap.server_now) + index * 1000).toISOString() })
    }
    bootstrap.panel_state.kpis = { ...bootstrap.panel_state.kpis, groups_total: 16, coverage_counted: 16, review_pending: 15 }
  }
  const user = {
    id: bootstrap.identity.id,
    email: 'cashier@example.test',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: bootstrap.server_now,
  }
  const jwt = [
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
  ].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
  const calls = []
  let current = bootstrap
  const ledger = new Map()
  let lostRecount = false
  const pageErrors = []

  await context.route('**/*', async (requestRoute) => {
    const url = new URL(requestRoute.request().url())
    if (url.hostname === '127.0.0.1') return requestRoute.continue()
    if (url.hostname !== 'solog-entry.test') return requestRoute.abort()
    const fulfill = (data) => requestRoute.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(data),
    })
    if (url.pathname.includes('/auth/v1/token')) {
      return fulfill({
        access_token: jwt,
        refresh_token: 'test-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user,
      })
    }
    if (url.pathname.includes('/auth/v1/user')) return fulfill(user)
    const rpc = url.pathname.split('/').at(-1)
    const body = requestRoute.request().postDataJSON()
    calls.push({ rpc, body })
    if (rpc === 'rpc_solog_route_v2') {
      return fulfill({
        contract_version: 2,
        generated_at: bootstrap.server_now,
        identity: bootstrap.identity,
        route: '/cajero',
      })
    }
    if (rpc === 'rpc_solog_cashier_bootstrap_v2') return fulfill(current)
    assert.equal(rpc, 'rpc_solog_cashier_mutate_v2')
    const action = body.p_action
    const payload = body.p_payload
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (ledger.has(payload.operation_id)) {
      assert.deepEqual(payload, ledger.get(payload.operation_id).payload)
      return fulfill({ ...ledger.get(payload.operation_id).response, replay: true })
    }
    let state = action === 'start' ? startedFixture(bootstrap) : structuredClone(current.session_state)
    const response = {
      contract_version: 2, generated_at: bootstrap.server_now, action, replay: false,
      revisions: { ...bootstrap.revisions, operational: current.revisions.operational + 1 },
      conteo_id: state.session.id,
    }
    if (action === 'save_batch') {
      assert.equal(payload.items.length, 1)
      assert.equal(payload.items[0].grupo_id, 'group-1')
      state.count_queue = []
      state.groups[0].requiere_conteo = false
      state.kpis.count_pending = 0
      response.saved = 1
      response.items = [{ ...payload.items[0], detalle_id: 'saved-normal',
        stock_teorico: 10, diferencia: -1, estado_diferencia: 'Recontar' }]
    } else if (action === 'recount_save_batch') {
      assert.equal(payload.items.length, 1)
      const item = payload.items[0]
      assert.equal(item.detalle_id, 'detail-origin')
      state.review_queue = state.review_queue.filter((q) => q.detalle_id !== item.detalle_id)
      state.kpis.review_pending = 1
      response.saved = 1
      response.items = [{
        detalle_id: item.detalle_id, grupo_id: 'group-2', snapshot_reconteo_id: 'snapshot-1',
        stock_teorico_reconteo: 10, stock_reconteo: 10, diferencia_reconteo: 0,
        diferencia: 0, estado_diferencia: 'Coincide', valor_diferencia: 0,
        recontado_at: item.contado_at,
      }]
    } else if (action === 'finish') {
      state.session.estado = 'finalizado'
    } else assert.equal(action, 'start')
    current = {
      ...bootstrap, revisions: response.revisions,
      session_state: state,
      panel_state: state.session.estado === 'finalizado' ? bootstrap.panel_state : {
        ...state, basis: bootstrap.panel_state.basis, source: 'session', frozen: true,
      },
    }
    response.state = state
    ledger.set(payload.operation_id, { payload, response: structuredClone(response) })
    if (sendCommand === 'global' && action === 'recount_save_batch' && !lostRecount) {
      lostRecount = true
      return requestRoute.abort('failed')
    }
    return fulfill(response)
  })

  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto('http://127.0.0.1:5208/login')
    await page.getByLabel('Correo electrónico').fill(user.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
    await page.getByRole('navigation', { name: 'Panel Cajero' })
      .getByRole('button', { name: routeLabel, exact: true }).click()

    await page.getByText('No hay un conteo activo', { exact: true }).waitFor()
    assert.equal(
      await page.getByText('Proyección actual, aún no congelada.', { exact: false }).count(),
      0,
    )
    for (const group of ['Grupo conteo', 'Grupo revisión', 'Grupo revisión 2']) {
      assert.equal(await page.getByText(group, { exact: true }).count(), 0)
    }

    const startButton = page.getByRole('button', { name: buttonLabel, exact: true })
    await startButton.click()
    await startButton.waitFor({ state: 'attached' })
    assert.equal(await startButton.isDisabled(), true)
    await page.waitForURL((url) => url.pathname === pathname)
    for (const group of expectedGroups) {
      await page.getByText(group, { exact: true }).waitFor()
    }
    assert.equal(
      calls.filter((call) => call.body?.p_action === 'start').length,
      1,
    )
    assert.equal(new URL(page.url()).pathname, pathname)
    if (captureScenario) await verifyReviewCapture(page, calls)
    if (sendCommand) {
      const nav = page.getByRole('navigation', { name: 'Panel Cajero' })
      await page.getByRole('button', { name: /Abarrotes/ }).click()
      await page.getByRole('dialog').getByRole('button', { name: /Grupo conteo/ }).click()
      assert.deepEqual(await page.getByRole('dialog').locator('.cajero-calculator__keys button').allTextContents(), canonicalKeys)
      await page.getByRole('dialog').getByRole('button', { name: '9', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Continuar', exact: true }).click()
      await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
      await nav.getByRole('button', { name: 'Revisar', exact: true }).click()
      await page.getByRole('button', { name: 'Revisar Grupo revisión', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '1', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '0', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Continuar', exact: true }).click()
      await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
      assert.equal(await page.getByRole('button', { name: /Enviar conteo/ }).count(), 0)
      assert.deepEqual(calls.filter((c) => c.rpc === 'rpc_solog_cashier_mutate_v2').map((c) => c.body.p_action), ['start'])
      await nav.getByRole('button', { name: 'Inicio', exact: true }).click()
      const card = page.locator('article').filter({ hasText: 'Pendientes de envío' })
      assert.equal(await card.locator('strong').textContent(), '2')
      const globalButton = card.getByRole('button')
      assert.equal(await globalButton.locator('svg.lucide-send').count(), 1)
      const rowBox = await card.locator('.cajero-home-metric__send-row').boundingBox()
      const buttonBox = await globalButton.boundingBox()
      const counterBox = await card.locator('.cajero-home-metric__value').boundingBox()
      assert.ok(Math.abs(counterBox.x - rowBox.x) < 1, 'Contador conserva la posición vigente')
      assert.ok(counterBox.x + counterBox.width <= buttonBox.x, 'Botón junto al contador')
      assert.ok(Math.abs(buttonBox.y + buttonBox.height / 2 - counterBox.y - counterBox.height / 2) < 1, 'Botón y contador a la misma altura')
      const finishButton = page.getByRole('button', { name: 'Finalizar conteo', exact: true })
      await (sendCommand === 'global' ? globalButton : finishButton).click()
      assert.equal(await globalButton.isDisabled(), true)
      assert.equal(await finishButton.isDisabled(), true)
      if (sendCommand === 'global') {
        await page.getByRole('alert').filter({ hasText: 'No se pudo' }).first().waitFor()
        assert.equal(await card.locator('strong').textContent(), '1')
        assert.equal(await finishButton.isEnabled(), true)
        await globalButton.click()
        await page.waitForFunction(() => document.querySelector('article.cajero-home-metric--pending') === null)
        assert.deepEqual(calls.filter((c) => c.rpc === 'rpc_solog_cashier_mutate_v2').map((c) => c.body.p_action),
          ['start', 'save_batch', 'recount_save_batch', 'recount_save_batch'])
        const attempts = calls.filter((c) => c.body.p_action === 'recount_save_batch')
        assert.deepEqual(attempts[0].body, attempts[1].body)
        assert.equal(await finishButton.isEnabled(), true)
        assert.equal(await globalButton.isDisabled(), true)
      } else {
        await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
        assert.deepEqual(calls.filter((c) => c.rpc === 'rpc_solog_cashier_mutate_v2').map((c) => c.body.p_action),
          ['start', 'save_batch', 'recount_save_batch', 'finish'])
      }
      const ids = [...ledger.keys()]
      assert.equal(new Set(ids).size, sendCommand === 'global' ? 3 : 4)
    }
    assert.deepEqual(pageErrors, [])

  } finally {
    await context.close()
  }
}

try {
  await runScenario({
    routeLabel: 'Revisar', buttonLabel: 'Iniciar reconteo',
    pathname: '/cajero/revisar', expectedGroups: ['Grupo revisión', 'Grupo revisión 15'], captureScenario: true,
  })
  await runScenario({
    routeLabel: 'Conteo diario',
    buttonLabel: 'Iniciar conteo',
    pathname: '/cajero/diario',
    expectedGroups: ['Abarrotes'],
  })
  await runScenario({
    routeLabel: 'Revisar',
    buttonLabel: 'Iniciar reconteo',
    pathname: '/cajero/revisar',
    expectedGroups: ['Grupo revisión', 'Grupo revisión 2'],
  })
  for (const sendCommand of ['global', 'finish']) {
    await runScenario({
      routeLabel: 'Conteo diario', buttonLabel: 'Iniciar conteo',
      pathname: '/cajero/diario', expectedGroups: ['Abarrotes'], sendCommand,
    })
  }
  console.log('PASS Cajero: entradas, envío global, finish con ambos drafts, fallo parcial/replay y botones bloqueados')
} finally {
  await browser.close()
  await server.close()
}
