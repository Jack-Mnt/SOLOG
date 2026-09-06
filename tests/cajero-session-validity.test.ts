import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import {
  CAJERO_STOCK_COUNTDOWN_START_MS,
  CAJERO_STOCK_NEAR_LIMIT_MS,
  CAJERO_STOCK_UPDATED_LIMIT_MS,
  getCajeroStartRestriction,
  getCajeroStockPresentation,
} from '../src/features/solog/cajero/cajero.stock'
import type { SologActiveSession, SologStockState } from '../src/features/solog/types'

const referenceNow = Date.parse('2026-09-01T15:00:00.000Z')

function stockAtElapsed(elapsedMs: number, overrides: Partial<SologStockState> = {}): SologStockState {
  const snapshotAt = referenceNow - elapsedMs
  return {
    disponible: true,
    snapshot_id: 'snapshot-1',
    snapshot_at: new Date(snapshotAt).toISOString(),
    confirmado_at: new Date(snapshotAt).toISOString(),
    vigente: true,
    snapshot_expira_at: new Date(snapshotAt + 2 * 60 * 60 * 1000).toISOString(),
    segundos_restantes: Math.max(0, Math.floor((2 * 60 * 60 * 1000 - elapsedMs) / 1000)),
    puede_iniciar_conteo: elapsedMs < 115 * 60 * 1000,
    ...overrides,
  } as SologStockState
}

function activeSession(expirationMs: number): SologActiveSession {
  return {
    id: 'count-1',
    iniciado_at: new Date(referenceNow - 30 * 60 * 1000).toISOString(),
    expira_at: new Date(expirationMs).toISOString(),
    grupos_guardados: 0,
  }
}

describe('vigencia temporal de stock y sesión', () => {
  test('respeta los límites exactos de 30 min, 1:30 h y 1:50 h', () => {
    expect(getCajeroStockPresentation(stockAtElapsed(30 * 60 * 1000), null, referenceNow).label)
      .toBe('Stock actualizado')
    expect(getCajeroStockPresentation(stockAtElapsed(CAJERO_STOCK_UPDATED_LIMIT_MS), null, referenceNow).label)
      .toBe('Stock actualizado')
    expect(getCajeroStockPresentation(stockAtElapsed(CAJERO_STOCK_UPDATED_LIMIT_MS + 1), null, referenceNow).label)
      .toBe('Stock próximo a vencer')
    expect(getCajeroStockPresentation(stockAtElapsed(CAJERO_STOCK_NEAR_LIMIT_MS), null, referenceNow).label)
      .toBe('Stock próximo a vencer')
  })

  test('después de 1:50 y antes de 1:57 muestra a punto de vencer', () => {
    expect(getCajeroStockPresentation(stockAtElapsed(CAJERO_STOCK_NEAR_LIMIT_MS + 1), null, referenceNow).label)
      .toBe('Stock a punto de vencer')
    expect(getCajeroStockPresentation(stockAtElapsed(CAJERO_STOCK_COUNTDOWN_START_MS - 1), null, referenceNow).label)
      .toBe('Stock a punto de vencer')
  })

  test('a 1:57 usa countdown solo con sesión activa y deriva 01:55', () => {
    const stock = stockAtElapsed(CAJERO_STOCK_COUNTDOWN_START_MS)
    const session = activeSession(referenceNow + 115_000)
    const withSession = getCajeroStockPresentation(stock, session, referenceNow)
    expect(withSession.state).toBe('countdown')
    expect(withSession.countdown).toBe('01:55')
    expect(getCajeroStockPresentation(stock, null, referenceNow).state).toBe('critical')
  })

  test('stock vencido y cinco minutos exactos bloquean un inicio', () => {
    expect(getCajeroStartRestriction(stockAtElapsed(2 * 60 * 60 * 1000, {
      vigente: false,
      puede_iniciar_conteo: false,
    }), referenceNow)).toBe('stock_expired')
    expect(getCajeroStartRestriction(stockAtElapsed(115 * 60 * 1000, {
      puede_iniciar_conteo: false,
    }), referenceNow)).toBe('stock_too_close')
  })

  test('el reloj local del countdown no importa APIs ni realiza polling a Supabase', async () => {
    const source = await readFile(
      new URL('../src/features/solog/cajero/cajero.stock.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('setInterval')
    expect(source).not.toMatch(/getSolog|supabase|rpc_solog|fetch\(/)
  })
})
