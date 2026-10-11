import { test, expect } from '@playwright/test'

const path = '/tests/browser/recovery-harness.html'
const diagnostic = async page => page.evaluate(() => {
  const ctx = window.__recoveryTest
  return {
    calls: ctx.requests.map(item => ({ name: item.name, payload: item.payload })),
    recoveryCount: ctx.store.getSnapshot().recovery_sessions.length,
    closeState: ctx.runtime.getSnapshot().closeState,
    pending: ctx.runtime.pendingCount,
  }
})

test('sin scope: cierra recovery, confirma estado y desbloquea inicio', async ({ page }) => {
  await page.goto(path)
  await expect.poll(async () => (await diagnostic(page)).closeState).toBe('finished')
  const data = await diagnostic(page)
  expect(data.calls).toHaveLength(1)
  expect(data.calls[0].name).toBe('rpc_solog_cashier_orphan_finish_v1')
  expect(data.calls[0].payload.expected_groups_revision).toBeUndefined()
  expect(data.recoveryCount).toBe(0)
  expect(data.pending).toBe(0)
  await expect(page.getByRole('button', { name: /empezar|iniciar/i }).first()).toBeEnabled()
})

test('timeout: no reintenta automáticamente, CTA reintenta con mismo operation_id', async ({ page }) => {
  await page.goto(path + '?scenario=retry')
  await expect.poll(async () => (await diagnostic(page)).closeState).toBe('uncertain')
  const before = await diagnostic(page)
  expect(before.calls).toHaveLength(1)
  await page.getByRole('button', { name: /reintentar/i }).click()
  await expect.poll(async () => (await diagnostic(page)).closeState).toBe('finished')
  const after = await diagnostic(page)
  expect(after.calls).toHaveLength(2)
  expect(after.calls[1].payload).toEqual(after.calls[0].payload)
})

test('bloqueo backend: no cierra ni habilita iniciar conteo', async ({ page }) => {
  await page.goto(path + '?scenario=blocked')
  await expect.poll(async () => (await diagnostic(page)).closeState).toBe('uncertain')
  const data = await diagnostic(page)
  expect(data.recoveryCount).toBe(1)
  expect(data.calls).toHaveLength(1)
  await expect(page.getByRole('button', { name: /empezar|iniciar/i }).first()).toBeDisabled()
  await expect(page.getByText(/No hay datos locales recuperables/i)).toBeVisible()
})
