// Dashboard V1 browser harness. Todo backend HTTP se intercepta: NO toca Supabase real.
// Ejecutar durante Fase 6 con SOLOG_PLAYWRIGHT_MODULE y SOLOG_TEST_BROWSER configurados.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const siteIds = ['1', '2', '3', '4', '5'].map(n => '00000000-0000-4000-8000-00000000000' + n)
const siteNames = ['Cutervo', 'Huaca', 'Divino', 'Unidad', 'Casuarinas']
const groupId = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0')
const stamp = '2026-10-16T10:00:00-05:00'
const range = (from, to) => {
  const out = []
  for (const day = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
    day <= end; day.setUTCDate(day.getUTCDate() + 1)) out.push(day.toISOString().slice(0, 10))
  return out
}
function daysAgo(today, offset) {
  const date = new Date(today + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function fixture(action, p) {
  const wrap = (data, quality = 'complete') => ({
    contract_version: 1, generated_at: stamp, action, source: 'metrics_dashboard_v1', quality, data,
  })
  if (action === 'overview') return wrap({ sites: siteNames.map((name, i) => ({
    site_id: siteIds[i], site_name: name,
    round: i === 1
      ? { period_from: '2026-10-16', round: 1, counted: null, required: null, percent: null, quality: 'no_data' }
      : { period_from: '2026-10-16', round: 1, counted: 1, required: 2, percent: 50, quality: 'complete' },
    accuracy: i === 1 ? {
      green: 0, yellow: 0, red: 0, exempt_zero_zero: 0, without_evidence: 2,
      universe: 2, denominator: 0,
      green_percent: null, yellow_percent: null, red_percent: null,
      quality: 'no_data',
    } : {
      green: 1, yellow: 0, red: 1, exempt_zero_zero: 0, without_evidence: 0,
      universe: 2, denominator: 2, green_percent: 50, yellow_percent: 0, red_percent: 50,
      quality: 'complete',
    },
    surplus: { groups: i === 1 ? 0 : 1, value: i === 1 ? null : 12.5, quality: i === 1 ? 'no_data' : 'complete' },
    shortage: { groups: i === 1 ? 0 : 1, value: i === 1 ? null : -15, quality: i === 1 ? 'no_data' : 'complete' },
    risk: { high: i === 1 ? 0 : 1, very_high: 0, quality: i === 1 ? 'no_data' : 'complete' },
  })) })
  if (action === 'risk') {
    const base = p.cursor ? 7 : 1
    const qty = p.cursor ? 2 : 6
    return wrap({
      site_id: p.site_id, sort: p.sort ?? 'risk',
      rows: Array.from({ length: qty }, (_, i) => ({
        group_id: groupId(base + i), group_name: 'Grupo riesgo ' + (base + i),
        difference: -2, confirmed_value: -20,
        level: 'alto', movement_quality: 'complete', risk_available: true,
      })),
      total: 8, next_cursor: p.cursor ? null : Buffer.from('risk-next').toString('base64'),
    })
  }
  if (action === 'rounds') {
    const base = {
      round_from: stamp, round_to: '2026-10-31T23:59:59-05:00',
      period_from: '2026-10-16', period_to: '2026-10-31', round: 1,
      coverage: { counted: 1, required: 2, percent: 50 },
      milestones: { 50: '2026-10-16T11:30:00-05:00', 90: null, 100: null },
      historical_accuracy: null, shift_contributions: { early: 1, day: 0, night: 0 },
      closed_at: null, quality: 'complete', cut_version: null,
    }
    const closed = {
      ...base, round_from: '2026-10-01T10:00:00-05:00',
      round_to: '2026-10-15T23:59:59-05:00',
      period_from: '2026-10-01', period_to: '2026-10-15',
      closed_at: '2026-10-15T21:00:00-05:00', cut_version: 1,
      coverage: { counted: 2, required: 2, percent: 100 },
      milestones: { 50: '2026-10-01T11:00:00-05:00', 90: '2026-10-02T12:00:00-05:00', 100: '2026-10-03T14:00:00-05:00' },
      historical_accuracy: { green: 1, red: 1, exempt: 0, without_evidence: 0, denominator: 2, percent: 50 },
    }
    const noDataHistory = {
      ...closed,
      round: 2,
      round_from: '2026-10-08T05:00:00+00:00',
      round_to: '2026-10-16T05:00:00+00:00',
      quality: 'no_data',
      coverage: { counted: null, required: null, percent: null },
      historical_accuracy: {
        green: null, red: null, exempt: null, without_evidence: null,
        denominator: null, percent: null,
      },
      shift_contributions: {}, // Forma observada en el helper real de Supabase.
    }
    return wrap({ site_id: p.site_id, current: base, period_rounds: [base], history: [noDataHistory, closed] }, 'partial')
  }
  if (action === 'episodes') {
    const closed = p.scope === 'closed'
    return wrap({
      site_id: p.site_id, scope: p.scope ?? 'open',
      sort: p.sort ?? (closed ? 'recent' : 'importance'),
      total: 1, next_cursor: null,
      rows: [{
        episode_id: groupId(200), group_id: groupId(1),
        group_name: 'Grupo episodio', opened_at: '2026-10-14T11:00:00-05:00',
        closed_at: closed ? '2026-10-15T12:00:00-05:00' : null,
        recurrences_45d: 2, duration_hours: 49,
        risk_level: 'alto', risk_status: 'available',
      }],
    })
  }
  if (action === 'activity') {
    const previous = daysAgo(p.date_to, 1)
    const blank = daysAgo(p.date_to, 2)
    return wrap({
      site_id: p.site_id, date_from: p.date_from, date_to: p.date_to,
      cells: range(p.date_from, p.date_to).flatMap(date =>
        ['early', 'day', 'night'].map(turno => {
          const noData = date === blank || date === previous && turno !== 'night'
          return {
            date, turno, status: noData ? 'no_data' : 'closed',
            completed: noData ? null : 1, required: noData ? null : 2, percent: noData ? null : 50,
            breakdown: { round_coverage: noData ? 0 : 1, review_for_coverage: 0, review_regular: 0, shift_coverage: 0 },
            quality: noData ? 'no_data' : 'complete',
          }
        })),
    }, 'partial')
  }
  if (action === 'day') return wrap({
    site_id: p.site_id, date: p.date,
    physical_activity: { groups_observed: 2, counts: 2, recounts: 1 },
    episodes: { opened: 1, closed: 0, open_at_day_end: 1 },
    confirmed_differences: [{
      group_id: groupId(1), group_name: 'Grupo confirmado',
      recounted_at: p.date + 'T14:00:00-05:00',
      difference: -2, frozen_value: -10,
    }],
    confirmed_total: 1, confirmed_next_cursor: null,
    observations_initial_cursor: null, quality: 'complete',
  })
  if (action === 'day_observations') return wrap({
    site_id: p.site_id, date: p.date, next_cursor: p.cursor ? null : Buffer.from('observation-next').toString('base64'),
    rows: Array.from({ length: p.cursor ? 1 : 25 }, (_, i) => {
      const k = (p.cursor ? 26 : 1) + i
      return {
        observation_id: groupId(500 + k), group_id: groupId(1),
        group_name: 'Grupo observación ' + k,
        kind: k % 2 ? 'normal' : 'recount',
        observed_at: p.date + 'T14:00:00-05:00',
        theoretical: 10, physical: 8, physical_difference: -2, result: 'Recontar',
      }
    }),
  })
  throw new Error('Unknown Dashboard action: ' + action)
}

export async function runDashboardMetricsBrowser() {
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
    id: 'admin-test', email: 'admin@example.test', role: 'authenticated',
    app_metadata: {}, user_metadata: { rol: 'cajero' },
    aud: 'authenticated', created_at: stamp,
  }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = [{ alg: 'HS256', typ: 'JWT' }, {
    sub: user.id, aud: 'authenticated', role: 'authenticated', exp,
  }].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.') + '.test'
  await context.addInitScript(({ user, jwt, exp }) => {
    localStorage.setItem('sb-solog-admin-v2-auth-token', JSON.stringify({
      access_token: jwt, refresh_token: 'test', expires_at: exp,
      expires_in: 3600, token_type: 'bearer', user,
    }))
  }, { user, jwt, exp })

  const calls = []
  const errors = []
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'solog-admin-v2.test') {
      errors.push('External request: ' + url.hostname)
      return route.abort()
    }
    const fulfill = data => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(data),
    })
    if (url.pathname === '/auth/v1/user') return fulfill(user)
    if (url.pathname === '/auth/v1/logout') return fulfill({})
    const rpc = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (rpc === 'rpc_solog_admin_bootstrap_v2') {
      calls.push({ action: 'bootstrap', payload: body.p_payload })
      const boot = bootstrapFixture()
      boot.allowed_sites = siteNames.map((nombre, i) => ({
        id: siteIds[i], nombre, operational_revision: 10,
        devices_revision: 2, incidents_revision: 4,
      }))
      return fulfill(boot)
    }
    assert.equal(rpc, 'metrics_dashboard_v1', 'RPC inesperada en Dashboard')
    const action = body.p_action, payload = body.p_payload
    calls.push({ action, payload })
    return fulfill(fixture(action, payload))
  })

  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  const count = action => calls.filter(x => x.action === action).length

  try {
    await page.goto('http://127.0.0.1:5208/admin')
    await page.getByRole('heading', { name: 'Resumen operativo por sede' }).waitFor()
    const cutervo = page.getByRole('article', { name: 'Resumen de Cutervo' })
    try {
      await cutervo.waitFor({ timeout: 7000 })
    } catch (error) {
      console.error('DASHBOARD_DIAGNOSTIC', JSON.stringify({
        bodyText: (await page.locator('body').innerText()).slice(0, 2600),
        calls, errors,
      }, null, 2))
      throw error
    }
    assert.equal(await page.locator('.solog-dash__site-card').count(), 5)
    assert.equal(count('overview'), 1)
    const huacaSummary = page.getByRole('article', { name: 'Resumen de Huaca' })
    assert.equal(await huacaSummary.locator('.solog-dash__metric-unavailable').count(), 5)
    assert.equal(await cutervo.locator('.solog-dash__metric-unavailable').count(), 0)

    await cutervo.getByRole('heading', { name: 'Ranking de riesgo' }).waitFor()
    assert.equal(count('risk'), 1)
    await cutervo.getByRole('button', { name: 'Mostrar 6 más' }).click()
    await cutervo.getByText('Grupo riesgo 8', { exact: true }).waitFor()
    assert.equal(count('risk'), 2)

    await cutervo.getByRole('tab', { name: 'Rondas' }).click()
    await cutervo.getByRole('heading', { name: 'Rondas de conteo' }).waitFor()
    await cutervo.getByText('1 h 30 min', { exact: true }).waitFor()
    assert.equal(count('rounds'), 1)
    assert.equal(await cutervo.locator('.solog-dash__round-history-table tbody tr').count(), 2)

    await cutervo.getByRole('tab', { name: 'Episodios' }).click()
    await cutervo.getByRole('heading', { name: 'Episodios de diferencias' }).waitFor()
    await cutervo.getByText('Grupo episodio', { exact: true }).waitFor()
    await cutervo.getByRole('radio', { name: 'Cerrados' }).click()
    await cutervo.getByText('Episodios cerrados durante los últimos 45 días', { exact: false }).waitFor()

    await cutervo.getByRole('tab', { name: 'Actividad' }).click()
    const matrix = cutervo.getByRole('region', { name: 'Matriz de actividad por fecha y turno' })
    await matrix.waitFor()
    assert.equal(await matrix.locator('thead th').count(), 6)
    assert.equal(await matrix.locator('thead button:disabled').count(), 1)
    assert.equal(await matrix.locator('tbody button:disabled').count(), 3)
    assert.ok(await matrix.locator('.solog-dash__activity-action--no_data:not(:disabled)').count() >= 2)
    assert.equal(count('day'), 0)
    for (const n of [10, 15, 20]) {
      await cutervo.getByRole('button', { name: 'Cargar 5 días anteriores' }).click()
      await page.waitForFunction(
        count => document.querySelector('.solog-dash__activity-table thead tr')?.children.length === count + 1,
        n,
      )
    }
    assert.equal(count('activity'), 4)
    await matrix.getByRole('button', { name: /Ver detalle del/ }).first().click()

    const drawer = page.getByRole('dialog')
    await drawer.getByRole('heading', { name: /Detalle diario/ }).waitFor()
    await drawer.getByRole('heading', { name: 'Diferencias confirmadas' }).waitFor()
    await drawer.getByText('Grupo confirmado', { exact: true }).waitFor()
    await drawer.getByRole('heading', { name: 'Observaciones físicas' }).waitFor()
    assert.equal(count('day'), 1)
    assert.equal(count('day_observations'), 1)
    await drawer.getByRole('button', { name: 'Mostrar 25 más' }).click()
    await drawer.getByText('Grupo observación 26', { exact: true }).waitFor()
    assert.equal(count('day_observations'), 2)

    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'detached' })

    // Responsive de la composición real y scroll exclusivamente dentro de tablas.
    const viewports = []
    for (const width of [1440, 1024, 850, 430]) {
      await page.setViewportSize({ width, height: 900 })
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        matrix: document.querySelector('.solog-dash__activity-scroll')?.scrollWidth ?? 0,
        matrixClient: document.querySelector('.solog-dash__activity-scroll')?.clientWidth ?? 0,
      }))
      viewports.push({ width, ...dimensions })
      assert.ok(dimensions.doc <= dimensions.viewport + 2,
        'Overflow horizontal de página (' + width + 'px): ' + JSON.stringify(dimensions))
      assert.ok(dimensions.body <= dimensions.viewport + 2,
        'Overflow horizontal del body (' + width + 'px): ' + JSON.stringify(dimensions))
    }
    await page.setViewportSize({ width: 1440, height: 960 })
    const huaca = page.getByRole('article', { name: 'Resumen de Huaca' })
    await huaca.getByRole('button', { name: /Huaca/ }).click()
    await huaca.getByRole('tab', { name: 'Riesgo' }).waitFor()
    assert.equal(await cutervo.getByRole('tab').count(), 0)
    await huaca.getByRole('button', { name: /Huaca/ }).click()
    assert.equal(await huaca.getByRole('tab').count(), 0)

    assert.deepEqual(errors, [])
    console.log(JSON.stringify({
      status: 'Dashboard V1 browser mock: PASS',
      actions: Object.fromEntries(
        ['bootstrap', 'overview', 'risk', 'rounds', 'episodes', 'activity', 'day', 'day_observations']
          .map(action => [action, count(action)]),
      ),
      productionCalls: 0,
      viewports,
    }, null, 2))
  } finally {
    await browser.close()
    await server.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runDashboardMetricsBrowser()
}
