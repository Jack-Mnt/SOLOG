import type { SologBatchCountView, SologCountView } from '../types'

export interface SologSelectedView {
  vista: SologCountView
  categoriaId?: string
  title: string
}

const TITLES: Record<Exclude<SologCountView, 'categoria'>, string> = {
  stock_cero: 'Stock 0',
  cambios_recientes: 'Cambios recientes',
  stock_negativo: 'Stock negativo',
  contar_detalladamente: 'Contar detalladamente',
}

export function createCountRoute(view: SologSelectedView): string {
  const params = new URLSearchParams({ view: view.vista, title: view.title })
  if (view.categoriaId) params.set('id', view.categoriaId)
  return `/count?${params.toString()}`
}

export function readSelectedView(): SologSelectedView | null {
  const params = new URLSearchParams(window.location.search)
  const vista = params.get('view')
  if (
    vista !== 'categoria' &&
    vista !== 'stock_cero' &&
    vista !== 'cambios_recientes' &&
    vista !== 'stock_negativo' &&
    vista !== 'contar_detalladamente'
  ) {
    return null
  }
  const categoriaId = params.get('id') ?? undefined
  if (vista === 'categoria' && !categoriaId) return null
  const fallback = vista === 'categoria' ? 'Categoría' : TITLES[vista]
  return { vista, categoriaId, title: params.get('title') ?? fallback }
}

export function isBatchView(view: SologCountView): view is SologBatchCountView {
  return view !== 'contar_detalladamente'
}
