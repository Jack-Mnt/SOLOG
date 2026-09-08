import type { ControlGroupItem, DifferenceState, StateSummary } from '../admin.v2'

// V10: count the complete dataset; never re-evaluate the backend's classifications.
export function controlView(items: ControlGroupItem[], state: DifferenceState | '', search: string, page: number) {
  const summary: StateSummary = { total: items.length, coincide: 0, pending_recount: 0, confirmed: 0, inconsistent: 0 }
  const keys = { Coincide: 'coincide', Recontar: 'pending_recount', Confirmada: 'confirmed', Inconsistente: 'inconsistent' } as const
  for (const item of items) summary[keys[item.state]]++
  const term = search.trim().toLocaleLowerCase('es-PE')
  const filtered = items.filter(item => (!state || item.state === state) && item.group_name.toLocaleLowerCase('es-PE').includes(term))
  return { summary, total: filtered.length, rows: filtered.slice(page * 100, (page + 1) * 100) }
}
