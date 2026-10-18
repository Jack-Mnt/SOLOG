import { describe, expect, test } from 'bun:test'
import {
  validateMetricsPayload,
  validateMetricsResponse,
} from '../src/features/solog/admin/dashboard/admin.dashboard.metrics.contract'

const site = '00000000-0000-4000-8000-000000000001'
const source = (path: string) => Bun.file(path).text()

describe('Dashboard V1 — sustitución sin API legada', () => {
  test('el Shell conserva el entrypoint y el Dashboard usa su propia capa V1', async () => {
    const [page, cards, rpc, api] = await Promise.all([
      source('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx'),
      source('src/features/solog/admin/dashboard/admin.dashboard.metrics.cards.tsx'),
      source('src/features/solog/admin/dashboard/admin.dashboard.metrics.rpc.ts'),
      source('src/features/solog/api.ts'),
    ])
    expect(page).toContain('export function AdminDashboardV2()')
    expect(page).toContain("useDashboardMetrics(metrics, 'overview', {})")
    expect(page).toContain("useAdminQuery('bootstrap', {})")
    expect(page).not.toContain("useAdminQuery('dashboard_cards'")
    expect(page).not.toContain('dashboard_cards')
    expect(page).not.toContain('shift_grid')
    expect(page).not.toContain('daily_detail_bootstrap')
    expect(cards).toContain('DashboardRiskPanel')
    expect(cards).toContain('DashboardRoundsPanel')
    expect(cards).toContain('DashboardEpisodesPanel')
    expect(cards).toContain('DashboardActivityPanel')
    expect(cards).toContain('DashboardDayDrawer')
    expect(rpc).toContain("supabase.rpc('metrics_dashboard_v1'")
    expect(api).not.toContain('rpc_solog_dashboard')
  })

  test('la RPC del Dashboard V1 rechaza acciones ajenas, filtros ilegales y fechas inválidas', () => {
    expect(() => validateMetricsPayload('overview', {})).not.toThrow()
    expect(() => validateMetricsPayload('rounds', { site_id: site })).not.toThrow()
    expect(() => validateMetricsPayload('risk', { site_id: site, sort: 'value', limit: 6 })).not.toThrow()
    expect(() => validateMetricsPayload('episodes', {
      site_id: site, scope: 'closed', sort: 'recent', limit: 25,
    })).not.toThrow()
    expect(() => validateMetricsPayload('activity', {
      site_id: site, date_from: '2026-10-12', date_to: '2026-10-16',
    })).not.toThrow()
    expect(() => validateMetricsPayload('day_observations', {
      site_id: site, date: '2026-10-16', limit: 25,
    })).not.toThrow()
    expect(() => validateMetricsPayload('activity', {
      site_id: site, date_from: '2026-09-01', date_to: '2026-10-16',
    })).toThrow()
    expect(() => validateMetricsPayload('risk', {
      site_id: site, sort: 'value', limit: 101,
    })).toThrow()
    expect(() => validateMetricsPayload('episodes', {
      site_id: site, scope: 'closed', sort: 'recurrence',
    })).toThrow()
  })

  test('Rondas admite contribuciones {} solo en cortes históricos no_data reales', () => {
    const payload = { site_id: site }
    const item = {
      round: 2,
      round_from: '2026-10-08T05:00:00+00:00',
      round_to: '2026-10-16T05:00:00+00:00',
      period_from: '2026-10-01',
      period_to: '2026-10-15',
      coverage: { counted: null, required: null, percent: null },
      milestones: { '50': null, '90': null, '100': null },
      historical_accuracy: {
        green: null, red: null, exempt: null,
        without_evidence: null, denominator: null, percent: null,
      },
      shift_contributions: {},
      closed_at: '2026-10-16T05:00:00+00:00',
      quality: 'no_data',
      cut_version: 1,
    }
    const response = {
      contract_version: 1, generated_at: '2026-10-17T10:00:00-05:00',
      action: 'rounds', source: 'metrics_dashboard_v1', quality: 'partial',
      data: { site_id: site, current: null, period_rounds: [], history: [item] },
    }
    expect(validateMetricsResponse('rounds', payload, response).data.history[0].shift_contributions)
      .toEqual({})
    expect(() => validateMetricsResponse('rounds', payload, {
      ...response,
      data: { ...response.data, history: [{ ...item, quality: 'complete' }] },
    })).toThrow()
    expect(() => validateMetricsResponse('rounds', payload, {
      ...response,
      data: { ...response.data, history: [{ ...item, quality: 'partial' }] },
    })).toThrow()
    const { shift_contributions: _omitted, ...withoutField } = item
    expect(() => validateMetricsResponse('rounds', payload, {
      ...response,
      data: { ...response.data, history: [withoutField] },
    })).toThrow()
  })

  test('day exige confirmaciones completas y no acepta shape/versión incompatibles', () => {
    const payload = { site_id: site, date: '2026-10-16' }
    const example = {
      contract_version: 1,
      generated_at: '2026-10-16T12:00:00-05:00',
      source: 'metrics_dashboard_v1',
      action: 'day',
      quality: 'partial',
      data: {
        site_id: site,
        date: '2026-10-16',
        physical_activity: { groups_observed: 0, counts: 0, recounts: 0 },
        episodes: { opened: 0, closed: 0, open_at_day_end: 0 },
        confirmed_differences: [],
        confirmed_total: 0,
        confirmed_next_cursor: null,
        observations_initial_cursor: null,
        quality: 'partial',
      },
    }
    expect(validateMetricsResponse('day', payload, example).data.confirmed_total).toBe(0)
    expect(() => validateMetricsResponse('day', payload, {
      ...example, contract_version: 2,
    })).toThrow()
    expect(() => validateMetricsResponse('day', payload, {
      ...example, data: { ...example.data, confirmed_total: 1 },
    })).toThrow()
  })
})
