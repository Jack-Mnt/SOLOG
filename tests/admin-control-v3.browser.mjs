// Ejecutar con node tests/admin-control-v3.browser.mjs.
// Usa SOLOG_PLAYWRIGHT_MODULE y opcionalmente SOLOG_TEST_BROWSER.
// RPC simuladas en un contexto aislado; nunca accede a Supabase real.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const { unzipSync, strFromU8 } = createRequire(require.resolve('write-excel-file/package.json'))('fflate')
const { chromium } = await import(process.env.SOLOG_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href : 'playwright')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-control.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  },
})
await server.listen()
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER ? { executablePath: process.env.SOLOG_TEST_BROWSER } : {}),
})
const serverNow = '2026-08-31T17:00:00Z'
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: serverNow }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
const errors = []
const checks = []
const check = (label) => { checks.push(label); console.log('PASS ' + label) }
const groups = { recontar: 'Recontar', confirmadas: 'Confirmada', inconsistentes: 'Inconsistente', coinciden: 'Coincide' }

function rowFixture(i, estado = 'Recontar') {
  return {
    detalle_id: 'detail-' + i, conteo_id: 'count-' + i, grupo_id: 'group-' + i,
    grupo: 'Grupo ' + String(i).padStart(2, '0'), categoria_id: 'cat', categoria: 'Bebidas',
    sede_id: 'huaca', sede: 'Huaca', usuario_id: user.id, usuario: 'Cajero prueba',
    stock_teorico: 20, stock_fisico: 10, diferencia: estado === 'Coincide' ? 0 : estado === 'Confirmada' ? -2 : -10,
    precio: 8.625, valor_diferencia: estado === 'Confirmada' ? -17.25 : 0,
    estado_diferencia: estado, contado_at: new Date(Date.parse(serverNow) - i * 60000).toISOString(),
    snapshot_referencia_id: 'ref-' + i,
    primer_snapshot_posterior_id: i >= 55 ? 'first-' + i : null,
    snapshot_posterior_id: i >= 55 ? 'last-' + i : null,
    stock_posterior: i >= 55 ? 0 : null,
    snapshot_reconteo_id: estado === 'Confirmada' || estado === 'Inconsistente' ? 'recount-' + i : null,
    stock_reconteo: estado === 'Confirmada' ? 18 : estado === 'Inconsistente' ? 0 : null,
    recontado_at: estado === 'Confirmada' || estado === 'Inconsistente' ? serverNow : null,
    es_observacion_vigente: true,
  }
}
const rows = [...Array.from({ length: 55 }, (_, i) => rowFixture(i)), rowFixture(55, 'Confirmada'), rowFixture(56, 'Inconsistente'), rowFixture(57, 'Coincide')]

function detailFixture(id, empty = false) {
  const selected = rows.find((row) => row.detalle_id === id)
  const detalle = Object.fromEntries(Object.entries(selected).filter(([key]) => !['categoria_id', 'es_observacion_vigente'].includes(key)))
  const historial = empty ? [] : Array.from({ length: 53 }, (_, i) => ({
    detalle_id: 'history-' + i, conteo_id: 'count-history-' + i,
    stock_teorico: 20, stock_fisico: i, diferencia: -2, valor_diferencia: -17.25,
    estado_diferencia: ['Confirmada', 'Recontar', 'Inconsistente', 'Coincide'][i % 4],
    contado_at: new Date(Date.parse(serverNow) - i * 3600000).toISOString(),
    snapshot_referencia_id: 'history-ref-' + i, primer_snapshot_posterior_id: 'history-first-' + i,
    snapshot_posterior_id: 'history-last-' + i, stock_posterior: 0,
    snapshot_reconteo_id: 'history-recount-' + i, stock_reconteo: 18, recontado_at: serverNow,
  }))
  return { detalle, historial, historial_total: historial.length, server_now: serverNow,
    skus: [{ c_interno: 123, c_barras: null, producto: 'Producto de prueba', marca: null, precio: 8.625, estado: 'Activo' }] }
}

function exportFixture(payload) {
  return {
    ...payload, sede: payload.sede_id === 'huaca' ? 'Huaca' : 'Cutervo',
    registros: 1, faltantes: 17.25, sobrantes: 0, balance: 17.25, server_now: serverNow,
    rows: [{ fecha: '2026-09-01T01:00:00Z', categoria: 'Bebidas', grupo: 'Grupo confirmado exportado',
      tipo: 'Agrupado', codigos_internos: [123, 456], teorico: 20, fisico: 10,
      reconteo: 18, ajuste: -2, valor_economico: 17.25, detalle_id: 'detail-55', estado: 'Confirmada' }],
  }
}

async function scenario() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const state = { calls: [], failControl: false, failDetail: false, exportMode: 'rows', historyEmpty: false, delayDetail: false }
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'solog-control.test') {
      errors.push('Tráfico externo inesperado: ' + url.hostname)
      return route.abort()
    }
    const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (url.pathname === '/auth/v1/token') return fulfill({ access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user })
    if (url.pathname === '/auth/v1/user') return fulfill(user)
    const rpc = url.pathname.split('/').at(-1)
    const body = request.postDataJSON() ?? {}
    const payload = body.p_payload ?? {}
    state.calls.push({ rpc, body, payload })
    const usuario = { id: user.id, nombre: 'Administrador prueba', rol: 'admin' }
    if (rpc === 'rpc_solog_state' && body.p_action === 'bootstrap') return fulfill({ usuario, server_now: serverNow })
    if (rpc === 'rpc_solog_admin' && body.p_action === 'bootstrap') return fulfill({
      usuario, dispositivos_pendientes: [], sedes: ['huaca', 'cutervo'].map((id) => ({ id, nombre: id === 'huaca' ? 'Huaca' : 'Cutervo', activo: true, dispositivo: null, sesion_activa: null })),
    })
    if (rpc === 'rpc_solog_admin' && body.p_action === 'catalog_reference') return fulfill({ categorias: [{ id: 'cat', nombre: 'Bebidas', orden: 1 }] })
    if (rpc === 'rpc_solog_dashboard') return fulfill({
      server_now: serverNow, periodo: { fecha: '2026-08-31', quincena_desde: '2026-08-16', quincena_hasta: '2026-08-31' },
      kpis: { cobertura_quincenal: { grupos_contados: 0, grupos_totales: 0, porcentaje: 0 }, contados_hoy: { grupos_contados: 0 }, recontar: 0, confirmadas: 0, inconsistentes: 0 }, sedes: [],
    })
    if (rpc === 'rpc_solog_control') {
      assert.ok([...Object.keys(groups), 'todos'].includes(payload.grupo_estado))
      assert.equal(payload.scope, 'resolver')
      assert.equal(payload.limit, 50)
      if (state.failControl) return fulfill({ message: 'Fallo simulado Control' }, 500)
      const filtered = rows.filter((row) => (payload.grupo_estado === 'todos' || row.estado_diferencia === groups[payload.grupo_estado])
        && (!payload.categoria_id || row.categoria_id === payload.categoria_id)
        && (!payload.search || row.grupo.includes(payload.search)))
      return fulfill({ ...payload, sede: payload.sede_id === 'huaca' ? 'Huaca' : 'Cutervo',
        summary: { total: 58, recontar: 55, confirmadas: 1, inconsistentes: 1, coincide: 1 },
        rows: filtered.slice(payload.offset, payload.offset + payload.limit), total: filtered.length, server_now: serverNow })
    }
    if (rpc === 'rpc_solog_control_detalle') {
      assert.deepEqual(Object.keys(payload), ['detalle_id'])
      if (state.failDetail) return fulfill({ message: 'Fallo simulado detalle' }, 500)
      const response = detailFixture(payload.detalle_id, state.historyEmpty)
      if (state.delayDetail) {
        state.delayDetail = false
        await new Promise((resolve) => { state.releaseDetail = resolve; state.detailRequested() })
      }
      return fulfill(response)
    }
    if (rpc === 'rpc_solog_control_export') {
      assert.deepEqual(Object.keys(payload).sort(), ['date_from', 'date_to', 'sede_id'])
      const response = exportFixture(payload)
      if (state.exportMode === 'empty') Object.assign(response, { rows: [], registros: 0, faltantes: 0, sobrantes: 0, balance: 0 })
      if (state.exportMode === 'invalid') response.rows[0].estado = 'Inconsistente'
      return fulfill(response)
    }
    errors.push('RPC fuera de alcance: ' + rpc)
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(10000)
  await page.goto('http://127.0.0.1:5199/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-only-password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.getByRole('navigation', { name: 'Módulos administrativos' }).getByRole('button', { name: 'Control', exact: true }).click()
  await page.locator('.control-table tbody tr').first().waitFor()
  return { context, page, state }
}

async function requestAfter(page, rpc, action) {
  const response = page.waitForResponse((response) => response.url().endsWith('/' + rpc))
  await action()
  const result = await response
  await page.waitForFunction(() => !document.querySelector('.control-table tbody tr[aria-disabled="true"]'))
  return result.request().postDataJSON().p_payload
}

async function readWorkbook(download, page) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const zip = unzipSync(Buffer.concat(chunks))
  const files = Object.fromEntries(Object.entries(zip).map(([path, data]) => [path, strFromU8(data)]))
  // DOMParser se usa únicamente sobre el XML descargado, no sobre estado interno de React.
  return page.evaluate((files) => {
    const parse = (text) => new DOMParser().parseFromString(text, 'application/xml')
    const strings = files['xl/sharedStrings.xml'] ? [...parse(files['xl/sharedStrings.xml']).querySelectorAll('si')].map((node) => node.textContent) : []
    const sheet = (path) => Object.fromEntries([...parse(files[path]).querySelectorAll('c')].map((cell) => [
      cell.getAttribute('r'), cell.getAttribute('t') === 's' ? strings[Number(cell.querySelector('v').textContent)] : cell.querySelector('v, t')?.textContent ?? '',
    ]))
    return { names: [...parse(files['xl/workbook.xml']).querySelectorAll('sheet')].map((node) => node.getAttribute('name')),
      adjustments: sheet('xl/worksheets/sheet2.xml'), summary: sheet('xl/worksheets/sheet1.xml'), styles: files['xl/styles.xml'] }
  }, files)
}

try {
  const { context, page, state } = await scenario()
  const table = page.locator('.control-table')
  const pagination = page.getByRole('navigation', { name: 'Paginación de Control', exact: true })
  const summary = page.getByLabel('Resumen por grupo de estado')
  assert.deepEqual(await summary.locator('button span').allTextContents(), ['Recontar', 'Confirmada', 'Inconsistente', 'Coincide', 'Todos'])
  assert.deepEqual(await summary.locator('strong').allTextContents(), ['55', '1', '1', '1', '58'])
  assert.equal(await page.getByRole('combobox', { name: /^Estado/ }).inputValue(), 'recontar')
  assert.deepEqual(await table.locator('th').allTextContents(), ['Fecha y hora', 'Grupo', 'Categoría', 'Teórico', 'Físico', 'Reconteo', 'Diferencia', 'Estado', ''])
  check('filtro inicial Recontar, cinco KPIs con mapping explícito y columnas V3')

  await requestAfter(page, 'rpc_solog_control', () => pagination.getByRole('button', { name: 'Siguiente' }).click())
  await pagination.getByText('51–55 de 55').waitFor()
  assert.equal(await table.locator('tbody tr').count(), 5)
  assert.equal(await table.locator('tbody tr td strong').first().innerText(), 'Grupo 50')
  assert.equal(await pagination.getByRole('button', { name: 'Siguiente' }).isEnabled(), false)
  await requestAfter(page, 'rpc_solog_control', () => pagination.getByRole('button', { name: 'Anterior' }).click())
  await pagination.getByText('1–50 de 55').waitFor()
  check('paginación Control usa total filtrado backend y presenta páginas distintas')

  for (const [filter, label] of Object.entries(groups)) {
    const payload = await requestAfter(page, 'rpc_solog_control', () => summary.getByRole('button', { name: new RegExp('^' + label) }).click())
    assert.equal(payload.grupo_estado, filter)
    assert.equal(payload.offset, 0)
    assert.equal(await table.locator('.control-state-badge').first().innerText(), label)
  }
  await requestAfter(page, 'rpc_solog_control', () => summary.getByRole('button', { name: /^Todos/ }).click())
  assert.equal(await page.getByRole('combobox', { name: /^Estado/ }).inputValue(), 'todos')
  check('los cinco filtros envían claves V3 y muestran estados exactos')

  await page.getByRole('combobox', { name: /^Estado/ }).selectOption('confirmadas')
  await requestAfter(page, 'rpc_solog_control', () => page.getByRole('button', { name: 'Aplicar', exact: true }).click())
  assert.equal(await table.locator('tbody tr td').nth(5).innerText(), '18')
  assert.equal(await table.locator('tbody tr td').nth(6).innerText(), '-2')
  assert.doesNotMatch(await table.innerText(), /Saldo confirmado|Diferencia observada/)
  if (process.env.SOLOG_TEST_SCREENSHOT) await page.screenshot({ path: process.env.SOLOG_TEST_SCREENSHOT, fullPage: true, animations: 'disabled' })
  check('Confirmada muestra diferencia autoritativa, no físico menos teórico')

  await table.locator('tbody tr').first().click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('heading', { name: 'Grupo 55', exact: true }).waitFor()
  assert.deepEqual(await drawer.locator('.control-detail-metrics dd').allTextContents(), ['20', '10', '18', '-2'])
  for (const ref of ['ref-55', 'first-55', 'last-55', 'recount-55']) await drawer.getByText(ref, { exact: true }).waitFor()
  assert.equal(await drawer.locator('.control-detail-meta > div').filter({ has: page.locator('dt', { hasText: 'Stock posterior' }) }).locator('dd').innerText(), '0')
  assert.doesNotMatch(await drawer.innerText(), /Tipo de observación|Saldo confirmado|Deriva de|Motivo de verificación|undefined|NaN/)
  if (process.env.SOLOG_TEST_DRAWER_SCREENSHOT) await page.screenshot({ path: process.env.SOLOG_TEST_DRAWER_SCREENSHOT, fullPage: true, animations: 'disabled' })
  check('Drawer muestra conteo, posterior cero, reconteo, fecha y cuatro snapshots reales')
  await drawer.getByRole('button', { name: 'Productos (1)' }).click()
  await drawer.getByText('Producto de prueba').waitFor()
  check('productos del Drawer conservados')

  const detailCalls = () => state.calls.filter((call) => call.rpc === 'rpc_solog_control_detalle').length
  const initialCalls = detailCalls()
  await drawer.getByRole('button', { name: 'Observaciones (53)' }).click()
  const historyPagination = drawer.getByRole('navigation', { name: 'Paginación de observaciones del grupo' })
  const timeline = drawer.locator('.control-timeline')
  await historyPagination.getByText('1–25 de 53').waitFor()
  assert.equal(await timeline.locator('li').count(), 25)
  await timeline.getByText('history-ref-0', { exact: true }).waitFor()
  assert.equal(await timeline.getByText('Cajero prueba', { exact: true }).count(), 0)
  await historyPagination.getByRole('button', { name: 'Siguiente' }).click()
  await historyPagination.getByText('26–50 de 53').waitFor()
  await timeline.getByText('history-ref-25', { exact: true }).waitFor()
  assert.equal(await timeline.getByText('history-ref-0', { exact: true }).count(), 0)
  await historyPagination.getByRole('button', { name: 'Siguiente' }).click()
  await historyPagination.getByText('51–53 de 53').waitFor()
  assert.equal(await timeline.locator('li').count(), 3)
  assert.equal(await historyPagination.getByRole('button', { name: 'Siguiente' }).isEnabled(), false)
  await historyPagination.getByRole('button', { name: 'Anterior' }).click()
  await timeline.getByText('history-ref-25', { exact: true }).waitFor()
  assert.equal(detailCalls(), initialCalls)
  check('53 observaciones independientes en tres páginas locales sin repetir RPC ni inventar usuarios')
  await drawer.getByRole('button', { name: 'Cerrar detalle' }).click()

  await requestAfter(page, 'rpc_solog_control', () => page.getByRole('button', { name: 'Limpiar', exact: true }).click())
  await table.locator('tbody tr').first().click()
  await drawer.getByRole('heading', { name: 'Grupo 00', exact: true }).waitFor()
  assert.equal(await drawer.locator('.control-detail-metrics dd').nth(2).innerText(), '—')
  assert.equal(await drawer.getByText('Primer snapshot posterior', { exact: true }).count(), 0)
  assert.equal(await drawer.getByText('Fecha de reconteo', { exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  check('detalle sin posterior/reconteo no fabrica valores ni fechas')

  state.failDetail = true
  await table.locator('tbody tr').first().click()
  await drawer.getByText('No se pudo cargar el detalle').waitFor()
  state.failDetail = false
  state.historyEmpty = true
  await drawer.getByRole('button', { name: 'Reintentar' }).click()
  await drawer.getByRole('button', { name: 'Observaciones (0)' }).click()
  await drawer.getByText('No hay observaciones históricas para este grupo.').waitFor()
  await drawer.getByRole('button', { name: 'Cerrar detalle' }).click()
  state.historyEmpty = false
  check('error, reintento e historial vacío de detalle')

  await page.getByRole('combobox', { name: /^Categoría/ }).focus()
  await page.getByRole('combobox', { name: /^Categoría/ }).locator('option', { hasText: 'Bebidas' }).waitFor({ state: 'attached' })
  await requestAfter(page, 'rpc_solog_control', () => page.getByRole('combobox', { name: /^Categoría/ }).selectOption('cat'))
  await page.getByRole('searchbox').fill('Grupo 01')
  const search = await requestAfter(page, 'rpc_solog_control', () => page.getByRole('button', { name: 'Aplicar', exact: true }).click())
  assert.equal(search.categoria_id, 'cat')
  assert.equal(search.search, 'Grupo 01')
  await pagination.getByText('1–1 de 1').waitFor()
  const reset = await requestAfter(page, 'rpc_solog_control', () => page.getByRole('button', { name: 'Limpiar', exact: true }).click())
  assert.equal(reset.grupo_estado, 'recontar')
  assert.equal(reset.search, undefined)
  assert.equal(reset.categoria_id, undefined)
  check('categoría, búsqueda y limpieza conservan contrato y reinician offset')
  await page.getByRole('searchbox').fill('Sin coincidencias')
  await requestAfter(page, 'rpc_solog_control', () => page.getByRole('button', { name: 'Aplicar', exact: true }).click())
  await page.getByText('No hay observaciones para la sede, período y filtros seleccionados.').waitFor()
  assert.equal(await table.count(), 0)
  await requestAfter(page, 'rpc_solog_control', () => page.getByRole('button', { name: 'Limpiar', exact: true }).click())
  check('Control sin coincidencias muestra estado vacío y se recupera al limpiar')

  await requestAfter(page, 'rpc_solog_control', () => pagination.getByRole('button', { name: 'Siguiente' }).click())
  const site = await requestAfter(page, 'rpc_solog_control', () => page.getByRole('group', { name: 'Sede operativa' }).getByRole('button', { name: 'Huaca', exact: true }).click())
  assert.equal(site.sede_id, 'huaca')
  assert.equal(site.offset, 0)
  await page.getByLabel('Período', { exact: true }).selectOption('custom')
  const period = page.getByRole('dialog', { name: 'Período personalizado' })
  await period.getByLabel('Desde', { exact: true }).fill('2026-08-16')
  await period.getByLabel('Hasta', { exact: true }).fill('2026-08-31')
  const dates = await requestAfter(page, 'rpc_solog_control', () => period.getByRole('button', { name: 'Aplicar' }).click())
  assert.equal(dates.date_from, '2026-08-16')
  assert.equal(dates.date_to, '2026-08-31')
  check('sede/período existentes se propagan a Control con offset cero')

  // Se exporta desde el filtro Inconsistente: las filas proceden solo de la RPC de exportación.
  await requestAfter(page, 'rpc_solog_control', () => summary.getByRole('button', { name: /^Inconsistente/ }).click())
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar Excel', exact: true }).click()
  const download = await downloaded
  assert.equal(download.suggestedFilename(), 'SOLOG_Ajustes_Huaca_2026-08-16_2026-08-31.xlsx')
  const workbook = await readWorkbook(download, page)
  assert.deepEqual(workbook.names, ['Resumen', 'Ajustes'])
  const sheet = workbook.adjustments
  assert.equal(sheet.H1, 'Reconteo')
  assert.equal(sheet.K1, 'Detalle ID')
  assert.equal(sheet.H2, '18')
  assert.equal(sheet.I2, '-2')
  assert.equal(sheet.J2, '17.25')
  assert.equal(sheet.K2, 'detail-55')
  assert.equal(sheet.L2, 'Confirmada')
  assert.equal(sheet.C2, 'Grupo confirmado exportado')
  assert.equal(sheet.E2, '123, 456')
  assert.equal(sheet.C3, undefined)
  assert.equal(Math.floor(Number(sheet.A2)), (Date.UTC(2026, 7, 31) - Date.UTC(1899, 11, 30)) / 86400000)
  assert.equal(workbook.summary.B7, '17.25')
  assert.equal(workbook.summary.B9, '17.25')
  assert.match(workbook.styles, /S\/ /)
  check('Excel real: dos hojas, Reconteo y detalle_id, fecha Lima, ajustes/importes backend; no exporta la tabla Inconsistente')

  let unexpectedDownloads = 0
  page.on('download', () => { unexpectedDownloads++ })
  state.exportMode = 'empty'
  await page.getByRole('button', { name: 'Exportar Excel', exact: true }).click()
  await page.getByText('No hay ajustes elegibles para exportar en la sede y el período aplicados.').waitFor()
  assert.equal(unexpectedDownloads, 0)
  state.exportMode = 'invalid'
  await page.getByRole('button', { name: 'Exportar Excel', exact: true }).click()
  await page.locator('.control-export-message[role="alert"]').waitFor()
  assert.equal(unexpectedDownloads, 0)
  check('exportación vacía no descarga; respuesta Inconsistente inválida se rechaza sin filtrar silenciosamente')

  state.failControl = true
  await requestAfter(page, 'rpc_solog_control', () => page.getByRole('button', { name: 'Limpiar', exact: true }).click())
  await page.getByText('No se pudo cargar Control').waitFor()
  state.failControl = false
  await requestAfter(page, 'rpc_solog_control', () => page.getByRole('button', { name: 'Reintentar', exact: true }).click())
  await table.locator('tbody tr').first().waitFor()
  check('Control se recupera de error sin enviar aliases legacy')

  state.delayDetail = true
  const requested = new Promise((resolve) => { state.detailRequested = resolve })
  await table.locator('tbody tr').first().click()
  await requested
  await drawer.getByRole('button', { name: 'Cerrar detalle' }).click()
  await table.locator('tbody tr').nth(1).click()
  await drawer.getByRole('heading', { name: 'Grupo 01', exact: true }).waitFor()
  const late = page.waitForResponse((response) => response.url().endsWith('/rpc_solog_control_detalle') && response.request().postDataJSON().p_payload.detalle_id === 'detail-0')
  state.releaseDetail()
  await late
  assert.equal(await drawer.getByRole('heading', { name: 'Grupo 01', exact: true }).count(), 1)
  check('respuesta tardía no sustituye otro detalle abierto')
  await context.close()
  assert.deepEqual(errors, [])
  console.log('Resultado: ' + checks.length + ' comprobaciones UI/Excel; cero errores JS y cero solicitudes a Supabase real.')
} finally {
  await browser.close()
  await server.close()
}
