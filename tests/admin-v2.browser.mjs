// Dashboard + Control browser simulation against current Admin contracts.
// Every non-local request is intercepted; production traffic is blocked.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { adminNow, responseFixture } from './fixtures/admin-v2.mjs'

const require = createRequire(import.meta.url)
const { unzipSync, strFromU8 } = createRequire(require.resolve('write-excel-file/package.json'))('fflate')

export async function runAdminV2Browser() {
  const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
  const server = await createServer({
    server: { host: '127.0.0.1', port: 5208, strictPort: true },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-admin-v2.test'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
    },
  })
  await server.listen()

  const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Tokyo' })
  const user = {
    id: 'admin-test',
    email: 'admin@example.test',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: { rol: 'cajero' },
    aud: 'authenticated',
    created_at: adminNow,
  }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp }]
    .map(payload => Buffer.from(JSON.stringify(payload)).toString('base64url')).join('.') + '.test'
  await context.addInitScript(({ user, jwt, exp }) => {
    localStorage.setItem('sb-solog-admin-v2-auth-token', JSON.stringify({
      access_token: jwt,
      refresh_token: 'test',
      expires_at: exp,
      expires_in: 3600,
      token_type: 'bearer',
      user,
    }))
  }, { user, jwt, exp })

  const calls = []
  const errors = []
  let bytes = 0
  const count = action => calls.filter(call => call.action === action).length

  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'solog-admin-v2.test') {
      errors.push('Unexpected external ' + url.hostname)
      return route.abort()
    }

    const fulfill = (data, status = 200) => {
      const body = JSON.stringify(data)
      bytes += Buffer.byteLength(body)
      return route.fulfill({ status, contentType: 'application/json', body })
    }

    if (url.pathname === '/auth/v1/user') return fulfill(user)
    if (url.pathname === '/auth/v1/logout') return fulfill({})

    const rpc = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    assert.ok(
      ['rpc_solog_admin_bootstrap_v2', 'rpc_solog_operational_v2', 'rpc_solog_control_export_v2'].includes(rpc),
      'Unexpected Admin RPC: ' + rpc,
    )

    const action = rpc === 'rpc_solog_admin_bootstrap_v2'
      ? 'bootstrap'
      : rpc === 'rpc_solog_control_export_v2'
        ? 'export'
        : body.p_action
    const payload = body.p_payload
    calls.push({ rpc, action, payload })

    assert.ok(
      !['daily_detail', 'control_chronology', 'control_page', 'control_detail'].includes(action),
      'Legacy operational action called: ' + action,
    )

    if (action === 'bootstrap' || action === 'dashboard_cards') assert.deepEqual(payload, {})
    if (action === 'shift_grid') assert.deepEqual(Object.keys(payload).sort(), ['period', 'site_id'])
    if (action === 'daily_detail_bootstrap') {
      assert.deepEqual(Object.keys(payload).sort(), ['origin_date', 'site_id', 'stock_class'])
    }
    if (action === 'daily_detail_page') {
      assert.deepEqual(Object.keys(payload).sort(), ['origin_date', 'page', 'site_id', 'state', 'stock_class'])
    }
    if (action === 'control_groups') {
      assert.deepEqual(
        Object.keys(payload).sort(),
        payload.period === 'custom'
          ? ['date_from', 'date_to', 'period', 'site_id']
          : ['period', 'site_id'],
      )
    }
    if (action === 'control_chronology_view') {
      assert.deepEqual(Object.keys(payload).sort(), ['group_id', 'period', 'site_id'])
    }
    if (action === 'export') assert.deepEqual(Object.keys(payload).sort(), ['period', 'site_id'])

    const response = responseFixture(action, payload)
    return fulfill(response)
  })

  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))

  try {
    const controlOnly = process.env.SOLOG_CONTROL_UI_ONLY === '1'
    await page.goto('http://127.0.0.1:5208/admin' + (controlOnly ? '/control' : ''))

    if (!controlOnly) {
      await page.getByRole('heading', { name: 'Sede A', exact: true }).waitFor()
      assert.equal(count('bootstrap'), 1)
      assert.equal(count('dashboard_cards'), 1)

      await page.getByRole('button', { name: 'Ver turnos de Sede A' }).click()
      await page.getByRole('button', { name: 'Abrir día 2026-09-03' }).waitFor()
      assert.equal(count('shift_grid'), 1)
      assert.equal(count('daily_detail_bootstrap'), 0)

      await page.getByRole('button', { name: 'Abrir día 2026-09-03' }).click()
      const dailyDrawer = page.getByRole('dialog')
      await dailyDrawer.getByRole('heading', { name: 'Detalle diario · Sede A' }).waitFor()
      await dailyDrawer.getByRole('tab', { name: /Coincide/ }).waitFor()
      await dailyDrawer.getByText('Grupo coincide 0', { exact: true }).waitFor()
      assert.equal(count('daily_detail_bootstrap'), 1)
      assert.deepEqual(calls.find(call => call.action === 'daily_detail_bootstrap').payload, {
        site_id: 'site-a',
        origin_date: '2026-09-03',
        stock_class: 'positive',
      })

      await dailyDrawer.getByRole('button', { name: 'Siguiente', exact: true }).click()
      await dailyDrawer.getByText('Grupo página', { exact: true }).waitFor()
      assert.equal(count('daily_detail_page'), 1)
      assert.deepEqual(calls.find(call => call.action === 'daily_detail_page').payload, {
        site_id: 'site-a',
        origin_date: '2026-09-03',
        stock_class: 'positive',
        state: 'Coincide',
        page: 1,
      })

      await dailyDrawer.getByRole('tab', { name: /Confirmados/ }).click()
      await dailyDrawer.getByText('Grupo confirmado 0', { exact: true }).waitFor()
      await dailyDrawer.getByRole('button', { name: 'Cerrar', exact: true }).click()

      await page.getByRole('button', { name: 'Abrir día 2026-09-03' }).click()
      await page.getByRole('dialog').getByText('Grupo coincide 0', { exact: true }).waitFor()
      assert.equal(count('daily_detail_bootstrap'), 1, 'Daily bootstrap stays cached by scope')
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()

      const siteA = page.getByRole('article', { name: 'Sede Sede A' })
      await siteA.getByRole('button', { name: 'Descargar ajuste', exact: true }).click()
      await page.getByRole('dialog').getByLabel('Período de exportación').waitFor()
      assert.equal(count('export'), 0)
      await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    }

    await page.getByRole('button', { name: 'Control', exact: true }).click()
    const control = page.locator('.admin-control')
    await control.getByText('Grupo 49', { exact: true }).waitFor()
    assert.equal(count('control_groups'), 1)
    assert.equal(await control.locator('tbody tr').count(), 50)

    const groupCalls = count('control_groups')
    await control.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await control.getByText('Grupo 99', { exact: true }).waitFor()
    assert.equal(await control.locator('tbody tr').count(), 50)
    assert.equal(count('control_groups'), groupCalls, 'Local pagination does not reload Control')

    await control.locator('.admin-quick-filter-chip').filter({ hasText: 'Recontar' }).click()
    assert.equal(await control.locator('tbody tr').count(), 25)
    assert.ok((await control.locator('.admin-control__badge').allTextContents()).every(text => text === 'Por recontar'))
    assert.equal(count('control_groups'), groupCalls, 'Local state filter does not reload Control')

    await control.locator('.admin-quick-filter-chip').first().click()
    await control.getByText('Grupo 0', { exact: true }).waitFor()
    await control.getByRole('button', { name: 'Ver cronología de Grupo 0', exact: true }).click()

    const chronologyDrawer = page.getByRole('dialog')
    await chronologyDrawer.getByRole('heading', { name: 'Cronología por producto · Sede A' }).waitFor()
    await chronologyDrawer.getByText('Grupo 0', { exact: true }).waitFor()
    const events = chronologyDrawer.locator('.admin-control-chronology__event')
    assert.equal(await events.count(), 4)
    assert.deepEqual(
      await events.locator('.admin-status-badge').allTextContents(),
      ['Inconsistente', 'Confirmado', 'Recontado', 'Coincide'],
    )
    assert.equal(count('control_chronology_view'), 1)
    assert.deepEqual(calls.find(call => call.action === 'control_chronology_view').payload, {
      site_id: 'site-a',
      group_id: 'group-0',
      period: 'current_biweekly',
    })

    const previousSwitch = chronologyDrawer.getByRole('switch', { name: 'Incluir quincena anterior' })
    assert.equal(await previousSwitch.getAttribute('aria-checked'), 'false')
    await previousSwitch.click()
    await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Incluir quincena anterior"]')?.getAttribute('aria-checked') === 'true')
    assert.equal(count('control_chronology_view'), 2)
    assert.equal(calls.filter(call => call.action === 'control_chronology_view').at(-1).payload.period, 'previous_biweekly')

    await previousSwitch.click()
    await previousSwitch.click()
    assert.equal(count('control_chronology_view'), 2, 'Previous biweekly chronology stays cached')
    await chronologyDrawer.getByRole('button', { name: 'Cerrar', exact: true }).click()

    await control.getByRole('button', { name: 'Ver cronología de Grupo 0', exact: true }).click()
    await page.getByRole('dialog').getByText('Grupo 0', { exact: true }).waitFor()
    assert.equal(count('control_chronology_view'), 2, 'Current chronology stays cached after closing drawer')
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()

    await control.getByRole('button', { name: 'Descargar ajuste', exact: true }).click()
    const exportDialog = page.getByRole('dialog')
    await exportDialog.getByLabel('Período de exportación').selectOption('current_biweekly')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportDialog.getByRole('button', { name: 'Descargar Excel', exact: true }).click(),
    ])
    const stream = await download.createReadStream()
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const zip = unzipSync(Buffer.concat(chunks))
    const workbook = strFromU8(zip['xl/workbook.xml'])
    for (const name of ['Resumen', 'Ajustes', 'Por recontar', 'Inconsistentes', 'Todas']) {
      assert.ok(workbook.includes(name))
    }
    assert.match(download.suggestedFilename(), /SOLOG_Ajustes_Sede_A_/)
    assert.equal(count('export'), 1)

    assert.equal(
      calls.some(call => ['daily_detail', 'control_chronology', 'control_page', 'control_detail'].includes(call.action)),
      false,
    )
    assert.deepEqual(errors, [])

    console.log(JSON.stringify({
      status: controlOnly ? 'PASS Control browser actual' : 'PASS Dashboard + Control browser actual',
      rpcCalls: calls.length,
      responseBytes: bytes,
      productionCalls: 0,
      actions: Object.fromEntries(
        ['bootstrap', 'dashboard_cards', 'shift_grid', 'daily_detail_bootstrap', 'daily_detail_page', 'control_groups', 'control_chronology_view', 'export']
          .map(action => [action, count(action)]),
      ),
    }, null, 2))
  } finally {
    await browser.close()
    await server.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runAdminV2Browser()
