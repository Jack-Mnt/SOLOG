// Validación runtime del contrato Dashboard RPC V1; deliberadamente fuera de admin.v2.ts.
// Fuente de verdad: docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md
import type { MetricsAction, MetricsPayloads, MetricsResponses } from './admin.dashboard.metrics.types'

type JsonObject = Record<string, unknown>
const isObject = (v: unknown): v is JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nFinite = (v: unknown): boolean => v === null || finite(v)
const nInteger = (v: unknown): boolean => v === null || integer(v)
const nNonnegative = (v: unknown): boolean => v === null || nonnegative(v)
const bool = (v: unknown): v is boolean => typeof v === 'boolean'
const isoTime = (v: unknown): v is string => isText(v) && Number.isFinite(Date.parse(v))
const nTime = (v: unknown): boolean => v === null || isoTime(v)
const oneOf = (v: unknown, options: readonly string[]): boolean => isText(v) && options.includes(v)
const quality = (v: unknown): boolean => oneOf(v, ['complete', 'partial', 'no_data'])
const movement = (v: unknown): boolean => oneOf(v, ['complete', 'partial', 'insufficient'])
const riskLevel = (v: unknown): boolean => v === null ||
  oneOf(v, ['bajo', 'medio_bajo', 'medio', 'medio_alto', 'alto', 'muy_alto'])
const shift = (v: unknown): boolean => oneOf(v, ['early', 'day', 'night'])
const arrayOf = (v: unknown, predicate: (item: unknown) => boolean, max = 10000): v is unknown[] =>
  Array.isArray(v) && v.length <= max && v.every(predicate)
const all = (v: unknown, fields: Record<string, (x: unknown) => boolean>): v is JsonObject =>
  isObject(v) && Object.entries(fields).every(([key, check]) => check(v[key]))
const dateOnly = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
}
const id = (v: unknown): boolean => isText(v) && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
const nCursor = (v: unknown): boolean => v === null || typeof v === 'string' && v.length > 0 &&
  v.length <= 2048 && /^[A-Za-z0-9+/=]+$/.test(v)
const money = (v: unknown): boolean => all(v, { groups: nonnegative, value: nFinite, quality })
const coverage = (v: unknown): boolean => all(v, { counted: nNonnegative, required: nNonnegative, percent: nFinite })
const historicalAccuracy = (v: unknown): boolean => v === null || all(v, {
  green: nNonnegative, red: nNonnegative, exempt: nNonnegative,
  without_evidence: nNonnegative, denominator: nNonnegative, percent: nFinite,
})
const round = (v: unknown): boolean => all(v, {
  round_from: isoTime, round_to: isoTime, period_from: dateOnly, period_to: dateOnly,
  round: (x) => x === 1 || x === 2, coverage,
  milestones: (x) => all(x, { '50': nTime, '90': nTime, '100': nTime }),
  historical_accuracy: historicalAccuracy,
  shift_contributions: (x) => all(x, { early: nNonnegative, day: nNonnegative, night: nNonnegative }),
  closed_at: nTime, quality, cut_version: nNonnegative,
})
const riskRow = (v: unknown): boolean => all(v, {
  group_id: id, group_name: isText, difference: integer, confirmed_value: nFinite,
  level: riskLevel, movement_quality: movement, risk_available: bool,
})
const episodeRow = (v: unknown): boolean => all(v, {
  episode_id: id, group_id: id, group_name: isText,
  opened_at: isoTime, closed_at: nTime, recurrences_45d: nonnegative,
  duration_hours: finite, risk_level: riskLevel,
  risk_status: (x) => oneOf(x, ['available', 'pending_confirmation', 'not_available']),
})
const activityCell = (v: unknown): boolean => all(v, {
  date: dateOnly, turno: shift,
  status: (x) => oneOf(x, ['in_progress', 'closed', 'no_tasks', 'no_data']),
  completed: nNonnegative, required: nNonnegative, percent: nFinite,
  breakdown: (x) => all(x, {
    round_coverage: nonnegative, review_for_coverage: nonnegative,
    review_regular: nonnegative, shift_coverage: nonnegative,
  }),
  quality,
}) && (
  // La ausencia de fila analítica nunca debe convertirse en «Sin tareas».
  v.status !== 'no_data' || v.completed === null && v.required === null && v.percent === null
) && (v.required !== 0 || v.percent === null)
const observation = (v: unknown): boolean => all(v, {
  observation_id: id, group_id: id, group_name: isText,
  kind: (x) => oneOf(x, ['normal', 'recount']),
  observed_at: isoTime, theoretical: integer, physical: integer,
  physical_difference: integer,
  result: (x) => oneOf(x, ['Coincide', 'Recontar', 'Confirmada', 'Inconsistente']),
})
const confirmed = (v: unknown): boolean => all(v, {
  group_id: id, group_name: isText, recounted_at: isoTime,
  difference: integer, frozen_value: nFinite,
})
const site = (v: unknown): boolean => all(v, {
  site_id: id, site_name: isText,
  round: (x) => all(x, {
    period_from: dateOnly, round: (r) => r === 1 || r === 2,
    counted: nNonnegative, required: nNonnegative, percent: nFinite, quality,
  }),
  accuracy: (x) => all(x, {
    green: nonnegative, yellow: nonnegative, red: nonnegative, exempt_zero_zero: nonnegative,
    without_evidence: nonnegative, universe: nonnegative, denominator: nonnegative,
    green_percent: nFinite, yellow_percent: nFinite, red_percent: nFinite, quality,
  }) && x.green + x.yellow + x.red + x.exempt_zero_zero + x.without_evidence === x.universe &&
    x.denominator === x.green + x.yellow + x.red,
  surplus: money, shortage: money,
  risk: (x) => all(x, { high: nonnegative, very_high: nonnegative, quality }),
})
function verifyData(action: MetricsAction, data: unknown, payload: MetricsPayloads[MetricsAction]): boolean {
  if (!isObject(data)) return false
  const requestedSite = 'site_id' in payload ? payload.site_id : null
  if (action !== 'overview' && data.site_id !== requestedSite) return false
  switch (action) {
    case 'overview':
      return arrayOf(data.sites, site, 50) &&
        new Set(data.sites.map(s => (s as JsonObject).site_id)).size === data.sites.length
    case 'rounds':
      return (data.current === null || round(data.current)) &&
        arrayOf(data.period_rounds, round, 4) && arrayOf(data.history, round, 6)
    case 'risk':
      return data.sort === ('sort' in payload ? payload.sort ?? 'risk' : 'risk') &&
        arrayOf(data.rows, riskRow, ('limit' in payload ? payload.limit ?? 6 : 6)) &&
        nCursor(data.next_cursor) && nonnegative(data.total)
    case 'episodes': {
      const scope = 'scope' in payload ? payload.scope ?? 'open' : 'open'
      const sort = 'sort' in payload ? payload.sort ?? (scope === 'open' ? 'importance' : 'recent') : 'importance'
      return data.scope === scope && data.sort === sort &&
        arrayOf(data.rows, episodeRow, ('limit' in payload ? payload.limit ?? 25 : 25)) &&
        nCursor(data.next_cursor) && nonnegative(data.total)
    }
    case 'activity': {
      const p = payload as MetricsPayloads['activity']
      if (data.date_from !== p.date_from || data.date_to !== p.date_to) return false
      const n = Math.round((Date.parse(p.date_to) - Date.parse(p.date_from)) / 86400000) + 1
      return arrayOf(data.cells, activityCell, n * 3) && data.cells.length === n * 3 &&
        new Set(data.cells.map(c => { const row = c as JsonObject; return row.date + ':' + row.turno })).size === n * 3
    }
    case 'day': {
      const p = payload as MetricsPayloads['day']
      return data.date === p.date &&
        all(data.physical_activity, { groups_observed: nonnegative, counts: nonnegative, recounts: nonnegative }) &&
        all(data.episodes, { opened: nonnegative, closed: nonnegative, open_at_day_end: nonnegative }) &&
        arrayOf(data.confirmed_differences, confirmed, 20000) &&
        nonnegative(data.confirmed_total) && data.confirmed_total === data.confirmed_differences.length &&
        data.confirmed_next_cursor === null && data.observations_initial_cursor === null && quality(data.quality)
    }
    case 'day_observations': {
      const p = payload as MetricsPayloads['day_observations']
      return data.date === p.date && arrayOf(data.rows, observation, p.limit ?? 25) &&
        nCursor(data.next_cursor)
    }
    default: return false
  }
}

export class DashboardMetricsContractError extends Error {
  constructor(message = 'Respuesta del Dashboard incompatible con el contrato V1.') {
    super(message)
    this.name = 'DashboardMetricsContractError'
  }
}

export function validateMetricsPayload<A extends MetricsAction>(
  action: A, payload: MetricsPayloads[A],
): void {
  if (!isObject(payload)) throw new DashboardMetricsContractError('Solicitud del Dashboard inválida.')
  const allowed: Record<MetricsAction, readonly string[]> = {
    overview: [], rounds: ['site_id'], risk: ['site_id', 'sort', 'limit', 'cursor'],
    episodes: ['site_id', 'scope', 'sort', 'limit', 'cursor'],
    activity: ['site_id', 'date_from', 'date_to'], day: ['site_id', 'date'],
    day_observations: ['site_id', 'date', 'limit', 'cursor'],
  }
  if (!allowed[action] || Object.keys(payload).some(k => !allowed[action].includes(k))) {
    throw new DashboardMetricsContractError('La solicitud contiene parámetros no permitidos.')
  }
  if (action === 'overview') return
  const p = payload as JsonObject
  if (!id(p.site_id)) throw new DashboardMetricsContractError('La sede del Dashboard no es válida.')
  if (action === 'risk' || action === 'episodes' || action === 'day_observations') {
    if (p.limit !== undefined && (!integer(p.limit) || p.limit < 1 || p.limit > 100)) {
      throw new DashboardMetricsContractError('Límite de resultados inválido (1–100).')
    }
    if (p.cursor !== undefined && !nCursor(p.cursor)) {
      throw new DashboardMetricsContractError('El cursor no es válido. Vuelve a la primera página.')
    }
  }
  if (action === 'risk' && p.sort !== undefined && !oneOf(p.sort, ['risk', 'value', 'difference'])) {
    throw new DashboardMetricsContractError('El orden del ranking no es válido.')
  }
  if (action === 'episodes') {
    const scope = p.scope ?? 'open'
    const sort = p.sort ?? (scope === 'open' ? 'importance' : 'recent')
    if (!oneOf(scope, ['open', 'closed']) ||
      !oneOf(sort, scope === 'open' ? ['importance', 'recurrence', 'persistence'] : ['recent'])) {
      throw new DashboardMetricsContractError('Los filtros de Episodios no son compatibles.')
    }
  }
  if (action === 'activity') {
    if (!dateOnly(p.date_from) || !dateOnly(p.date_to) || p.date_from > p.date_to ||
      (Date.parse(p.date_to) - Date.parse(p.date_from)) / 86400000 >= 31) {
      throw new DashboardMetricsContractError('El rango de Actividad debe abarcar de 1 a 31 días.')
    }
  }
  if ((action === 'day' || action === 'day_observations') && !dateOnly(p.date)) {
    throw new DashboardMetricsContractError('La fecha del detalle diario no es válida.')
  }
}

export function validateMetricsResponse<A extends MetricsAction>(
  action: A, payload: MetricsPayloads[A], raw: unknown,
): MetricsResponses[A] {
  if (!all(raw, {
    contract_version: (v) => v === 1, generated_at: isoTime,
    action: (v) => v === action, source: (v) => v === 'metrics_dashboard_v1', quality,
    data: isObject,
  }) || !verifyData(action, raw.data, payload)) {
    throw new DashboardMetricsContractError()
  }
  return raw as unknown as MetricsResponses[A]
}
