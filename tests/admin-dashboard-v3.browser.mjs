// Ejecutar con node tests/admin-dashboard-v3.browser.mjs.
// Playwright externo mediante SOLOG_PLAYWRIGHT_MODULE; no instala dependencias.
// Contextos aislados y RPC simuladas: nunca accede a Supabase real.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const { chromium } = await import(process.env.SOLOG_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href : 'playwright')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-dashboard.test'),
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

function dashboardFixture(empty = false) {
  return {
    server_now: serverNow,
    periodo: { fecha: '2026-08-31', quincena_desde: '2026-08-16', quincena_hasta: '2026-08-31' },
    kpis: {
      cobertura_quincenal: { grupos_contados: empty ? 0 : 15, grupos_totales: empty ? 0 : 20, porcentaje: empty ? 0 : 75 },
      contados_hoy: { grupos_contados: empty ? 0 : 2 }, recontar: empty ? 0 : 3, confirmadas: empty ? 0 : 4, inconsistentes: empty ? 0 : 5,
    },
    sedes: empty ? [] : ['Huaca', 'Sin actividad'].map((sede, i) => ({
      sede_id: 'site-' + i, sede,
      cobertura_quincenal: { grupos_contados: i ? 0 : 15, grupos_totales: i ? 0 : 20, porcentaje: i ? 0 : 75 },
      cobertura_hoy: { fecha: '2026-08-31', grupos_requeridos: i ? 0 : 7, grupos_verificados: i ? 0 : 2, pendientes: i ? 0 : 5, porcentaje: i ? 100 : 28.57, sin_requerimientos: !!i },
      recontar: i ? 0 : 3, confirmadas: i ? 0 : 4, inconsistentes: i ? 0 : 5,
      actividad: { ultima_actividad_at: null, sesion_activa: !i },
    })),
  }
}

function activityFixture(siteId) {
  const empty = siteId === 'site-1'
  return {
    server_now: serverNow, sede_id: siteId, sede: empty ? 'Sin actividad' : 'Huaca', limit: 20,
    summary: { sesiones_hoy: empty ? 0 : 3, observaciones_registradas_hoy: empty ? 0 : 12, grupos_verificados_distintos_hoy: empty ? 0 : 2, sesion_activa: !empty, ultima_actividad_at: empty ? null : '2026-08-31T16:55:00Z' },
    sessions: empty ? [] : ['activo', 'finalizado', 'expirado'].map((estado, i) => ({
      conteo_id: 'count-' + i, usuario: 'Cajero ' + i, estado,
      iniciado_at: '2026-08-31T15:00:00Z', finalizado_at: i ? '2026-08-31T16:00:00Z' : null,
      duracion_segundos: i ? 3600 : 7200, observaciones_registradas: 4, grupos_verificados_distintos: 2,
    })),
  }
}

async function scenario({ empty = false, failDashboard = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const state = { calls: [], dashboard: dashboardFixture(empty), failDashboard, failActivity: false, delayActivity: false, releaseActivity: null }
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'solog-dashboard.test') {
      errors.push('Tráfico externo inesperado: ' + url.hostname)
      return route.abort()
    }
    const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (url.pathname === '/auth/v1/token') return fulfill({ access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user })
    if (url.pathname === '/auth/v1/user') return fulfill(user)
    const rpc = url.pathname.split('/').at(-1)
    const payload = request.postDataJSON() ?? {}
    state.calls.push({ rpc, payload })
    const usuario = { id: user.id, nombre: 'Administrador prueba', rol: 'admin' }
    if (rpc === 'rpc_solog_state' && payload.p_action === 'bootstrap') return fulfill({ usuario, server_now: serverNow })
    if (rpc === 'rpc_solog_admin' && payload.p_action === 'bootstrap') return fulfill({
      usuario, dispositivos_pendientes: [],
      sedes: state.dashboard.sedes.map((site) => ({ id: site.sede_id, nombre: site.sede, activo: true, dispositivo: null, sesion_activa: null, cobertura_diaria: site.cobertura_hoy, cobertura_quincenal: site.cobertura_quincenal })),
    })
    if (rpc === 'rpc_solog_dashboard') {
      assert.deepEqual(payload, {})
      if (state.failDashboard) return fulfill({ message: 'Fallo simulado Dashboard' }, 500)
      return fulfill(state.dashboard)
    }
    if (rpc === 'rpc_solog_dashboard_site_activity') {
      assert.deepEqual(Object.keys(payload).sort(), ['p_limit', 'p_sede_id'])
      assert.equal(payload.p_limit, 20)
      assert.ok(state.dashboard.sedes.some((site) => site.sede_id === payload.p_sede_id))
      if (state.failActivity) return fulfill({ message: 'Fallo simulado actividad' }, 500)
      if (state.delayActivity) {
        state.delayActivity = false
        await new Promise((resolve) => { state.releaseActivity = resolve })
      }
      return fulfill(activityFixture(payload.p_sede_id))
    }
    errors.push('RPC fuera de alcance: ' + rpc)
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(10000)
  await page.goto('http://127.0.0.1:5198/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-only-password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.waitForURL('**/admin')
  return { context, page, state }
}

try {
  {
    const { context, page, state } = await scenario()
    await page.getByRole('heading', { name: 'Resumen por sede' }).waitFor()
    const cards = page.locator('.admin-dashboard-kpi')
    assert.equal(await cards.count(), 5)
    for (const [label, value] of [['Cobertura quincenal', '75%'], ['Contados hoy', '2'], ['Por recontar', '3'], ['Confirmadas', '4'], ['Inconsistentes', '5']]) {
      assert.equal(await cards.filter({ has: page.getByText(label, { exact: true }) }).locator('strong').innerText(), value)
    }
    assert.equal(await page.getByText('Persistentes', { exact: true }).count(), 0)
    check('cinco KPIs V3 sin Persistentes en la ruta /admin existente')
    const huaca = page.getByRole('button', { name: 'Ver actividad de conteo de Huaca' })
    assert.deepEqual(await huaca.locator('.admin-dashboard-badge').allTextContents(), ['3', '4', '5', 'Contando ahora'])
    assert.equal(await huaca.locator('.admin-dashboard-coverage strong').nth(0).innerText(), '15 / 20')
    assert.equal(await huaca.locator('.admin-dashboard-coverage strong').nth(1).innerText(), '2 / 7')
    assert.equal(await huaca.getByText(/Fecha no disponible|Desde/).count(), 0)
    check('tabla por sede: estados V3, cobertura diaria y sesión activa sin timestamps inexistentes')
    assert.equal(await page.getByLabel('Grupos verificados y requeridos hoy en Sin actividad: 0 de 0, 100%', { exact: true }).count(), 1)
    check('sede con ceros y sin requerimientos conserva el porcentaje backend')
    if (process.env.SOLOG_TEST_SCREENSHOT) await page.screenshot({ path: process.env.SOLOG_TEST_SCREENSHOT, fullPage: true })
    await huaca.click()
    const drawer = page.getByRole('dialog', { name: 'Actividad de conteo' })
    await drawer.getByRole('heading', { name: 'Actividad reciente' }).waitFor()
    assert.deepEqual(await drawer.locator('.dashboard-activity-summary dd').allTextContents(), ['12', '2', '3', 'Hace 5 min'])
    assert.deepEqual(await drawer.locator('.dashboard-session-state').allTextContents(), ['Activa', 'Finalizado', 'Expirado'])
    assert.equal(await drawer.getByText(/4 observaciones.*2 grupos distintos/).count(), 3)
    check('actividad V3 distingue observaciones de grupos distintos y conserva estados de sesión')
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden' })
    const noActivity = page.getByRole('button', { name: 'Ver actividad de conteo de Sin actividad' })
    await noActivity.focus()
    await page.keyboard.press('Enter')
    await drawer.getByText('No hay sesiones de conteo registradas.').waitFor()
    assert.deepEqual(await drawer.locator('.dashboard-activity-summary dd').allTextContents(), ['0', '0', '0', 'Sin actividad'])
    await drawer.getByRole('button', { name: 'Cerrar actividad' }).click()
    check('actividad vacía y apertura/cierre por teclado preservados')
    state.failActivity = true
    await huaca.click()
    await drawer.getByText('No se pudo cargar la actividad').waitFor()
    state.failActivity = false
    await drawer.getByRole('button', { name: 'Reintentar' }).click()
    await drawer.getByRole('heading', { name: 'Actividad reciente' }).waitFor()
    await drawer.getByRole('button', { name: 'Cerrar actividad' }).click()
    check('error y reintento de actividad mantienen el contrato de la RPC')
    state.delayActivity = true
    await huaca.click()
    await drawer.getByLabel('Cargando actividad de conteo').waitFor()
    // Esperar la solicitud sin esperas fijas ni acceso a datos del navegador.
    await assert.doesNotReject(async () => {
      for (let i = 0; i < 100 && !state.releaseActivity; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      assert.ok(state.releaseActivity)
    })
    await drawer.getByRole('button', { name: 'Cerrar actividad' }).click()
    await noActivity.click()
    await drawer.getByText('No hay sesiones de conteo registradas.').waitFor()
    const arrived = page.waitForResponse((response) => response.url().endsWith('/rpc_solog_dashboard_site_activity') && response.request().postDataJSON().p_sede_id === 'site-0')
    state.releaseActivity()
    await arrived
    assert.deepEqual(await drawer.locator('.dashboard-activity-summary dd').allTextContents(), ['0', '0', '0', 'Sin actividad'])
    check('respuesta tardía de otra sede no reemplaza la actividad abierta')
    assert.doesNotMatch(await page.locator('.admin-dashboard').innerText(), /NaN|undefined/)
    await context.close()
  }
  {
    const { context, page, state } = await scenario({ empty: true, failDashboard: true })
    await page.getByText('No se pudo cargar el Dashboard').waitFor()
    state.failDashboard = false
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await page.getByText('No hay sedes disponibles.').waitFor()
    assert.deepEqual(await page.locator('.admin-dashboard-kpi strong').allTextContents(), ['0%', '0', '0', '0', '0'])
    assert.equal(await page.locator('.admin-dashboard-table').count(), 0)
    assert.equal(state.calls.filter((call) => call.rpc === 'rpc_solog_dashboard_site_activity').length, 0)
    check('Dashboard vacío, cinco métricas cero y reintento de carga')
    await context.close()
  }
  assert.deepEqual(errors, [])
  console.log('Resultado: ' + checks.length + ' comprobaciones UI; cero errores JS y cero solicitudes a Supabase real.')
} finally {
  await browser.close()
  await server.close()
}
