import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

test('flush V3 adopta mutaciones incrementales y sincroniza finish confirmado', () => {
  const source = readFileSync('src/features/solog/cajero/cajero.flush.ts', 'utf8')
  expect(source).toContain("this.store.mutate(action, { items: batch.items })")
  expect(source).toContain('this.store.synchronizeAfterFinish()')
  expect(source).not.toContain('response.state')
})
