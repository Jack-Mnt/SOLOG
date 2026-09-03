// Ejecutar con node tests/index-phase1.browser.mjs.
// Playwright externo mediante SOLOG_PLAYWRIGHT_MODULE; no instala dependencias.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const { chromium } = await import(process.env.SOLOG_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href
  : 'playwright')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5205, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-index.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  },
})
await server.listen()

const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER
    ? { executablePath: process.env.SOLOG_TEST_BROWSER }
    : {}),
})
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const externalRequests = []
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url())
  if (url.hostname === '127.0.0.1') return route.continue()
  externalRequests.push(url.href)
  return route.abort()
})

const page = await context.newPage()
page.setDefaultTimeout(10000)

try {
  await page.goto('http://127.0.0.1:5205/')
  await page.getByRole('heading', { name: /Control inteligente/ }).waitFor()
  await page.waitForLoadState('networkidle')

  const loginLinks = page.getByRole('link', { name: 'Iniciar sesión' })
  assert.equal(await loginLinks.count(), 3)
  for (let index = 0; index < 3; index += 1) {
    assert.equal(await loginLinks.nth(index).getAttribute('href'), '/login')
  }

  assert.deepEqual(externalRequests, [])
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  )
  assert.equal(
    resources.some(
      (url) => url.includes('protected-app') || url.includes('/features/solog/api'),
    ),
    false,
  )
  console.log('PASS / es pública, tiene un único destino y ejecuta cero llamadas Supabase')
} finally {
  await context.close()
  await browser.close()
  await server.close()
}
