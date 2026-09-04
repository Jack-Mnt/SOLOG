// Escenarios D1–D3 con API/Auth simuladas. Todas las URLs externas reales están bloqueadas.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { summaryFixture, historyFixture, detailFixture, exportFixture, detailsNow } from './fixtures/details-v2.mjs'
const require = createRequire(import.meta.url)
const { unzipSync, strFromU8 } = createRequire(require.resolve('write-excel-file/package.json'))('fflate')
async function readWorkbook(download, page) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const zip = unzipSync(Buffer.concat(chunks))
  const files = Object.fromEntries(Object.entries(zip).map(([path, data]) => [path, strFromU8(data)]))
  return page.evaluate((files) => {
    const parse = (text) => new DOMParser().parseFromString(text, 'application/xml')
    const strings = files['xl/sharedStrings.xml'] ? [...parse(files['xl/sharedStrings.xml']).querySelectorAll('si')].map((node) => node.textContent) : []
    const sheet = (path) => Object.fromEntries([...parse(files[path]).querySelectorAll('c')].map((cell) => [
      cell.getAttribute('r'), cell.getAttribute('t') === 's' ? strings[Number(cell.querySelector('v').textContent)] : cell.querySelector('v, t')?.textContent ?? '',
    ]))
    return { names: [...parse(files['xl/workbook.xml']).querySelectorAll('sheet')].map((node) => node.getAttribute('name')), summary: sheet('xl/worksheets/sheet1.xml'), differences: sheet('xl/worksheets/sheet2.xml'), styles: files['xl/styles.xml'] }
  }, files)
}

export async function runDetailsV2Browser() {
  const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
  const server = await createServer({ server: { host: '127.0.0.1', port: 5207, strictPort: true }, define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-details-v2.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  } })
  await server.listen()
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const user = { id: 'user-test', email: 'details@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: detailsNow }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp }].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
  await context.addInitScript(({ user, jwt, exp }) => {
    localStorage.setItem('sb-solog-details-v2-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test', expires_at: exp, expires_in: 3600, token_type: 'bearer', user }))
  }, { user, jwt, exp })
  const calls = [], errors = []
  let revision = 10, cursorRejected = false, lost = false, emptyExport = false
  const count = (action) => calls.filter((c) => c.p_action === action).length
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'solog-details-v2.test') { errors.push('external:' + url.hostname); return route.abort() }
    const fulfill = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (url.pathname === '/auth/v1/user') return fulfill(user)
    if (url.pathname === '/auth/v1/logout') return fulfill({})
    const rpc = url.pathname.split('/').at(-1)
    assert.equal(rpc, 'rpc_solog_details_v2', 'Entrada directa no usa bootstrap Cajero, state ni Control')
    const body = route.request().postDataJSON()
    calls.push(body)
    const { p_action: action, p_payload: payload } = body
    if (action === 'summary') { assert.deepEqual(Object.keys(payload), ['device_token']); const r = summaryFixture(); r.revisions.operational = revision; return fulfill(r) }
    if (action === 'history') {
      assert.equal(payload.page_size, 100)
      assert.ok(['today', 'yesterday'].includes(payload.period))
      assert.equal('device_token' in payload || 'site_id' in payload, false)
      if (payload.period === 'yesterday' && payload.cursor && !cursorRejected) {
        cursorRejected = true; revision++
        return fulfill({ code: 'P0001', message: 'SOLOG_PAGE_CURSOR_INVALID' }, 400)
      }
      return fulfill(historyFixture(payload.period, payload.cursor ? 1 : 100, payload.cursor ? 100 : cursorRejected && payload.period === 'yesterday' ? 200 : 0, revision))
    }
    if (action === 'detail') {
      assert.deepEqual(Object.keys(payload), ['case_id'])
      const r = detailFixture(Number(payload.case_id.split('-').at(-1))); r.revisions.operational = revision
      return fulfill(r)
    }
    if (action === 'request_access') {
      assert.deepEqual(Object.keys(payload).sort(), ['device_token', 'operation_id'])
      if (!lost) { lost = true; return route.abort('failed') }
      return fulfill({ contract_version: 2, generated_at: detailsNow, replay: true, status: 'pending', device_id: 'device-test', revisions: { devices: 3 } })
    }
    if (action === 'export') {
      assert.deepEqual(Object.keys(payload), ['period'])
      const r = exportFixture(payload.period); r.revisions.operational = revision
      if (emptyExport) { r.rows = []; for (const key of Object.keys(r.summary)) r.summary[key] = 0 }
      return fulfill(r)
    }
    throw new Error('Unexpected action: ' + action)
  })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    await page.goto('http://127.0.0.1:5207/detalles')
    await page.getByRole('heading', { name: 'Sin solicitud', exact: true }).waitFor()
    await page.getByText('15 / 20', { exact: true }).waitFor()
    assert.equal(count('summary'), 1)
    assert.equal(calls.length, 1)
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name))
    assert.equal(resources.some((url) => url.includes('detalles.export.ts') || url.includes('write-excel-file') || url.includes('cajero.app.tsx')), false)
    await page.getByRole('button', { name: 'Ver historial' }).click()
    await page.getByText('Grupo 0', { exact: true }).waitFor()
    assert.equal(count('history'), 1); assert.equal(count('detail'), 0)
    await page.getByRole('button', { name: 'Expandir detalle de Grupo 0', exact: true }).click()
    await page.getByText('Stock posterior', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Contraer detalle de Grupo 0', exact: true }).click()
    await page.getByRole('button', { name: 'Expandir detalle de Grupo 0', exact: true }).click()
    await page.getByText('Stock posterior', { exact: true }).waitFor()
    assert.equal(count('detail'), 1)
    await page.getByRole('button', { name: 'Cargar más (hasta 100)' }).click()
    await page.getByText('Grupo 100', { exact: true }).waitFor()
    assert.equal(count('history'), 2)
    await page.getByRole('button', { name: 'Cerrar historial' }).click()
    await page.getByRole('button', { name: 'Ver historial' }).click()
    await page.getByText('Grupo 100', { exact: true }).waitFor()
    assert.equal(count('history'), 2)
    await page.getByRole('button', { name: 'Ayer', exact: true }).click()
    await page.getByText('Grupo 0', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Cargar más (hasta 100)' }).click()
    await page.getByText('Grupo 200', { exact: true }).waitFor()
    assert.equal(count('history'), 5, 'Cursor inválido seguido de primera página')
    await page.getByRole('button', { name: 'Cerrar historial' }).click()
    await page.getByRole('button', { name: 'Solicitar acceso', exact: true }).click()
    await page.getByRole('alert').waitFor()
    await page.getByRole('button', { name: 'Solicitar acceso', exact: true }).click()
    await page.getByRole('heading', { name: 'Solicitud pendiente', exact: true }).waitFor()
    const access = calls.filter((c) => c.p_action === 'request_access')
    assert.equal(access.length, 2); assert.deepEqual(access[0], access[1]); assert.equal(count('summary'), 1)
    for (const period of ['current_biweekly', 'previous_biweekly']) {
      await page.getByLabel('Período de exportación').selectOption(period)
      const event = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click()
      const download = await event
      assert.match(download.suggestedFilename(), /SOLOG_Diferencias_quincenal_.*Huaca_Principal.xlsx/)
      const workbook = await readWorkbook(download, page)
      assert.deepEqual(workbook.names, ['Resumen', 'Diferencias'])
      assert.equal(workbook.differences.C2, 'Agua mineral')
      assert.equal(workbook.differences.I2, '24')
      assert.equal(workbook.differences.C3, 'Galletas por paquete')
      assert.equal(workbook.differences.I3, '—', 'Inconsistente no tiene valorización')
      assert.equal(Object.values(workbook.summary).includes('Balance valorizado'), false)
      assert.equal(workbook.summary.B4, period === 'current_biweekly' ? '01/09/2026 — 15/09/2026' : '16/08/2026 — 31/08/2026')
      if (period === 'previous_biweekly') {
        assert.equal(Math.floor(Number(workbook.differences.A2)), (Date.UTC(2026, 7, 30) - Date.UTC(1899, 11, 30)) / 86400000)
      }
    }
    emptyExport = true
    const empty = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click()
    assert.equal((await readWorkbook(await empty, page)).differences.A2, undefined)
    await page.getByText('Excel generado. El período no contiene diferencias finales.', { exact: true }).waitFor()
    const before = calls.length
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    assert.equal(calls.length, before)
    assert.deepEqual(errors, [])
    console.log('PASS D1–D3: entrada aislada, summary único, 100+1/cursor inválido, detalle cacheado, replay acceso, dos quincenas XLSX y vacío, sin v1 ni refetch por foco')
  } finally { await context.close(); await browser.close(); await server.close() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runDetailsV2Browser()
